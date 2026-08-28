import "vuetify/styles";
import { createVuetify } from "vuetify";
import * as directives from "vuetify/directives";

export default createVuetify({
  directives,
  theme: {
    defaultTheme: "know",
    themes: {
      know: {
        colors: {
          primary: "#173d36",
          secondary: "#497d6b",
          accent: "#e8754e",
          background: "#f4f5ef",
          surface: "#ffffff",
        },
      },
    },
  },
});
