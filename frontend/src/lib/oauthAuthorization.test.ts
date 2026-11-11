import { navigateToOAuthContinuation } from "./oauthAuthorization";

it("only follows same-origin OAuth continuations", () => {
  const navigate = vi.fn();
  navigateToOAuthContinuation("/oauth2/authorize?state=test", navigate);

  expect(navigate).toHaveBeenCalledWith("/oauth2/authorize?state=test");
  expect(() => navigateToOAuthContinuation("https://attacker.example/collect", navigate))
    .toThrow("The connection continuation is invalid.");
  expect(navigate).toHaveBeenCalledTimes(1);
});
