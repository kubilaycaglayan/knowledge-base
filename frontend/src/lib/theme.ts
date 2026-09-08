import { computed, ref } from "vue";

export type Theme = "light" | "dark";
export const theme = ref<Theme>(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export function applyTheme(value: Theme) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",
    getComputedStyle(document.documentElement).getPropertyValue("--workspace-background").trim());
}
export function toggleTheme() {
  applyTheme(theme.value === "dark" ? "light" : "dark");
  try { localStorage.setItem("knowledge-base-theme", theme.value); } catch { /* Keep this session usable. */ }
}

// SVG/canvas charts need resolved colors, and must recompute when the theme changes.
export const chartTheme = computed(() => {
  void theme.value;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(`--workspace-${name}`).trim();
  return { text: token("text"), muted: token("muted"), border: token("border"), surface: token("surface"), selected: token("selected") };
});
