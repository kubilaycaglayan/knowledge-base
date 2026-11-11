<script setup lang="ts">
import { onMounted, ref } from "vue";

type AccountInfo = { email: string; csrfParameter: string; csrfToken: string };
const account = ref<AccountInfo | null>(null);
const failed = ref(false);
onMounted(async () => {
  document.title = "Confirm account · Knowledge Base";
  try {
    const response = await fetch("/connect/openai/account-info", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Connection expired");
    account.value = await response.json() as AccountInfo;
  } catch { failed.value = true; }
});
</script>

<template>
  <v-app class="oauth-account-page">
    <header class="oauth-header"><a href="/" translate="no" aria-label="Knowledge Base">knowledge<span>.</span>base</a></header>
    <main class="oauth-main">
      <v-card class="oauth-card" variant="outlined">
        <v-card-title class="oauth-title"><h1>Connect Knowledge Base</h1></v-card-title>
        <v-card-text>
          <p v-if="!account && !failed" role="status">Loading account…</p>
          <p v-else-if="failed" role="alert">This connection has expired. Start the connection again from OpenAI.</p>
          <template v-else-if="account">
            <p>You’re signed in to Knowledge Base as <strong>{{ account.email }}</strong>.</p>
            <form method="post" action="/connect/openai/account">
              <input type="hidden" :name="account.csrfParameter" :value="account.csrfToken">
              <v-btn type="submit" name="action" value="continue" color="primary" variant="flat">Continue</v-btn>
              <v-btn type="submit" name="action" value="switch" variant="outlined">Switch account</v-btn>
            </form>
          </template>
        </v-card-text>
      </v-card>
    </main>
  </v-app>
</template>

<style scoped>
.oauth-account-page { min-height: 100vh; background: #f7f8fa; color: #252b36; }
.oauth-header { width: min(1200px, calc(100% - 48px)); min-height: 76px; margin: 0 auto; padding: 16px 0; display: flex; align-items: center; border-bottom: 1px solid #dfe3e9; }
.oauth-header a { color: #252b36; font-size: 19px; font-weight: 800; letter-spacing: -.7px; text-decoration: none; }
.oauth-header span { color: #606b7b; }
.oauth-main { width: min(480px, calc(100% - 48px)); margin: 40px auto; }
.oauth-card { padding: 8px; border-color: #dfe3e9; background: white; }
.oauth-title h1 { font-size: 26px; font-weight: 650; line-height: 1.3; letter-spacing: -.7px; white-space: normal; }
.oauth-card p { color: #606b7b; overflow-wrap: anywhere; }
.oauth-card form { display: grid; gap: 12px; margin-top: 24px; }
@media (max-width: 700px) { .oauth-header, .oauth-main { width: calc(100% - 32px); } .oauth-card form :deep(button) { min-height: 44px; } }
</style>
