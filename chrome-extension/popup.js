const $ = (id) => document.getElementById(id);
const defaultApi = "http://localhost:8080/api/v1";
let currentTimer = null;
let timerTicker = null;
const timerSelectionKey = "timerSelection";

function showTimer(timer) {
  currentTimer = timer;
  $("status").textContent = KnowCore.timerStatus(timer);
  if (timerTicker) clearInterval(timerTicker);
  timerTicker = timer
    ? setInterval(() => {
        $("status").textContent = KnowCore.timerStatus(currentTimer);
      }, 1000)
    : null;
}

async function request(path, options = {}) {
  const { token, apiBase } = await chrome.storage.local.get([
    "token",
    "apiBase",
  ]);
  const r = await fetch((apiBase || defaultApi) + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token || ""}`,
    },
  });
  if (r.status === 401 && token) {
    await chrome.storage.local.remove(["token", "activeTimer"]);
    location.reload();
    throw Error("Session expired");
  }
  if (!r.ok) throw Error((await r.text()) || "Request failed");
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
function fillOptions(select, placeholder, values) {
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.append(empty);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value.id;
    option.textContent = value.name || value.title;
    select.append(option);
  });
}

function timerSelection(timer) {
  return {
    pathId: timer?.pathId || "",
    itemId: timer?.itemId || timer?.itemIds?.[0] || "",
    description: timer?.description || "",
  };
}

async function persistTimerSelection() {
  await chrome.storage.local.set({
    [timerSelectionKey]: {
      pathId: $("path").value,
      itemId: $("item").value,
      description: $("description").value,
    },
  });
}

function hasOption(select, value) {
  return value && Array.from(select.options).some((option) => option.value === value);
}

async function restoreTimerSelection(selection) {
  const path = $("path");
  const item = $("item");
  const saved = selection || {};

  path.value = hasOption(path, saved.pathId) ? saved.pathId : "";
  path.onchange();
  item.value = hasOption(item, saved.itemId) ? saved.itemId : "";
  $("description").value = saved.description || "";
  await persistTimerSelection();
}

async function load() {
  try {
    const { activeTimer, timerSelection: savedSelection } =
      await chrome.storage.local.get(["activeTimer", timerSelectionKey]);
    const paths = await request("/paths");
    const items = await request("/items");
    const timer = await request("/timers/current");
    const selectedItemId =
      timer?.itemId || timer?.itemIds?.[0] || savedSelection?.itemId;
    fillOptions($("path"), "Select a path", KnowCore.activePaths(paths));
    $("path").onchange = () =>
      fillOptions(
        $("item"),
        "Select an item (optional)",
        KnowCore.itemsForPath(items, $("path").value, selectedItemId),
      );
    $("path").onchange();
    if (timer) {
      showTimer(timer);
      $("toggle").textContent = "Stop timer";
      await chrome.storage.local.set({ activeTimer: timer });
      await restoreTimerSelection(timerSelection(timer));
    } else {
      showTimer(null);
      $("toggle").textContent = "Start timer";
      await chrome.storage.local.remove("activeTimer");
      await restoreTimerSelection(savedSelection || timerSelection(activeTimer));
    }
    $("auth").hidden = true;
    $("workspace").hidden = false;
  } catch (e) {
    $("error").textContent = "Sign in failed or the API is unavailable.";
  }
}
async function login() {
  try {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("email").value,
        password: $("password").value,
      }),
    });
    await chrome.storage.local.set({ token: result.token });
    $("error").textContent = "";
    await load();
  } catch (e) {
    $("error").textContent = "Invalid credentials.";
  }
}
$("login").onclick = login;
$("logout").onclick = async () => {
  await chrome.storage.local.clear();
  location.reload();
};
$("toggle").onclick = async () => {
  try {
    const current = await request("/timers/current");
    if (KnowCore.timerIsRunning(current)) {
      await request("/timers/stop", { method: "POST", body: "{}" });
      await chrome.storage.local.remove("activeTimer");
      showTimer(null);
      $("toggle").textContent = "Start timer";
    } else {
      const timer = await request("/timers", {
        method: "POST",
        body: JSON.stringify(
          KnowCore.timerStartPayload(
            $("path").value,
            $("item").value,
            $("description").value,
          ),
        ),
      });
      await persistTimerSelection();
      await chrome.storage.local.set({ activeTimer: timer });
      showTimer(timer);
      $("toggle").textContent = "Stop timer";
    }
  } catch (e) {
    $("error").textContent = "Could not update timer.";
  }
};
$("path").onchange = persistTimerSelection;
$("item").onchange = persistTimerSelection;
$("description").oninput = persistTimerSelection;
chrome.storage.local.get("token").then(({ token }) => {
  if (token) load();
});
$("options").onclick = () => chrome.runtime.openOptionsPage();
