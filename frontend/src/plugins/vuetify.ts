import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";
import * as directives from "vuetify/directives";
import { watch } from "vue";
import { theme } from "../lib/theme";

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
    themes: {
      light: {
        colors: {
          primary: "#334155",
          secondary: "#606b7b",
          accent: "#334155",
          background: "#f7f8fa",
          surface: "#ffffff",
          "on-surface": "#252b36",
          "on-background": "#252b36",
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: "#c4d1e2",
          secondary: "#a7b2c2",
          accent: "#c4d1e2",
          background: "#151a22",
          surface: "#1c2430",
          "on-surface": "#e1e6ee",
          "on-background": "#e1e6ee",
          "on-primary": "#18212e",
        },
      },
    },
  },
});
watch(theme, (value) => { void vuetify.theme.change(value); });
export default vuetify;
