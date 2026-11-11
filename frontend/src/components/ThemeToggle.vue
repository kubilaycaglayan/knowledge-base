<script setup lang="ts">
import { isDarkTheme, theme, themePreference, toggleTheme } from "../lib/theme";
</script>

<template>
  <button
    class="theme-toggle ghost"
    type="button"
    :aria-label="
      'Switch to ' + (themePreference === 'auto' ? 'dark' : themePreference === 'light' ? 'system default' : isDarkTheme(theme) ? 'light' : 'dark') + ' theme'
    "
    :title="`Theme: ${themePreference}`"
    @click="toggleTheme"
  >
    <svg
      v-if="isDarkTheme(theme)"
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
        d="M12 2.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM12 18.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.93 3.52a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM16.24 14.83a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM2.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM18.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM4.93 20.48a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM16.24 9.17a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
      />
    </svg>
  </button>
</template>

<style scoped>
@media (max-width: 700px) {
  .theme-toggle { min-width: 44px; min-height: 44px; }
}
</style>
