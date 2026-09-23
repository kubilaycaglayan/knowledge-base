export const resolveApiBase = (configured: string | undefined) =>
  configured || "/api/v1";
const base = resolveApiBase(import.meta.env.VITE_API_URL);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parseApiError(
  status: number,
  statusText: string,
  body: string,
): ApiError {
  let payload: { message?: string; error?: string } | undefined;
  try {
    payload = body
      ? (JSON.parse(body) as { message?: string; error?: string })
      : undefined;
  } catch {
    // Keep non-JSON responses as technical details below.
  }
  const message =
    status >= 500
      ? "Something went wrong. Please try again."
      : payload?.message || payload?.error || body || statusText;
  const details = body && body !== message ? body : undefined;
  return new ApiError(message, status, details);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("know_token");
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15000);
  const forwardAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    if (timedOut && error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.", 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
  if (
    res.status === 401 &&
    token &&
    localStorage.getItem("know_token") === token
  ) {
    localStorage.removeItem("know_token");
    if (typeof window !== "undefined") window.location.reload();
  }
  if (!res.ok)
    throw parseApiError(res.status, res.statusText, await res.text());
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function download(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem("know_token");
  const res = await fetch(base + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok)
    throw parseApiError(res.status, res.statusText, await res.text());
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
