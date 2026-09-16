// Blocking, same-origin bootstrap: choose the theme before the first paint.
(() => {
  let preference;
  try {
    preference = localStorage.getItem("knowledge-base-theme");
  } catch {
    /* Storage may be unavailable. */
  }
  const theme =
    preference === "light" || preference === "dark"
      ? preference
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
