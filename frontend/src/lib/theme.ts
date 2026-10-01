import { computed, ref } from "vue";

export const themes = [
  "light",
  "dark",
  "solarized",
  "banana",
  "melon",
  "fruity",
  "neon",
  "tokyo-neon",
  "beach",
] as const;
export type Theme = (typeof themes)[number];
export type ThemePreference = Theme | "auto";

export const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "auto", label: "System default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "solarized", label: "Solarized" },
  { value: "banana", label: "Banana" },
  { value: "melon", label: "Melon" },
  { value: "fruity", label: "Fruity" },
  { value: "neon", label: "Neon" },
  { value: "tokyo-neon", label: "Tokyo Neon" },
  { value: "beach", label: "Beach" },
];

export function isDarkTheme(value: Theme): boolean {
  return value === "dark" || value === "neon" || value === "tokyo-neon";
}

function isTheme(value: string | null): value is Theme {
  return themes.includes(value as Theme);
}

function savedPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem("knowledge-base-theme");
    return saved === "auto" || isTheme(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const themePreference = ref<ThemePreference>(savedPreference());
export const theme = ref<Theme>(
  isTheme(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : "light",
);
export function applyTheme(value: Theme) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = isDarkTheme(value)
    ? "dark"
    : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--workspace-background")
        .trim(),
    );
}
function persistPreference(value: ThemePreference) {
  try {
    localStorage.setItem("knowledge-base-theme", value);
  } catch {
    /* Keep this session usable. */
  }
}
export function setThemePreference(value: ThemePreference) {
  themePreference.value = value;
  applyTheme(value === "auto" ? systemTheme() : value);
  persistPreference(value);
}
export function toggleTheme() {
  const next: ThemePreference = isTheme(themePreference.value)
    ? themePreference.value === "light" || themePreference.value === "dark"
      ? themePreference.value === "dark"
        ? "light"
        : "dark"
      : isDarkTheme(themePreference.value)
        ? "light"
        : "dark"
    : themePreference.value === "auto"
      ? "dark"
      : themePreference.value === "dark"
        ? "light"
        : "auto";
  setThemePreference(next);
}

if (typeof window !== "undefined") {
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      if (themePreference.value === "auto") applyTheme(systemTheme());
    });
}

// SVG/canvas charts need resolved colors, and must recompute when the theme changes.
export const chartTheme = computed(() => {
  void theme.value;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) =>
    styles.getPropertyValue(`--workspace-${name}`).trim();
  return {
    text: token("text"),
    muted: token("muted"),
    border: token("border"),
    surface: token("surface"),
    selected: token("selected"),
  };
});
