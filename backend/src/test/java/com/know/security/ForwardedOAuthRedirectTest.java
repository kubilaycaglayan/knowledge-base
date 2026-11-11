package com.know.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.web.servlet.ServletWebServerFactoryAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.FileSystemResource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.web.filter.ForwardedHeaderFilter;

class ForwardedOAuthRedirectTest {
  @Test
  void proxyHttpsRequestKeepsHttpsInLoginRedirect() {
    new WebApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(ServletWebServerFactoryAutoConfiguration.class))
        .withInitializer(context -> {
          try {
            new YamlPropertySourceLoader().load("application", new FileSystemResource("src/main/resources/application.yml"))
                .forEach(source -> context.getEnvironment().getPropertySources().addLast(source));
          } catch (java.io.IOException exception) {
            throw new IllegalStateException(exception);
          }
        })
        .run(context -> {
          var request = new MockHttpServletRequest("GET", "/oauth2/authorize");
          request.setServerName("knowledgebase.blaqc.space");
          request.addHeader("X-Forwarded-Proto", "https");
          request.addHeader("X-Forwarded-Host", "knowledgebase.blaqc.space");
          var response = new MockHttpServletResponse();
          var entryPoint = new LoginUrlAuthenticationEntryPoint("/connect/openai/login");
          jakarta.servlet.FilterChain login = (req, res) -> entryPoint.commence(
              (jakarta.servlet.http.HttpServletRequest) req,
              (jakarta.servlet.http.HttpServletResponse) res,
              new InsufficientAuthenticationException("Sign in"));
          var filter = context.getBeansOfType(FilterRegistrationBean.class).values().stream()
              .map(FilterRegistrationBean::getFilter)
              .filter(ForwardedHeaderFilter.class::isInstance)
              .map(ForwardedHeaderFilter.class::cast).findFirst();
          if (filter.isEmpty()) login.doFilter(request, response);
          else filter.get().doFilter(request, response, login);
          assertEquals("https://knowledgebase.blaqc.space/connect/openai/login", response.getRedirectedUrl());
        });
  }
}
