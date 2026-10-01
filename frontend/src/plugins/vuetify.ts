import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";
import * as directives from "vuetify/directives";
import { watch } from "vue";
import { isDarkTheme, theme, themes } from "../lib/theme";

const paletteColors: Record<string, Record<string, string>> = {
  light: { primary: "#334155", secondary: "#606b7b", background: "#f7f8fa", surface: "#ffffff", "on-surface": "#252b36" },
  dark: { primary: "#c4d1e2", secondary: "#a7b2c2", background: "#151a22", surface: "#1c2430", "on-surface": "#e1e6ee", "on-primary": "#18212e" },
  solarized: { primary: "#176b75", secondary: "#586e75", background: "#fdf6e3", surface: "#fffdf5", "on-surface": "#073642" },
  banana: { primary: "#684900", secondary: "#65551f", background: "#fff9dc", surface: "#fffdf1", "on-surface": "#382c08" },
  melon: { primary: "#176044", secondary: "#496453", background: "#f0faf2", surface: "#fbfffb", "on-surface": "#17382a" },
  fruity: { primary: "#8b2944", secondary: "#6c4a54", background: "#fff4f1", surface: "#fffafa", "on-surface": "#40212a" },
  neon: { primary: "#c7ff3d", secondary: "#c1c9dd", background: "#0b0d13", surface: "#141924", "on-surface": "#f1f4ff", "on-primary": "#172000" },
  "tokyo-neon": { primary: "#ff65a3", secondary: "#c3badf", background: "#11111b", surface: "#1a1927", "on-surface": "#f4f0ff", "on-primary": "#260b1a" },
  beach: { primary: "#075d78", secondary: "#456578", background: "#eff9fc", surface: "#fbfeff", "on-surface": "#143448" },
};
const vuetifyThemes = Object.fromEntries(
  themes.map((name) => [name, { dark: isDarkTheme(name), colors: { ...paletteColors[name], accent: paletteColors[name].primary, "on-background": paletteColors[name]["on-surface"] } }]),
);

const vuetify = createVuetify({
  directives,
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: { mdi },
  },
  defaults: {
    VBtn: { elevation: 0, rounded: "sm" },
    VSelect: { density: "compact", variant: "outlined" },
  },
  theme: {
    defaultTheme: theme.value,
    themes: vuetifyThemes,
  },
});
watch(theme, (value) => {
  void vuetify.theme.change(value);
});
export default vuetify;
