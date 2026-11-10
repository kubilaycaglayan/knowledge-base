window.googleConnect = async function (response) {
  if (!response || typeof response.credential !== "string") return;

  const config = document.getElementById("g_id_onload");
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
};
