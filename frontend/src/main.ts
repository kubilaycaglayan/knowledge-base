import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import vuetify from "./plugins/vuetify";
import "./style.css";
import "./theme.css";
import "./extra.css";
import { applyTheme, theme } from "./lib/theme";
applyTheme(theme.value);
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./views/DashboardView.vue") },
    { path: "/paths", component: () => import("./views/PathsView.vue") },
    { path: "/timeline", component: () => import("./views/TimelineView.vue") },
    { path: "/sessions", component: () => import("./views/SessionsView.vue") },
    { path: "/reports", component: () => import("./views/ReportsView.vue") },
    { path: "/calendar", component: () => import("./views/CalendarView.vue") },
    { path: "/imports", component: () => import("./views/ImportsView.vue") },
    { path: "/settings", component: () => import("./views/SettingsView.vue") },
    { path: "/labels", component: () => import("./views/LabelsView.vue") },
    { path: "/notes", name: "notes", component: () => import("./views/NotesView.vue") },
    { path: "/notes/:id", name: "note-editor", component: () => import("./views/NotesView.vue") },
  ],
});

// Keep report filters while moving around the SPA, but intentionally do not
// persist them so a full reload starts with the default report range.
let lastReportsSearch = "";
router.beforeEach((to, from) => {
  if (from.path === "/reports" && window.location.search) {
    lastReportsSearch = window.location.search;
  }
  if (to.path === "/reports" && !Object.keys(to.query).length && lastReportsSearch) {
    return `/reports${lastReportsSearch}`;
  }
  return true;
});
createApp(App)
  .use(router)
  .use(vuetify)
  .mount("#app");
