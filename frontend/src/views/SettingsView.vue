<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, download } from "../lib/api";
import ImportsView from "./ImportsView.vue";

type Account = {
  email: string;
  hasPassword: boolean;
  hasGoogle: boolean;
};

const account = ref<Account | null>(null);
const currentPassword = ref("");
const newPassword = ref("");
const message = ref("");
const error = ref("");
const saving = ref(false);
const exportMessage = ref("");
const activeTab = ref<"account" | "data" | "export">("account");

async function load() {
  try {
    account.value = await api<Account>("/auth/me");
  } catch {
    error.value = "Could not load account settings.";
  }
}

async function savePassword() {
  message.value = "";
  error.value = "";
  saving.value = true;
  try {
    account.value = await api<Account>("/auth/password", {
      method: "PUT",
      body: JSON.stringify({
        ...(account.value?.hasPassword && !account.value?.hasGoogle
          ? { currentPassword: currentPassword.value }
          : {}),
        newPassword: newPassword.value,
      }),
    });
    currentPassword.value = "";
    newPassword.value = "";
    message.value = "Password saved. You can now sign in with your email and password.";
  } catch {
    error.value = account.value?.hasPassword
      ? "Could not save your password. Check your current password and try again."
      : "Could not set your password. Use at least 9 characters and try again.";
  } finally {
    saving.value = false;
  }
}

async function exportData() {
  exportMessage.value = "";
  try {
    await download("/imports/knowledge-base/export", "knowledge-base-export.csv");
    exportMessage.value = "Your Knowledge Base export is ready.";
  } catch {
    exportMessage.value = "Could not export your data. Try again.";
  }
}

onMounted(load);
</script>

<template>
  <section class="settings-view">
    <p class="eyebrow">ACCOUNT</p>
    <h1>Settings</h1>
    <p class="lede">Manage how you sign in to Knowledge Base.</p>
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button type="button" role="tab" :aria-selected="activeTab === 'account'" :class="{ selected: activeTab === 'account' }" @click="activeTab = 'account'">Account</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'data'" :class="{ selected: activeTab === 'data' }" @click="activeTab = 'data'">Data</button>
      <button type="button" role="tab" :aria-selected="activeTab === 'export'" :class="{ selected: activeTab === 'export' }" @click="activeTab = 'export'">Export</button>
    </div>
    <section v-if="activeTab === 'account'" class="card settings-card" aria-labelledby="sign-in-title">
      <h2 id="sign-in-title">Sign-in methods</h2>
      <p v-if="account" class="muted">{{ account.email }}</p>
      <p v-if="account?.hasGoogle">Google sign-in is connected to this account.</p>
      <p v-if="account?.hasPassword">
        A password is configured. You can use either password or Google sign-in.
      </p>
      <p v-else>
        Set a password to add password sign-in while keeping Google sign-in available.
      </p>
      <form @submit.prevent="savePassword">
        <label v-if="account?.hasPassword && !account?.hasGoogle">
          Current password
          <input v-model="currentPassword" type="password" name="currentPassword" autocomplete="current-password" required />
        </label>
        <label>
          {{ account?.hasPassword ? "New password" : "Password" }}
          <input v-model="newPassword" type="password" name="newPassword" autocomplete="new-password" minlength="9" required />
        </label>
        <button class="primary" type="submit" :disabled="saving">
          {{ saving ? "Saving…" : account?.hasPassword ? "Change password" : "Set password" }}
        </button>
      </form>
      <p v-if="message" class="success" role="status">{{ message }}</p>
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
    </section>
    <section v-else-if="activeTab === 'data'" class="settings-data" aria-labelledby="data-title">
      <section class="card settings-card">
        <h2 id="data-title">Your data</h2>
        <p>Import Knowledge Base CSV files or Clockify sessions.</p>
      </section>
      <ImportsView />
    </section>
    <section v-else class="settings-data" aria-labelledby="export-title">
      <section class="card settings-card">
        <h2 id="export-title">Export</h2>
        <p>Download active sessions, paths, timeline, calendar inputs, notes, and labels as a portable CSV.</p>
        <div class="row-actions">
        <button class="primary" type="button" @click="exportData">Download Knowledge Base CSV</button>
        <span v-if="exportMessage" class="muted" role="status">{{ exportMessage }}</span>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.settings-view { max-width: 680px; }
.settings-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--workspace-border); margin: 20px 0 16px; }
.settings-tabs button { min-height: 44px; padding: 8px 14px; border-bottom: 2px solid transparent; }
.settings-tabs button.selected { border-bottom-color: var(--workspace-accent); font-weight: 700; }
.settings-data { display: grid; gap: 24px; }
.settings-card { display: grid; gap: 12px; }
.settings-card h2, .settings-card p { margin: 0; }
.settings-card form { display: grid; gap: 14px; margin-top: 8px; }
.settings-card label { display: grid; gap: 6px; font-weight: 600; }
.settings-card input { width: 100%; }
.success { color: var(--workspace-success, #247a45); }
</style>
