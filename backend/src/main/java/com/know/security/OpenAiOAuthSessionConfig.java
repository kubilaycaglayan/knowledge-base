package com.know.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

/** Persist browser sessions only when the isolated OAuth login flow is enabled. */
@Configuration
@ConditionalOnProperty(prefix = "app.openai-oauth", name = "enabled", havingValue = "true")
@EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 900)
public class OpenAiOAuthSessionConfig {
  @Bean
  CookieSerializer cookieSerializer(
      @Value("${server.servlet.session.cookie.secure:true}") boolean secureCookie) {
    DefaultCookieSerializer serializer = new DefaultCookieSerializer();
    serializer.setCookieName("SESSION");
    serializer.setCookiePath("/");
    serializer.setUseSecureCookie(secureCookie);
    serializer.setUseHttpOnlyCookie(true);
    serializer.setSameSite("Lax");
    return serializer;
  }
}
