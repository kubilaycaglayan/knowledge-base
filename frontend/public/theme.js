// Blocking, same-origin bootstrap: choose the theme before the first paint.
(() => {
  let preference;
  try {
    preference = localStorage.getItem("knowledge-base-theme");
  } catch {
    /* Storage may be unavailable. */
  }
  const themes = ["light", "dark", "solarized", "banana", "melon", "fruity", "neon", "tokyo-neon", "beach"];
  const theme =
    themes.includes(preference)
      ? preference
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "dark" || theme === "neon" || theme === "tokyo-neon" ? "dark" : "light";
})();
