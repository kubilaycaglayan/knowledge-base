// Use the same preference and cycle as the application theme control.
(() => {
  const themes = ['light', 'dark', 'solarized', 'banana', 'melon', 'fruity', 'neon', 'tokyo-neon', 'beach'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'auto';
  try {
    const saved = localStorage.getItem('knowledge-base-theme');
    if (saved === 'auto' || themes.includes(saved)) preference = saved;
  } catch { /* Storage may be unavailable; follow the system. */ }
  const dark = value => ['dark', 'neon', 'tokyo-neon'].includes(value);
  const moon = 'M12 3a9 9 0 1 0 9 9c0-.45-.03-.89-.1-1.32A7 7 0 1 1 13.32 3.1C12.89 3.03 12.45 3 12 3Z';
  const sun = 'M12 2.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM12 18.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.93 3.52a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM16.24 14.83a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM2.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM18.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM4.93 20.48a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM16.24 9.17a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z';
  function apply() {
    const theme = preference === 'auto' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = dark(theme) ? 'dark' : 'light';
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.querySelector('path')?.setAttribute('d', dark(theme) ? moon : sun);
      const next = preference === 'auto' ? 'dark' : preference === 'light' ? 'system default' : dark(theme) ? 'light' : 'dark';
      button.setAttribute('aria-label', `Switch to ${next} theme`);
      button.title = `Theme: ${preference === 'auto' ? 'System default' : preference}`;
    });
  }
  apply();
  system.addEventListener('change', () => { if (preference === 'auto') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => {
      preference = preference === 'auto' ? 'dark' : preference === 'dark' ? 'light' : preference === 'light' ? 'auto' : dark(preference) ? 'light' : 'dark';
      try { localStorage.setItem('knowledge-base-theme', preference); } catch { /* Keep the current page usable. */ }
      apply();
    }));
  });
})();
