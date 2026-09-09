import { computed, ref } from "vue";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "auto";

function savedPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem("knowledge-base-theme");
    return saved === "light" || saved === "dark" || saved === "auto" ? saved : "auto";
  } catch {
    return "auto";
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const themePreference = ref<ThemePreference>(savedPreference());
export const theme = ref<Theme>(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export function applyTheme(value: Theme) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",
    getComputedStyle(document.documentElement).getPropertyValue("--workspace-background").trim());
}
function persistPreference(value: ThemePreference) {
  try { localStorage.setItem("knowledge-base-theme", value); } catch { /* Keep this session usable. */ }
}
export function setThemePreference(value: ThemePreference) {
  themePreference.value = value;
  applyTheme(value === "auto" ? systemTheme() : value);
  persistPreference(value);
}
export function toggleTheme() {
  const next: ThemePreference = themePreference.value === "auto"
    ? "dark"
    : themePreference.value === "dark" ? "light" : "auto";
  setThemePreference(next);
}

if (typeof window !== "undefined") {
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (themePreference.value === "auto") applyTheme(systemTheme());
  });
}

// SVG/canvas charts need resolved colors, and must recompute when the theme changes.
export const chartTheme = computed(() => {
  void theme.value;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(`--workspace-${name}`).trim();
  return { text: token("text"), muted: token("muted"), border: token("border"), surface: token("surface"), selected: token("selected") };
});
