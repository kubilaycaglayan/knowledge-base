<script setup lang="ts">
import { onMounted, ref } from "vue";
import { navigateToOAuthContinuation } from "../lib/oauthAuthorization";

type AccountInfo = { email: string; csrfParameter: string; csrfToken: string; authorizationUrl: string };
const account = ref<AccountInfo | null>(null);
const failed = ref(false);
const choiceBusy = ref(false);
const choiceError = ref("");
onMounted(async () => {
  document.title = "Confirm account · Knowledge Base";
  try {
    const response = await fetch("/connect/openai/account-info", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Connection expired");
    account.value = await response.json() as AccountInfo;
  } catch { failed.value = true; }
});

async function submitChoice(event: SubmitEvent) {
  const form = event.currentTarget;
  const submitter = event.submitter as HTMLButtonElement | null;
  if (!(form instanceof HTMLFormElement)) return;
  const action = submitter?.value || "continue";
  const data = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") data.append(key, value);
  });
  data.set(submitter?.name || "action", submitter?.value || "continue");
  choiceBusy.value = true;
  choiceError.value = "";
  try {
    const response = await fetch(form.getAttribute("action") || "/connect/openai/account", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: data.toString(),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Could not continue this connection. Start again from OpenAI.");
    }
    let result: { authorizationUrl?: string } | null = null;
    try { result = await response.json() as { authorizationUrl?: string }; } catch { /* Recover from intermediary response replacement below. */ }
    if (result?.authorizationUrl) {
      navigateToOAuthContinuation(result.authorizationUrl);
      return;
    }
    const state = await fetch("/connect/openai/account-info", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (state.status !== 401) throw new Error("Could not continue this connection. Start again from OpenAI.");
    navigateToOAuthContinuation(action === "switch" ? "/connect/openai/login" : account.value?.authorizationUrl || "");
  } catch (error) {
    choiceError.value = error instanceof Error
      ? error.message : "Could not continue this connection. Start again from OpenAI.";
    choiceBusy.value = false;
  }
}
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
            <p v-if="choiceError" role="alert" aria-live="polite">{{ choiceError }}</p>
            <p v-if="choiceBusy" role="status">Continuing authorization…</p>
            <form method="post" action="/connect/openai/account" @submit.prevent="submitChoice">
              <input type="hidden" :name="account.csrfParameter" :value="account.csrfToken">
              <v-btn class="primary" type="submit" name="action" value="continue" color="primary" variant="flat" :loading="choiceBusy" :disabled="choiceBusy">Continue</v-btn>
              <v-btn type="submit" name="action" value="switch" variant="outlined" :loading="choiceBusy" :disabled="choiceBusy">Switch account</v-btn>
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
