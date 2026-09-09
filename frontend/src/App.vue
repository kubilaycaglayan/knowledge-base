<script setup lang="ts">
import { inject, ref, watchEffect } from "vue";
import { routeLocationKey } from "vue-router";
import AuthView from "./views/AuthView.vue";
import { theme, themePreference, toggleTheme } from "./lib/theme";
const token = ref(localStorage.getItem("know_token"));
const route = inject(routeLocationKey, undefined);
watchEffect(() => {
  const path = route?.path || "/";
  const page = !token.value ? "Sign in" : path.startsWith("/notes/") ? "Note" : path === "/" ? "Overview" : path.slice(1);
  document.title = `${page.charAt(0).toUpperCase()}${page.slice(1)} · Knowledge Base`;
});
function logout() {
  localStorage.removeItem("know_token");
  token.value = null;
}
function authenticated() {
  token.value = localStorage.getItem("know_token");
}
</script>
<template>
  <div class="shell dashboard-shell">
    <a class="dashboard-skip" href="#main-content">Skip to content</a>
    <header>
      <a class="brand" href="/" aria-label="Knowledge Base" translate="no">knowledge<span>.</span>base</a>
      <nav v-if="token" aria-label="Main navigation">
        <RouterLink to="/">Overview</RouterLink
          ><RouterLink to="/sessions">Sessions</RouterLink
        ><RouterLink to="/paths">Paths</RouterLink
        ><RouterLink to="/timeline">Timeline</RouterLink
        ><RouterLink to="/calendar">Calendar</RouterLink
        ><RouterLink to="/notes" :class="{ 'section-active': route?.path.startsWith('/notes/') }">Notes</RouterLink
        ><RouterLink to="/reports">Reports</RouterLink
        >
        <RouterLink to="/labels">Labels</RouterLink>
        <RouterLink to="/settings">Settings</RouterLink>
      </nav>
      <div class="shell-actions">
        <button class="theme-toggle" type="button" :aria-pressed="themePreference !== 'light'" :aria-label="`Theme: ${themePreference}`" @click="toggleTheme">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path v-if="themePreference === 'light'" d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/><template v-else-if="themePreference === 'dark'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></template><template v-else><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></template></svg>
          <span>{{ themePreference === 'auto' ? 'Auto' : themePreference === 'dark' ? 'Dark' : 'Light' }}</span>
        </button>
        <button v-if="token" class="ghost" @click="logout">Sign out</button>
      </div>
    </header>
    <main id="main-content" tabindex="-1">
      <AuthView v-if="!token" @authenticated="authenticated" /><RouterView
        v-else
      />
    </main>
  </div>
</template>

<style scoped src="./dashboard-shell.css"></style>
