<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../lib/api";

type GoogleApi = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(
        element: HTMLElement,
        options: Record<string, string | number>,
      ): void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleApi;
  }
}

const emit = defineEmits<{ authenticated: [] }>();
const register = ref(false),
  email = ref(""),
  password = ref(""),
  error = ref("");
const googleButton = ref<HTMLElement | null>(null);
const googleClientId =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";
const googleConfigured = Boolean(googleClientId);

async function acceptToken(result: { token: string }) {
  localStorage.setItem("know_token", result.token);
  emit("authenticated");
}

async function submit() {
  error.value = "";
  try {
    await acceptToken(
      await api<{ token: string }>(
        register.value ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.value,
            password: password.value,
          }),
        },
      ),
    );
  } catch {
    error.value =
      "Could not authenticate. Use a valid email and a password of at least 12 characters.";
  }
}

async function googleLogin(idToken: string) {
  error.value = "";
  try {
    await acceptToken(
      await api<{ token: string }>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      }),
    );
  } catch {
    error.value = "Google sign-in could not be completed. Try again.";
  }
}

onMounted(() => {
  if (!googleConfigured || !googleButton.value || !window.google) return;
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: (response) => void googleLogin(response.credential),
  });
  window.google.accounts.id.renderButton(googleButton.value, {
    theme: "outline",
    size: "large",
    width: 320,
  });
});
</script>

<template>
  <section class="auth card" aria-labelledby="auth-title">
    <p class="eyebrow">YOUR PRIVATE WORKSPACE</p>
    <h1 id="auth-title">{{ register ? "Create account" : "Welcome back" }}</h1>
    <p class="lede">
      Keep the things you learn, do, and remember in one place.
    </p>
    <form @submit.prevent="submit">
      <label
        >Email<input
          v-model="email"
          type="email"
          required
          aria-label="Email" /></label
      ><label
        >Password<input
          v-model="password"
          type="password"
          minlength="12"
          required
          aria-label="Password" /></label
      ><button class="primary">
        {{ register ? "Create account" : "Sign in" }}
      </button>
    </form>
    <div v-if="googleConfigured" class="google-login">
      <p class="muted">or continue with</p>
      <div ref="googleButton" aria-label="Continue with Google"></div>
    </div>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <button class="text-button" @click="register = !register">
      {{
        register
          ? "Already have an account? Sign in"
          : "New here? Create an account"
      }}
    </button>
  </section>
</template>
