async function googleConnect(response) {
  if (!response || typeof response.credential !== "string") return;

  const config = document.getElementById("google-connect-config");
  const csrfToken = config?.dataset.csrfToken ?? "";

  try {
    const result = await fetch("/connect/openai/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrfToken,
      },
      body: JSON.stringify({ idToken: response.credential }),
    });

    if (!result.ok) {
      window.alert("Could not sign in with Google. Use an account already linked to Knowledge Base.");
      return;
    }

    const data = await result.json();
    navigateToContinuation(data.authorizationUrl);
  } catch {
    window.alert("Could not complete Google sign-in. Try again or use email and password.");
  }
}

function navigateToContinuation(value) {
  const destination = new URL(value, window.location.origin);
  if (destination.origin !== window.location.origin
      || !["/", "/oauth2/authorize", "/connect/openai/login"].includes(destination.pathname)) {
    throw new Error("The sign-in continuation is invalid.");
  }
  window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
}

function initializePasswordConnect() {
  const form = document.getElementById("openai-login-form");
  const submit = form?.querySelector("button[type=submit]");
  const error = document.getElementById("openai-login-error");
  if (!form || !submit || !error) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    error.textContent = "";
    submit.disabled = true;
    submit.classList.add("is-loading");
    submit.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(form.getAttribute("action"), {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams(new FormData(form)),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = response.ok ? await response.json() : null;
      if (!response.ok) {
        error.textContent = data?.detail || "Could not sign in. Check your details and try again.";
        error.hidden = false;
        return;
      }
      navigateToContinuation(data?.authorizationUrl);
    } catch {
      error.textContent = "Could not continue sign-in. Please try again.";
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-loading");
      submit.removeAttribute("aria-busy");
    }
  });
}

function initializeGoogleConnect() {
  const config = document.getElementById("google-connect-config");
  const button = document.getElementById("google-connect-button");
  if (!config || !button || !window.google) return;
  window.google.accounts.id.initialize({
    client_id: config.dataset.clientId,
    callback: googleConnect,
  });
  window.google.accounts.id.renderButton(button, { theme: "outline", size: "large", width: Math.min(320, button.clientWidth || 320) });
}

initializePasswordConnect();

if (window.google) {
  initializeGoogleConnect();
} else {
  document.getElementById("google-gsi-client")?.addEventListener("load", initializeGoogleConnect, { once: true });
}
