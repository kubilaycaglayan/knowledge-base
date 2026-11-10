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
    window.location.href = data.authorizationUrl;
  } catch {
    window.alert("Could not complete Google sign-in. Try again or use email and password.");
  }
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

if (window.google) {
  initializeGoogleConnect();
} else {
  document.getElementById("google-gsi-client")?.addEventListener("load", initializeGoogleConnect, { once: true });
}
