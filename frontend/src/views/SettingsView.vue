<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";

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

onMounted(load);
</script>

<template>
  <section class="settings-view">
    <p class="eyebrow">ACCOUNT</p>
    <h1>Settings</h1>
    <p class="lede">Manage how you sign in to Knowledge Base.</p>
    <section class="card settings-card" aria-labelledby="sign-in-title">
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
  </section>
</template>

<style scoped>
.settings-view { max-width: 680px; }
.settings-card { display: grid; gap: 12px; }
.settings-card h2, .settings-card p { margin: 0; }
.settings-card form { display: grid; gap: 14px; margin-top: 8px; }
.settings-card label { display: grid; gap: 6px; font-weight: 600; }
.settings-card input { width: 100%; }
.success { color: var(--workspace-success, #247a45); }
</style>
