const continuationPaths = new Set(["/", "/oauth2/authorize", "/connect/openai/login"]);

export function navigateToOAuthContinuation(
  value: string,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
  const destination = new URL(value, window.location.origin);
  if (destination.origin !== window.location.origin || !continuationPaths.has(destination.pathname)) {
    throw new Error("The connection continuation is invalid.");
  }
  navigate(`${destination.pathname}${destination.search}${destination.hash}`);
}
