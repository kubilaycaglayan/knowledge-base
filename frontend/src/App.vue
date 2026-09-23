<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { useTimerStore } from "./stores/timer";
import { routeLocationKey, routerKey } from "vue-router";
import AuthView from "./views/AuthView.vue";
import FloatingTimeTracker from "./components/FloatingTimeTracker.vue";
import AppSnackbar from "./components/AppSnackbar.vue";
import { theme, themePreference, toggleTheme } from "./lib/theme";
import { useAuthStore } from "./stores/auth";
import { useBoardsStore } from "./stores/boards";
const auth = useAuthStore();
const tracker = useTimerStore();
const boards = useBoardsStore();
watch(
  () => auth.token,
  (token, previous, onCleanup) => {
    if (token !== previous) { tracker.clear(); boards.reset(); }
    if (token) {
      tracker.acquire();
      onCleanup(() => tracker.release());
    }
  },
  { immediate: true },
);
const route = inject(routeLocationKey, undefined);
const router = inject(routerKey, undefined);
const focusedTextInput = ref(false);
const handleFocusOut = () => requestAnimationFrame(() => updateFocusedTextInput());
const isMobileViewport = () =>
  window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
function updateFocusedTextInput(event?: FocusEvent) {
  const target = (event?.target || document.activeElement) as HTMLElement | null;
  focusedTextInput.value = Boolean(
    isMobileViewport() &&
      target &&
      ((target instanceof HTMLInputElement && target.type !== "button") ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        Boolean(target.closest("[contenteditable='true']"))),
  );
}
const showFloatingTracker = () =>
  auth.isAuthenticated &&
  route?.path !== "/" &&
  route?.path !== "/sessions" &&
  !(focusedTextInput.value && route?.path !== "/sessions");
onMounted(() => {
  document.addEventListener("focusin", updateFocusedTextInput);
  document.addEventListener("focusout", handleFocusOut);
});
onBeforeUnmount(() => {
  document.removeEventListener("focusin", updateFocusedTextInput);
  document.removeEventListener("focusout", handleFocusOut);
});
watchEffect(() => {
  const path = route?.path || "/";
  const page = !auth.isAuthenticated
    ? "Sign in"
    : path.startsWith("/notes/")
      ? "Note"
      : path === "/"
        ? "Sessions"
        : path.slice(1);
  document.title = `Knowledge Base · ${page.charAt(0).toUpperCase()}${page.slice(1)}`;
});
function logout() {
  auth.clearToken();
  void router?.replace("/sessions");
}
function authenticated() {
  auth.refresh();
  const redirect = route?.query?.redirect;
  const destination =
    typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
      ? redirect
      : "/sessions";
  void router?.replace(destination);
}
</script>
<template>
  <div class="shell dashboard-shell">
    <a class="dashboard-skip" href="#main-content">Skip to content</a>
    <header>
      <a class="brand" href="/" aria-label="Knowledge Base" translate="no"
        >knowledge<span>.</span>base</a
      >
      <nav v-if="auth.isAuthenticated" aria-label="Main navigation">
        <RouterLink to="/sessions">Sessions</RouterLink
        ><RouterLink to="/logs">Logs</RouterLink
        ><RouterLink to="/paths">Paths</RouterLink
        ><RouterLink to="/calendar">Calendar</RouterLink
        ><RouterLink
          to="/notes"
          :class="{ 'section-active': route?.path.startsWith('/notes/') }"
          >Notes</RouterLink
        ><RouterLink to="/board">Board</RouterLink><RouterLink to="/reports">Reports</RouterLink>
        <RouterLink to="/labels">Labels</RouterLink>
      </nav>
      <div class="shell-actions">
        <RouterLink
          v-if="auth.isAuthenticated"
          class="settings-link"
          to="/settings"
          aria-label="Settings"
          title="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.2 7.2 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4c-.24 0-.44.17-.48.42L9.14 5.07c-.61.25-1.18.58-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.48.42h4c.24 0 .44-.17.48-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
            />
          </svg>
        </RouterLink>
        <button
          v-else
          class="theme-toggle ghost"
          type="button"
          :aria-label="
            'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'
          "
          :title="`Theme: ${themePreference}`"
          @click="toggleTheme"
        >
          <svg
            v-if="theme === 'dark'"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 3a9 9 0 1 0 9 9c0-.45-.03-.89-.1-1.32A7 7 0 1 1 13.32 3.1C12.89 3.03 12.45 3 12 3Z"
            />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 2.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM12 18.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.93 3.52a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM16.24 14.83a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM2.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 0 2h-1a1 1 0 0 1-1-1ZM18.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 0 2h-1a1 1 0 0 1-1-1ZM4.93 20.48a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM16.24 9.17a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
            />
          </svg>
        </button>
        <button v-if="auth.isAuthenticated" class="ghost" @click="logout">
          Sign out
        </button>
      </div>
    </header>
    <main id="main-content" tabindex="-1">
      <AuthView
        v-if="!auth.isAuthenticated"
        @authenticated="authenticated"
      /><RouterView v-else />
    </main>
    <FloatingTimeTracker v-if="showFloatingTracker()" />
    <AppSnackbar />
  </div>
</template>

<style scoped src="./dashboard-shell.css"></style>
