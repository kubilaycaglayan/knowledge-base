<script setup lang="ts">
import { inject, ref, watchEffect } from "vue";
import { routeLocationKey } from "vue-router";
import AuthView from "./views/AuthView.vue";
import { themePreference, toggleTheme } from "./lib/theme";
const token = ref(localStorage.getItem("know_token"));
const route = inject(routeLocationKey, undefined);
watchEffect(() => {
  const path = route?.path || "/";
  const page = !token.value ? "Sign in" : path.startsWith("/notes/") ? "Note" : path === "/" ? "Sessions" : path.slice(1);
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
        <RouterLink to="/sessions">Sessions</RouterLink
        ><RouterLink to="/paths">Paths</RouterLink
        ><RouterLink to="/calendar">Calendar</RouterLink
        ><RouterLink to="/notes" :class="{ 'section-active': route?.path.startsWith('/notes/') }">Notes</RouterLink
        ><RouterLink to="/reports">Reports</RouterLink
        >
        <RouterLink to="/labels">Labels</RouterLink>
      </nav>
      <div class="shell-actions">
        <RouterLink v-if="token" class="settings-link" to="/settings" aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.2 7.2 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4c-.24 0-.44.17-.48.42L9.14 5.07c-.61.25-1.18.58-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.48.42h4c.24 0 .44-.17.48-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" /></svg>
        </RouterLink>
        <button
          v-else
          class="theme-toggle ghost"
          type="button"
          :aria-label="`Change theme (currently ${themePreference})`"
          :title="`Theme: ${themePreference}`"
          @click="toggleTheme"
        >
          Theme: {{ themePreference }}
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
