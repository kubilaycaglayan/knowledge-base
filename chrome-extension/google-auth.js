(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KnowGoogleAuth = api;
})(typeof globalThis === "object" ? globalThis : self, () => {
  const base64Url = (bytes) => {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  function nonce() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function authorizationUrl(clientId, redirectUri, state, requestNonce) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "id_token",
      scope: "openid email profile",
      state,
      nonce: requestNonce,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  function parseRedirect(url, expectedState, expectedNonce) {
    const values = new URLSearchParams(new URL(url).hash.slice(1));
    if (values.get("state") !== expectedState) throw Error("Google sign-in state mismatch");
    const idToken = values.get("id_token");
    if (!idToken) throw Error(values.get("error") || "Google did not return an identity token");
    const parts = idToken.split(".");
    if (parts.length !== 3) throw Error("Google returned an invalid identity token");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.nonce !== expectedNonce) throw Error("Google sign-in nonce mismatch");
    return idToken;
  }

  return { nonce, authorizationUrl, parseRedirect };
});
