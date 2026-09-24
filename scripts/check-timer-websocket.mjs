#!/usr/bin/env node
// Verifies the timer WebSocket end to end through a deployed-shaped URL (a
// proxy, Cloudflare, or the API itself). Requires Node 22+ for the built-in
// WebSocket.
//
//   node scripts/check-timer-websocket.mjs <base-url> [--round-trip] [--idle-seconds=N]
//
// Without --round-trip it needs no account: it opens /ws/timers with the
// browser's Origin, sends an invalid AUTH message, and expects the API to close
// the socket with 1008 (policy violation). Only the Spring handler does that; a
// proxy that serves the web app instead cannot upgrade, and a rejected origin
// fails the handshake, so both fail this check.
//
// With --round-trip it signs in (TIMER_WS_EMAIL/TIMER_WS_PASSWORD, or a newly
// registered disposable account), waits for READY, starts and stops a timer
// over HTTP, and expects both TIMER_STATE snapshots on the socket. With
// --idle-seconds it then leaves the socket quiet for that long and fails if
// anything on the way (such as Cloudflare's ~100 second idle cutoff) closes it.
const args = process.argv.slice(2);
const baseArg = args.find((arg) => !arg.startsWith("--"));
const roundTrip = args.includes("--round-trip");
const idleSeconds = Number(
  args.find((arg) => arg.startsWith("--idle-seconds="))?.split("=")[1] || 0,
);
if (!baseArg || Number.isNaN(idleSeconds)) {
  console.error(
    "Usage: node scripts/check-timer-websocket.mjs <base-url> [--round-trip] [--idle-seconds=N]",
  );
  process.exit(2);
}
if (typeof WebSocket !== "function") {
  console.error("Timer WebSocket check requires Node 22 or newer");
  process.exit(2);
}

const base = new URL(baseArg);
const socketUrl = new URL("/ws/timers", base);
socketUrl.protocol = base.protocol === "https:" ? "wss:" : "ws:";
const timeoutMs = 15_000;

function fail(message) {
  console.error(`Timer WebSocket check failed (${socketUrl}): ${message}`);
  process.exit(1);
}

// Opens the socket and turns its events into awaitable steps.
function connect() {
  const socket = new WebSocket(socketUrl, { headers: { Origin: base.origin } });
  const messages = [];
  const waiters = [];
  let closed;
  const settle = () => {
    for (const waiter of [...waiters]) waiter();
  };
  socket.onmessage = (event) => {
    try {
      messages.push(JSON.parse(event.data));
    } catch {
      messages.push({ type: "UNPARSEABLE", data: String(event.data) });
    }
    settle();
  };
  socket.onclose = (event) => {
    closed = { code: event.code, reason: event.reason };
    settle();
  };
  const until = (predicate, description, ms = timeoutMs) =>
    new Promise((resolve, reject) => {
      const check = () => {
        let value;
        try {
          value = predicate();
        } catch (error) {
          clearTimeout(timer);
          waiters.splice(waiters.indexOf(check), 1);
          reject(error);
          return;
        }
        if (value === undefined) return;
        clearTimeout(timer);
        waiters.splice(waiters.indexOf(check), 1);
        resolve(value);
      };
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(check), 1);
        reject(new Error(`timed out after ${ms}ms waiting for ${description}`));
      }, ms);
      waiters.push(check);
      check();
    });
  const opened = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () =>
      reject(
        new Error(
          "the WebSocket upgrade failed (is /ws/* routed to the API, and is this origin allowed?)",
        ),
      );
  });
  const nextMessage = (description, predicate) =>
    until(() => {
      if (closed)
        throw new Error(`socket closed (${closed.code}) while waiting for ${description}`);
      const index = messages.findIndex(predicate);
      return index === -1 ? undefined : messages.splice(index, 1)[0];
    }, description);
  return {
    socket,
    opened,
    nextMessage,
    closedWith: (description) => until(() => closed, description),
    isClosed: () => closed,
  };
}

async function api(path, init = {}, token) {
  const response = await fetch(new URL(`/api/v1${path}`, base), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) fail(`${init.method || "GET"} ${path} returned ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function signIn() {
  const email = process.env.TIMER_WS_EMAIL;
  const password = process.env.TIMER_WS_PASSWORD;
  if (email && password) {
    return (await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }))
      .token;
  }
  const disposable = {
    email: `timer-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: `Timer-ws-${crypto.randomUUID()}`,
  };
  return (await api("/auth/register", { method: "POST", body: JSON.stringify(disposable) }))
    .token;
}

async function checkRouting() {
  const probe = connect();
  await probe.opened;
  probe.socket.send(JSON.stringify({ type: "AUTH", token: "not-a-valid-token" }));
  const closed = await probe.closedWith("the API to reject an invalid AUTH message");
  if (closed.code !== 1008)
    fail(`expected the API to close with 1008 after an invalid AUTH, got ${closed.code}`);
}

async function checkRoundTrip() {
  const token = await signIn();
  const current = await api("/timers/current", {}, token);
  if (current) fail("the probe account already has a running timer; stop it first");
  const probe = connect();
  await probe.opened;
  probe.socket.send(JSON.stringify({ type: "AUTH", token }));
  await probe.nextMessage("READY", (message) => message.type === "READY");
  const started = await api(
    "/timers",
    { method: "POST", body: JSON.stringify({ labelIds: [], description: "Timer WebSocket check" }) },
    token,
  );
  try {
    await probe.nextMessage(
      "the started timer's TIMER_STATE",
      (message) => message.type === "TIMER_STATE" && message.timer?.id === started.id,
    );
  } finally {
    // Never leave the probe account's timer running, even when the socket
    // check fails. A stop under two seconds discards the session.
    await api("/timers/stop", { method: "POST", body: "{}" }, token);
  }
  await probe.nextMessage(
    "the stopped timer's TIMER_STATE",
    (message) => message.type === "TIMER_STATE" && message.timer === null,
  );
  if (idleSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, idleSeconds * 1000));
    const closed = probe.isClosed();
    if (closed)
      fail(`an idle authenticated socket was closed (${closed.code}) within ${idleSeconds}s`);
  }
  probe.socket.close(1000, "done");
}

try {
  await checkRouting();
  if (roundTrip) await checkRoundTrip();
} catch (error) {
  fail(error.message);
}
console.log(
  `Timer WebSocket check passed (${socketUrl}${roundTrip ? ", round trip" : ""}${
    idleSeconds ? `, idle ${idleSeconds}s` : ""
  })`,
);
process.exit(0);
