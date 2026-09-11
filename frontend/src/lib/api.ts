export const resolveApiBase = (configured: string | undefined) =>
  configured || "/api/v1";
const base = resolveApiBase(import.meta.env.VITE_API_URL);
const diagnosticSessionId = crypto.randomUUID();
const diagnostic = (event: string, details: Record<string, unknown>) =>
  console.info("[Knowledge Base web]", event, { sessionId: diagnosticSessionId, ...details });
const diagnosticError = (event: string, details: Record<string, unknown>) =>
  console.error("[Knowledge Base web]", event, { sessionId: diagnosticSessionId, ...details });

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

function parseApiError(status: number, statusText: string, body: string): ApiError {
  let payload: { message?: string } | undefined;
  try {
    payload = body ? JSON.parse(body) as { message?: string } : undefined;
  } catch {
    // Keep non-JSON responses as technical details below.
  }
  const message = status >= 500
    ? "Something went wrong. Please try again."
    : payload?.message || body || statusText;
  const details = body && body !== message ? body : undefined;
  return new ApiError(message, status, details);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("know_token");
  const requestId = `web-${crypto.randomUUID()}`;
  const method = options.method || "GET";
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const forwardAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  let res: Response;
  diagnostic("API request started", { requestId, method, path, tokenPresent: Boolean(token) });
  try {
    res = await fetch(base + path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    diagnosticError("API request failed", {
      requestId, method, path, durationMs: Math.round(performance.now() - startedAt),
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
  diagnostic("API response received", {
    requestId,
    serverRequestId: res.headers?.get?.("X-Request-ID") || null,
    method,
    path,
    status: res.status,
    durationMs: Math.round(performance.now() - startedAt),
    contentType: res.headers?.get?.("content-type") || null,
  });
  if (res.status === 401 && token && localStorage.getItem("know_token") === token) {
    localStorage.removeItem("know_token");
    if (typeof window !== "undefined") window.location.reload();
  }
  if (!res.ok) {
    const body = await res.text();
    diagnosticError("API response rejected", {
      requestId, method, path, status: res.status, responseBytes: body.length,
    });
    throw parseApiError(res.status, res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  try {
    const parsed = (body ? JSON.parse(body) : undefined) as T;
    diagnostic("API response parsed", {
      requestId, method, path, responseBytes: body.length,
      responseShape: Array.isArray(parsed) ? `array(${parsed.length})` : parsed === null ? "null" : typeof parsed,
    });
    return parsed;
  } catch (error) {
    diagnosticError("API response parse failed", {
      requestId, method, path, status: res.status, responseBytes: body.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function download(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem("know_token");
  const requestId = `web-${crypto.randomUUID()}`;
  const startedAt = performance.now();
  diagnostic("Download started", { requestId, path, tokenPresent: Boolean(token) });
  let res: Response;
  try {
    res = await fetch(base + path, {
      headers: {
        "X-Request-ID": requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    diagnosticError("Download failed", {
      requestId, path, durationMs: Math.round(performance.now() - startedAt),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  diagnostic("Download response received", {
    requestId, serverRequestId: res.headers.get("X-Request-ID"), path,
    status: res.status, durationMs: Math.round(performance.now() - startedAt),
  });
  if (!res.ok) {
    const body = await res.text();
    diagnosticError("Download response rejected", { requestId, path, status: res.status, responseBytes: body.length });
    throw parseApiError(res.status, res.statusText, body);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  diagnostic("Download completed", { requestId, path });
}
