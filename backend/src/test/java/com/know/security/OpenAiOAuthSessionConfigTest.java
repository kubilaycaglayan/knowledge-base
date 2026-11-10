package com.know.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.web.http.CookieSerializer;

class OpenAiOAuthSessionConfigTest {
  @Test
  void secureCookieAttributesAreExplicitEvenWhenTheRequestIsNotSecure() {
    CookieSerializer serializer = new OpenAiOAuthSessionConfig().cookieSerializer(true);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();

    serializer.writeCookieValue(new CookieSerializer.CookieValue(request, response, "session-id"));

    String setCookie = response.getHeader("Set-Cookie");
    assertNotNull(setCookie);
    assertTrue(setCookie.startsWith("SESSION="));
    assertTrue(setCookie.contains("Path=/"));
    assertTrue(setCookie.contains("Secure"));
    assertTrue(setCookie.contains("HttpOnly"));
    assertTrue(setCookie.contains("SameSite=Lax"));
  }

  @Test
  void secureCookieCanBeDisabledForExplicitLocalConfigurations() {
    CookieSerializer serializer = new OpenAiOAuthSessionConfig().cookieSerializer(false);
    MockHttpServletRequest request = new MockHttpServletRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();

    serializer.writeCookieValue(new CookieSerializer.CookieValue(request, response, "session-id"));

    assertFalse(response.getHeader("Set-Cookie").contains("Secure"));
  }
}
