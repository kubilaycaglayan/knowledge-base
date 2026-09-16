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
  passwordConfirmation = ref(""),
  passwordVisible = ref(false),
  passwordConfirmationVisible = ref(false),
  submitting = ref(false),
  passwordConfirmationError = ref(""),
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
  if (submitting.value) return;
  error.value = "";
  passwordConfirmationError.value =
    register.value && passwordConfirmation.value !== password.value
      ? "Passwords do not match."
      : "";
  if (passwordConfirmationError.value) return;
  submitting.value = true;
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
  } finally {
    submitting.value = false;
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

  googleScript =
    document.querySelector<HTMLScriptElement>("#google-gsi-client");
  googleScript?.addEventListener("load", renderGoogleButton);
});

onUnmounted(() => {
  googleResizeObserver?.disconnect();
  googleScript?.removeEventListener("load", renderGoogleButton);
});
</script>

<template>
  <section class="auth card" aria-labelledby="auth-title">
    <h1 id="auth-title">{{ register ? "Create account" : "Sign in" }}</h1>
    <form :aria-busy="submitting" @submit.prevent="submit">
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
        >Password
        <div class="password-control">
          <input
            v-model="password"
            :type="passwordVisible ? 'text' : 'password'"
            name="password"
            :autocomplete="register ? 'new-password' : 'current-password'"
            minlength="9"
            required
            aria-label="Password"
          /><button
            class="password-visibility ghost"
            type="button"
            :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
            :title="passwordVisible ? 'Hide password' : 'Show password'"
            @click="passwordVisible = !passwordVisible"
          >
            <svg
              v-if="passwordVisible"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path
                d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.9 4.1 10 7-0.4 1.1-1.1 2.3-2.2 3.4M6.2 6.2C4.5 7.4 3.4 9.1 2 12c1.1 2.9 4.8 7 10 7 1.3 0 2.5-.3 3.5-.8"
              /></svg
            ><svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button></div></label
      ><label v-if="register"
        >Confirm password
        <div class="password-control">
          <input
            v-model="passwordConfirmation"
            :type="passwordConfirmationVisible ? 'text' : 'password'"
            name="passwordConfirmation"
            autocomplete="new-password"
            required
            aria-label="Confirm password"
          /><button
            class="password-visibility ghost"
            type="button"
            :aria-label="
              passwordConfirmationVisible
                ? 'Hide password confirmation'
                : 'Show password confirmation'
            "
            :title="
              passwordConfirmationVisible
                ? 'Hide password confirmation'
                : 'Show password confirmation'
            "
            @click="passwordConfirmationVisible = !passwordConfirmationVisible"
          >
            <svg
              v-if="passwordConfirmationVisible"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path
                d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.2 0 8.9 4.1 10 7-0.4 1.1-1.1 2.3-2.2 3.4M6.2 6.2C4.5 7.4 3.4 9.1 2 12c1.1 2.9 4.8 7 10 7 1.3 0 2.5-.3 3.5-.8"
              /></svg
            ><svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>
        </div>
        <span
          v-if="passwordConfirmationError"
          class="field-error"
          role="alert"
          >{{ passwordConfirmationError }}</span
        ></label
      ><button class="primary" type="submit" :disabled="submitting">
        <span v-if="submitting" class="auth-spinner" aria-hidden="true"></span>
        {{ register ? "Create account" : "Sign in" }}
      </button>
    </form>
    <div v-if="googleConfigured" class="google-login">
      <p class="muted">or continue with</p>
      <div ref="googleButton" aria-label="Continue with Google"></div>
    </div>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <button
      v-if="error"
      class="auth-retry text-button"
      type="button"
      @click="submit"
    >
      Try again
    </button>
    <button class="text-button" @click="register = !register">
      {{
        register
          ? "Already have an account? Sign in"
          : "New here? Create an account"
      }}
    </button>
  </section>
</template>
