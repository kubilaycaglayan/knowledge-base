package com.know.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;

/** Persist browser sessions only when the isolated OAuth login flow is enabled. */
@Configuration
@ConditionalOnProperty(prefix = "app.openai-oauth", name = "enabled", havingValue = "true")
@EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 900)
public class OpenAiOAuthSessionConfig {}
