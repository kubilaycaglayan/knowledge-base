<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { theme } from "../lib/theme";
import { useAuthStore } from "../stores/auth";

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
const auth = useAuthStore();
const register = ref(false),
  email = ref(""),
  password = ref(""),
  error = ref("");
const googleButton = ref<HTMLElement | null>(null);
const googleClientId =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";
const googleConfigured = Boolean(googleClientId);

async function acceptToken(result: { token: string }) {
  auth.setToken(result.token);
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
      "Could not authenticate. Use a valid email and a password of at least 9 characters.";
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

let googleInitialized = false;
let renderedGoogleStyle = "";
let googleResizeObserver: ResizeObserver | undefined;
function renderGoogleButton() {
  if (!googleConfigured || !googleButton.value || !window.google) return;
  if (!googleInitialized) {
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => void googleLogin(response.credential),
    });
    googleInitialized = true;
  }
  const width = Math.min(320, googleButton.value.clientWidth || 320);
  const signature = `${theme.value}:${width}`;
  if (signature === renderedGoogleStyle) return;
  renderedGoogleStyle = signature;
  window.google.accounts.id.renderButton(googleButton.value, {
    theme: theme.value === "dark" ? "filled_black" : "outline",
    size: "large",
    width,
  });
}
watch(theme, renderGoogleButton);

let googleScript: HTMLScriptElement | null = null;

onMounted(() => {
  if (!googleConfigured) return;
  if (typeof ResizeObserver !== "undefined" && googleButton.value) {
    googleResizeObserver = new ResizeObserver(renderGoogleButton);
    googleResizeObserver.observe(googleButton.value);
  }

  if (window.google) {
    renderGoogleButton();
    return;
  }

  googleScript = document.querySelector<HTMLScriptElement>("#google-gsi-client");
  googleScript?.addEventListener("load", renderGoogleButton);
});

onUnmounted(() => {
  googleResizeObserver?.disconnect();
  googleScript?.removeEventListener("load", renderGoogleButton);
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
          name="email"
          autocomplete="username"
          :spellcheck="false"
          required
          aria-label="Email" /></label
      ><label
        >Password<input
          v-model="password"
          type="password"
          name="password"
          :autocomplete="register ? 'new-password' : 'current-password'"
          minlength="9"
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
