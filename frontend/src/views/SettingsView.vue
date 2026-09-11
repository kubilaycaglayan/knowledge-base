<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, download } from "../lib/api";
import ImportsView from "./ImportsView.vue";
import { setThemePreference, themePreference, type ThemePreference } from "../lib/theme";

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

function changeTheme(event: Event) {
  setThemePreference((event.target as HTMLSelectElement).value as ThemePreference);
}

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
    <header class="settings-header">
      <div>
        <p class="eyebrow">WORKSPACE</p>
        <h1>Settings</h1>
        <p class="lede">
          {{ activeTab === "account" ? "Manage how you sign in to Knowledge Base." : activeTab === "data" ? "Import data into Knowledge Base." : "Download a portable copy of your Knowledge Base." }}
        </p>
      </div>
    </header>
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button id="settings-tab-account" type="button" role="tab" aria-controls="settings-panel-account" :aria-selected="activeTab === 'account'" :class="{ selected: activeTab === 'account' }" @click="activeTab = 'account'">Account</button>
      <button id="settings-tab-data" type="button" role="tab" aria-controls="settings-panel-data" :aria-selected="activeTab === 'data'" :class="{ selected: activeTab === 'data' }" @click="activeTab = 'data'">Import</button>
      <button id="settings-tab-export" type="button" role="tab" aria-controls="settings-panel-export" :aria-selected="activeTab === 'export'" :class="{ selected: activeTab === 'export' }" @click="activeTab = 'export'">Export</button>
    </div>
    <section v-if="activeTab === 'account'" id="settings-panel-account" class="card settings-card settings-account-card" role="tabpanel" aria-labelledby="settings-tab-account" tabindex="0">
      <div class="settings-card-heading">
        <div>
          <p class="section-kicker">ACCOUNT ACCESS</p>
          <h2 id="sign-in-title">Sign-in methods</h2>
        </div>
        <span v-if="account" class="settings-status">Connected</span>
      </div>
      <div v-if="account" class="account-summary">
        <span class="account-avatar" aria-hidden="true">{{ account.email.charAt(0).toUpperCase() }}</span>
        <div>
          <strong>{{ account.email }}</strong>
          <p class="muted">Manage the ways you access your Knowledge Base.</p>
        </div>
      </div>
      <p v-else class="muted">Loading account details…</p>
      <p v-if="account?.hasGoogle">Google sign-in is connected to this account.</p>
      <p v-if="account?.hasPassword">
        A password is configured. You can use either password or Google sign-in.
      </p>
      <p v-else>
        Set a password to add password sign-in while keeping Google sign-in available.
      </p>
      <form class="settings-form" @submit.prevent="savePassword">
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
      <p v-if="message" class="success" role="status" aria-live="polite">{{ message }}</p>
      <p v-if="error" class="notice" role="alert" aria-live="polite">{{ error }}</p>
      <section class="settings-subsection" aria-labelledby="appearance-title">
        <div>
          <p class="section-kicker">APPEARANCE</p>
          <h3 id="appearance-title">Theme</h3>
          <p class="muted">Choose whether Knowledge Base follows your system or stays light or dark.</p>
        </div>
        <label class="theme-choice">
          Theme preference
          <select class="theme-select" name="themePreference" autocomplete="off" :value="themePreference" @change="changeTheme">
            <option value="auto">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
    </section>
    <section v-else-if="activeTab === 'data'" id="settings-panel-data" class="settings-data" role="tabpanel" aria-labelledby="settings-tab-data" tabindex="0">
      <section class="card settings-card settings-intro-card">
        <p class="section-kicker">MOVE YOUR DATA</p>
        <h2 id="data-title">Import</h2>
        <p>Import Knowledge Base CSV files or Clockify sessions.</p>
      </section>
      <ImportsView embedded />
    </section>
    <section v-else id="settings-panel-export" class="settings-data" role="tabpanel" aria-labelledby="settings-tab-export" tabindex="0">
      <section class="card settings-card settings-intro-card">
        <p class="section-kicker">KEEP A COPY</p>
        <h2 id="export-title">Export</h2>
        <p>Download active sessions, paths, timeline, calendar inputs, notes, and labels as a portable CSV.</p>
        <div class="settings-action-row">
          <button class="primary" type="button" @click="exportData">Download Knowledge Base CSV</button>
          <span v-if="exportMessage" class="muted" role="status" aria-live="polite">{{ exportMessage }}</span>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.settings-view { max-width: 920px; display: grid; gap: 24px; }
.settings-header h1, .settings-header .lede, .settings-card h2, .settings-card p { margin: 0; }
.settings-header .lede { max-width: 620px; }
.settings-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--workspace-border); }
.settings-tabs button { min-height: 44px; padding: 8px 16px; border: 0; border-bottom: 2px solid transparent; border-radius: var(--workspace-radius) var(--workspace-radius) 0 0; background: transparent; color: var(--workspace-muted); font-weight: 600; }
.settings-tabs button:hover { background: var(--workspace-hover); color: var(--workspace-strong); }
.settings-tabs button.selected { border-bottom-color: var(--workspace-accent); background: var(--workspace-selected); color: var(--workspace-text); }
.settings-data { display: grid; gap: 24px; }
.settings-card { display: grid; gap: 16px; }
.settings-card-heading, .account-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.settings-card-heading h2 { margin-top: 3px; }
.settings-status { flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--workspace-success) 35%, var(--workspace-border)); border-radius: 999px; padding: 3px 8px; color: var(--workspace-success); font-size: 11px; font-weight: 650; }
.account-summary { align-items: center; justify-content: flex-start; padding: 12px; border: 1px solid var(--workspace-border); border-radius: var(--workspace-radius); background: var(--workspace-selected); }
.account-summary > div { display: grid; min-width: 0; gap: 2px; }
.account-summary strong { overflow-wrap: anywhere; }
.account-summary p { font-size: 13px; }
.account-avatar { display: inline-grid; flex: 0 0 36px; width: 36px; height: 36px; place-items: center; border-radius: 50%; background: var(--workspace-accent); color: var(--workspace-on-accent); font-weight: 700; }
.settings-form { display: grid; gap: 14px; max-width: 460px; margin-top: 4px; }
.settings-card label { display: grid; gap: 6px; font-size: 12px; font-weight: 650; }
.settings-card input { width: 100%; }
.settings-action-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
.settings-intro-card { gap: 8px; }
.settings-subsection { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 260px); align-items: center; gap: 24px; margin-top: 4px; padding-top: 20px; border-top: 1px solid var(--workspace-border); }
.settings-subsection h3 { margin: 3px 0 2px; font-size: 14px; }
.settings-subsection p { margin: 0; }
.theme-choice { display: grid; gap: 6px; font-size: 12px; font-weight: 650; }
.theme-select { width: 100%; background: var(--workspace-surface); color: var(--workspace-text); }
.success { color: var(--workspace-success, #247a45); }
@media (max-width: 560px) {
  .settings-card-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .settings-tabs button { flex: 1; padding-inline: 10px; }
  .settings-subsection { grid-template-columns: 1fr; gap: 14px; }
}
</style>
