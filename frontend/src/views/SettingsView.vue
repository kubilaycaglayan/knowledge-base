<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, download } from "../lib/api";
import ImportsView from "./ImportsView.vue";
import {
  setThemePreference,
  themePreference,
  themeOptions,
  type ThemePreference,
} from "../lib/theme";

type Account = {
  email: string;
  hasPassword: boolean;
  hasGoogle: boolean;
};

const account = ref<Account | null>(null);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const message = ref("");
const error = ref("");
const saving = ref(false);
const exportMessage = ref("");
const activeTab = ref<"account" | "data" | "export" | "mcp">("account");
type McpToken = { id: string; name: string; categories: string[]; createdAt: string; expiresAt: string; lastUsedAt: string | null };
const mcpCategories = ["notes", "logs", "calendar", "sessions", "activity", "reports", "paths", "labels", "boards"];
const mcpTokens = ref<McpToken[]>([]);
const mcpName = ref("");
const mcpExpiry = ref("one_month");
const selectedCategories = ref([...mcpCategories]);
const revealedSecret = ref("");
const mcpError = ref("");
const creatingToken = ref(false);
const mcpEndpoint = `${window.location.origin}/mcp`;

async function loadMcpTokens() {
  try { mcpTokens.value = await api<McpToken[]>("/mcp-tokens"); } catch { mcpError.value = "Could not load MCP tokens."; }
}
async function createMcpToken() {
  mcpError.value = ""; revealedSecret.value = ""; creatingToken.value = true;
  try {
    const created = await api<{ token: McpToken; secret: string }>("/mcp-tokens", { method: "POST", body: JSON.stringify({ name: mcpName.value.trim(), categories: selectedCategories.value, expiry: mcpExpiry.value }) });
    mcpTokens.value = [created.token, ...mcpTokens.value]; revealedSecret.value = created.secret; mcpName.value = "";
  } catch { mcpError.value = "Could not create token. Choose a name and at least one category."; }
  finally { creatingToken.value = false; }
}
async function revokeMcpToken(token: McpToken) {
  if (!window.confirm(`Revoke “${token.name}”? Connected clients will lose access.`)) return;
  try { await api(`/mcp-tokens/${token.id}`, { method: "DELETE" }); mcpTokens.value = mcpTokens.value.filter(item => item.id !== token.id); }
  catch { mcpError.value = "Could not revoke this token."; }
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never"; }

function changeTheme(event: Event) {
  setThemePreference(
    (event.target as HTMLSelectElement).value as ThemePreference,
  );
}

async function load() {
  try {
    account.value = await api<Account>("/auth/me");
  } catch {
    error.value = "Could not load account settings.";
  }
}

async function storePasswordCredential(email: string, password: string) {
  if (
    typeof PasswordCredential === "undefined" ||
    !navigator.credentials?.store
  )
    return;
  try {
    await navigator.credentials.store(
      new PasswordCredential({ id: email, password }),
    );
  } catch {
    // Browser credential storage is optional and must not make a successful change look failed.
  }
}

async function savePassword() {
  message.value = "";
  error.value = "";
  if (newPassword.value !== confirmPassword.value) {
    error.value =
      "Passwords do not match. Re-enter the same new password in both fields.";
    return;
  }
  saving.value = true;
  try {
    account.value = await api<Account>("/auth/password", {
      method: "PUT",
      body: JSON.stringify({
        ...(account.value?.hasPassword
          ? { currentPassword: currentPassword.value }
          : {}),
        newPassword: newPassword.value,
      }),
    });
    if (account.value?.email)
      await storePasswordCredential(account.value.email, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
    message.value =
      "Password saved. You can now sign in with your email and password.";
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
    await download(
      "/imports/knowledge-base/export",
      "knowledge-base-export.csv",
    );
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
          {{
            activeTab === "account"
              ? "Manage how you sign in to Knowledge Base."
              : activeTab === "data"
                ? "Import data into Knowledge Base."
                : activeTab === "export" ? "Download a portable copy of your Knowledge Base." : "Manage read-only access for AI clients."
          }}
        </p>
      </div>
    </header>
    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button
        id="settings-tab-account"
        type="button"
        role="tab"
        aria-controls="settings-panel-account"
        :aria-selected="activeTab === 'account'"
        :class="{ selected: activeTab === 'account' }"
        @click="activeTab = 'account'"
      >
        Account
      </button>
      <button id="settings-tab-mcp" type="button" role="tab" aria-controls="settings-panel-mcp" :aria-selected="activeTab === 'mcp'" :class="{ selected: activeTab === 'mcp' }" @click="activeTab = 'mcp'; loadMcpTokens()">MCP</button>
      <button
        id="settings-tab-data"
        type="button"
        role="tab"
        aria-controls="settings-panel-data"
        :aria-selected="activeTab === 'data'"
        :class="{ selected: activeTab === 'data' }"
        @click="activeTab = 'data'"
      >
        Import
      </button>
      <button
        id="settings-tab-export"
        type="button"
        role="tab"
        aria-controls="settings-panel-export"
        :aria-selected="activeTab === 'export'"
        :class="{ selected: activeTab === 'export' }"
        @click="activeTab = 'export'"
      >
        Export
      </button>
    </div>
    <section v-if="activeTab === 'mcp'" id="settings-panel-mcp" class="settings-data" role="tabpanel" aria-labelledby="settings-tab-mcp" tabindex="0">
      <section class="card settings-card settings-intro-card">
        <p class="section-kicker">READ-ONLY INTEGRATIONS</p><h2>MCP access</h2>
        <p>Create a token for Codex or Claude. The secret is shown once; each token can only read the categories you select.</p>
        <form class="settings-form" @submit.prevent="createMcpToken">
          <label>Token name<input v-model="mcpName" name="mcpTokenName" autocomplete="off" maxlength="100" required placeholder="e.g. Codex desktop…" /></label>
          <label>Expires after<select v-model="mcpExpiry" name="mcpExpiry"><option value="three_hours">Three hours</option><option value="one_week">One week</option><option value="one_month">One month</option><option value="four_months">Four months</option><option value="one_year">One year</option></select></label>
          <fieldset class="mcp-categories"><legend>Accessible categories</legend><label v-for="category in mcpCategories" :key="category"><input v-model="selectedCategories" type="checkbox" :value="category" /> {{ category }}</label></fieldset>
          <button class="primary" type="submit" :disabled="creatingToken">{{ creatingToken ? "Creating…" : "Create token" }}</button>
        </form>
        <p v-if="revealedSecret" class="mcp-secret" role="status" aria-live="polite"><strong>Copy this token now; it will not be shown again.</strong><code>{{ revealedSecret }}</code><span>Endpoint: <code>{{ mcpEndpoint }}</code></span></p>
        <p v-if="mcpError" class="notice" role="alert">{{ mcpError }}</p>
      </section>
      <section class="card settings-card">
        <h2>Tokens</h2><p v-if="!mcpTokens.length" class="muted">No active tokens.</p>
        <article v-for="token in mcpTokens" :key="token.id" class="mcp-token">
          <div><strong>{{ token.name }}</strong><p class="muted">{{ token.categories.join(", ") }}</p><p class="muted">Created {{ formatDate(token.createdAt) }} · Expires {{ formatDate(token.expiresAt) }} · Last used {{ formatDate(token.lastUsedAt) }}</p></div>
          <button type="button" @click="revokeMcpToken(token)">Revoke…</button>
        </article>
      </section>
    </section>
    <section
      v-if="activeTab === 'account'"
      id="settings-panel-account"
      class="card settings-card settings-account-card"
      role="tabpanel"
      aria-labelledby="settings-tab-account"
      tabindex="0"
    >
      <div class="settings-card-heading">
        <div>
          <p class="section-kicker">ACCOUNT ACCESS</p>
          <h2 id="sign-in-title">Sign-in methods</h2>
        </div>
        <span v-if="account" class="settings-status">Connected</span>
      </div>
      <div v-if="account" class="account-summary">
        <span class="account-avatar" aria-hidden="true">{{
          account.email.charAt(0).toUpperCase()
        }}</span>
        <div>
          <strong>{{ account.email }}</strong>
          <p class="muted">Manage the ways you access your Knowledge Base.</p>
        </div>
      </div>
      <p v-else class="muted">Loading account details…</p>
      <p v-if="account?.hasGoogle">
        Google sign-in is connected to this account.
      </p>
      <p v-if="account?.hasPassword">
        A password is configured. You can use either password or Google sign-in.
      </p>
      <p v-else>
        Set a password to add password sign-in while keeping Google sign-in
        available.
      </p>
      <form
        @keydown.ctrl.enter.prevent="savePassword"
        @keydown.meta.enter.prevent="savePassword"
        id="password-change-form"
        class="settings-form"
        method="post"
        action="/settings"
        autocomplete="on"
        @submit.prevent="savePassword"
      >
        <input
          v-if="account"
          type="hidden"
          name="username"
          autocomplete="username"
          :value="account.email"
        />
        <label v-if="account?.hasPassword">
          Current password
          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            name="currentPassword"
            autocomplete="current-password"
            required
          />
        </label>
        <label>
          {{ account?.hasPassword ? "New password" : "Password" }}
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            name="newPassword"
            autocomplete="new-password"
            minlength="9"
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            name="confirmPassword"
            autocomplete="new-password"
            minlength="9"
            required
          />
        </label>
        <button class="primary" type="submit" :disabled="saving">
          {{
            saving
              ? "Saving…"
              : account?.hasPassword
                ? "Change password"
                : "Set password"
          }}
        </button>
      </form>
      <p v-if="message" class="success" role="status" aria-live="polite">
        {{ message }}
      </p>
      <p v-if="error" class="notice" role="alert" aria-live="polite">
        {{ error }}
      </p>
      <section class="settings-subsection" aria-labelledby="appearance-title">
        <div>
          <p class="section-kicker">APPEARANCE</p>
          <h3 id="appearance-title">Theme</h3>
          <p class="muted">
            Pick a palette for your workspace. System default follows your device.
          </p>
        </div>
        <label class="theme-choice">
          Theme preference
          <select
            class="theme-select"
            name="themePreference"
            autocomplete="off"
            :value="themePreference"
            @change="changeTheme"
          >
            <option v-for="option in themeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </section>
    </section>
    <section
      v-else-if="activeTab === 'data'"
      id="settings-panel-data"
      class="settings-data"
      role="tabpanel"
      aria-labelledby="settings-tab-data"
      tabindex="0"
    >
      <section class="card settings-card settings-intro-card">
        <p class="section-kicker">MOVE YOUR DATA</p>
        <h2 id="data-title">Import</h2>
        <p>Import Knowledge Base CSV files or Clockify sessions.</p>
      </section>
      <ImportsView embedded />
    </section>
    <section
      v-if="activeTab === 'export'"
      id="settings-panel-export"
      class="settings-data"
      role="tabpanel"
      aria-labelledby="settings-tab-export"
      tabindex="0"
    >
      <section class="card settings-card settings-intro-card">
        <p class="section-kicker">KEEP A COPY</p>
        <h2 id="export-title">Export</h2>
        <p>
          Download active sessions, paths, timeline, calendar inputs, notes, and
          labels as a portable CSV. Path and label colors, scopes, and
          assignments are included.
        </p>
        <div class="settings-action-row">
          <button class="primary" type="button" @click="exportData">
            Download Knowledge Base CSV
          </button>
          <span
            v-if="exportMessage"
            class="muted"
            role="status"
            aria-live="polite"
            >{{ exportMessage }}</span
          >
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.settings-view {
  max-width: 920px;
  display: grid;
  gap: 24px;
}
.settings-header h1,
.settings-header .lede,
.settings-card h2,
.settings-card p {
  margin: 0;
}
.settings-header .lede {
  max-width: 620px;
}
.settings-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--workspace-border);
}
.settings-tabs button {
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: var(--workspace-radius) var(--workspace-radius) 0 0;
  background: transparent;
  color: var(--workspace-muted);
  font-weight: 600;
}
.settings-tabs button:hover {
  background: var(--workspace-hover);
  color: var(--workspace-strong);
}
.settings-tabs button.selected {
  border-bottom-color: var(--workspace-accent);
  background: var(--workspace-selected);
  color: var(--workspace-text);
}
.settings-data {
  display: grid;
  gap: 24px;
}
.settings-card {
  display: grid;
  gap: 16px;
}
.settings-card-heading,
.account-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.settings-card-heading h2 {
  margin-top: 3px;
}
.settings-status {
  flex: 0 0 auto;
  border: 1px solid
    color-mix(in srgb, var(--workspace-success) 35%, var(--workspace-border));
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--workspace-success);
  font-size: 11px;
  font-weight: 650;
}
.account-summary {
  align-items: center;
  justify-content: flex-start;
  padding: 12px;
  border: 1px solid var(--workspace-border);
  border-radius: var(--workspace-radius);
  background: var(--workspace-selected);
}
.account-summary > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.account-summary strong {
  overflow-wrap: anywhere;
}
.account-summary p {
  font-size: 13px;
}
.account-avatar {
  display: inline-grid;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
  font-weight: 700;
}
.settings-form {
  display: grid;
  gap: 14px;
  max-width: 460px;
  margin-top: 4px;
}
.settings-card label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
}
.settings-card input {
  width: 100%;
}
.settings-action-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
}
.settings-intro-card {
  gap: 8px;
}
.settings-subsection {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 260px);
  align-items: center;
  gap: 24px;
  margin-top: 4px;
  padding-top: 20px;
  border-top: 1px solid var(--workspace-border);
}
.settings-subsection h3 {
  margin: 3px 0 2px;
  font-size: 14px;
}
.settings-subsection p {
  margin: 0;
}
.theme-choice {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
}
.theme-select {
  width: 100%;
  background: var(--workspace-surface);
  color: var(--workspace-text);
}
.success {
  color: var(--workspace-success, #247a45);
}
.mcp-categories { display: flex; flex-wrap: wrap; gap: 8px 14px; border: 1px solid var(--workspace-border); border-radius: var(--workspace-radius); padding: 12px; }
.mcp-categories legend { padding-inline: 4px; font-size: 12px; font-weight: 650; }
.mcp-categories label { display: flex; align-items: center; gap: 6px; text-transform: capitalize; }
.mcp-categories input { width: auto; min-width: 18px; min-height: 18px; }
.mcp-secret, .mcp-token { display: grid; gap: 8px; overflow-wrap: anywhere; }
.mcp-secret code { display: block; padding: 10px; border-radius: 6px; background: var(--workspace-selected); user-select: all; }
.mcp-token { grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding-top: 12px; border-top: 1px solid var(--workspace-border); }
.mcp-token p { margin: 3px 0 0; }
@media (max-width: 560px) {
  .settings-card-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .settings-tabs button {
    flex: 1;
    padding-inline: 10px;
  }
  .settings-subsection {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
