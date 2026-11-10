package com.know.security;

import java.time.Duration;
import java.util.UUID;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient;
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationConsentService;
import org.springframework.security.oauth2.server.authorization.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration;
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings;
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings;
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext;
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer;
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.jwk.source.JWKSource;

@Configuration
public class OpenAiOAuthConfig {
  @Bean
  @Order(2)
  @ConditionalOnProperty(prefix="app.openai-oauth", name="enabled", havingValue="true")
  SecurityFilterChain openAiBrowserChain(HttpSecurity http) throws Exception {
    http.securityMatcher("/connect/openai/**")
        .authorizeHttpRequests(a -> a.anyRequest().permitAll())
        .sessionManagement(s -> s.sessionCreationPolicy(org.springframework.security.config.http.SessionCreationPolicy.IF_REQUIRED));
    return http.build();
  }

  @Bean
  @Order(1)
  SecurityFilterChain authorizationServerChain(HttpSecurity http,
      @Value("${app.openai-oauth.enabled:false}") boolean enabled,
      @Value("${app.openai-oauth.issuer:https://knowledgebase.blaqc.space}") String issuer,
      @Value("${app.openai-oauth.redirect-uris:https://chatgpt.com/connector_platform_oauth_redirect}") String redirectUris) throws Exception {
    if (!enabled) {
      // The domain-verification challenge and protected-resource metadata must
      // stay public even before the OAuth client has been configured. Only the
      // OAuth and browser-connect surfaces are disabled by this chain.
      http.securityMatcher("/oauth2/**", "/connect/openai/**")
          .authorizeHttpRequests(a -> a.anyRequest().denyAll())
          .exceptionHandling(e -> e.authenticationEntryPoint((request, response, exception) -> response.sendError(401)));
      return http.build();
    }
    OAuth2AuthorizationServerConfiguration.applyDefaultSecurity(http);
    http.addFilterBefore(new OAuthResourceParameterFilter(issuer, redirectUris), SecurityContextHolderFilter.class);
    http.getConfigurer(org.springframework.security.oauth2.server.authorization.config.annotation.web.configurers.OAuth2AuthorizationServerConfigurer.class)
        .authorizationEndpoint(endpoint -> endpoint.consentPage("/connect/openai/consent"))
        .authorizationServerMetadataEndpoint(endpoint -> endpoint.authorizationServerMetadataCustomizer(
            metadata -> metadata.claim("authorization_response_iss_parameter_supported", true)));
    http.exceptionHandling(e -> e.authenticationEntryPoint((request, response, exception) ->
        response.sendRedirect("/connect/openai/login")));
    return http.build();
  }

  @Bean
  RegisteredClientRepository registeredClientRepository(JdbcTemplate jdbc, PasswordEncoder encoder,
      @Value("${app.openai-oauth.enabled:false}") boolean enabled,
      @Value("${app.openai-oauth.client-id:knowledge-base-openai}") String clientId,
      @Value("${app.openai-oauth.client-secret:}") String clientSecret,
      @Value("${app.openai-oauth.redirect-uris:https://chatgpt.com/connector_platform_oauth_redirect}") String redirectUris) {
    JdbcRegisteredClientRepository repository = new JdbcRegisteredClientRepository(jdbc);
    if (enabled && !clientSecret.isBlank()) {
      java.util.Set<String> allowedRedirects = java.util.Arrays.stream(redirectUris.split(","))
          .map(String::trim).filter(uri -> !uri.isBlank())
          .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
      RegisteredClient existing = repository.findByClientId(clientId);
      if (existing != null) {
        RegisteredClient.Builder updated = RegisteredClient.from(existing)
            .redirectUris(uris -> { uris.clear(); uris.addAll(allowedRedirects); });
        if (existing.getClientSecret() == null || !encoder.matches(clientSecret, existing.getClientSecret()))
          updated.clientSecret(encoder.encode(clientSecret));
        repository.save(updated.build());
        return repository;
      }
      RegisteredClient client = RegisteredClient.withId(UUID.randomUUID().toString())
          .clientId(clientId)
          .clientSecret(encoder.encode(clientSecret))
          .clientName("Recall Personal Knowledge Base")
          .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
          .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
          .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
          .redirectUris(uris -> uris.addAll(allowedRedirects))
          .scope("kb:notes:read").scope("kb:logs:read").scope("kb:calendar:read")
          .scope("kb:sessions:read").scope("kb:activity:read").scope("kb:reports:read")
          .scope("kb:paths:read").scope("kb:labels:read").scope("kb:boards:read")
          .clientSettings(ClientSettings.builder().requireAuthorizationConsent(true).requireProofKey(true).build())
          .tokenSettings(TokenSettings.builder().accessTokenTimeToLive(Duration.ofMinutes(15))
              .refreshTokenTimeToLive(Duration.ofDays(30)).reuseRefreshTokens(false).build())
          .build();
      repository.save(client);
    }
    return repository;
  }

  @Bean
  OAuth2AuthorizationService authorizationService(JdbcTemplate jdbc, RegisteredClientRepository clients) {
    return new TrackedOAuth2AuthorizationService(new JdbcOAuth2AuthorizationService(jdbc, clients), jdbc);
  }

  @Bean
  OAuth2AuthorizationConsentService authorizationConsentService(JdbcTemplate jdbc, RegisteredClientRepository clients) {
    return new JdbcOAuth2AuthorizationConsentService(jdbc, clients);
  }

  @Bean
  AuthorizationServerSettings authorizationServerSettings(
      @Value("${app.openai-oauth.issuer:https://knowledgebase.blaqc.space}") String issuer) {
    return AuthorizationServerSettings.builder().issuer(issuer).build();
  }

  @Bean
  @ConditionalOnProperty(prefix="app.openai-oauth", name="enabled", havingValue="true")
  RSAKey openAiSigningKey(JdbcTemplate jdbc) {
    String serialized = jdbc.query("select jwk from oauth2_signing_key where id=1",
        rs -> rs.next() ? rs.getString(1) : null);
    if (serialized == null) {
      try {
        String generated = new RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString())
            .generate().toJSONString();
        jdbc.update("insert into oauth2_signing_key(id,jwk) values(1,?) on conflict (id) do nothing", generated);
        serialized = jdbc.query("select jwk from oauth2_signing_key where id=1",
            rs -> rs.next() ? rs.getString(1) : null);
      } catch (Exception e) {
        throw new IllegalStateException("Could not initialize the OpenAI OAuth signing key", e);
      }
    }
    try {
      return RSAKey.parse(serialized);
    } catch (java.text.ParseException e) {
      throw new IllegalStateException("Stored OpenAI OAuth signing key is invalid", e);
    }
  }

  @Bean
  @ConditionalOnProperty(prefix="app.openai-oauth", name="enabled", havingValue="true")
  JWKSource<SecurityContext> openAiJwkSource(RSAKey openAiSigningKey) {
    JWKSet keys = new JWKSet(openAiSigningKey);
    return (selector, context) -> selector.select(keys);
  }

  @Bean
  @ConditionalOnProperty(prefix="app.openai-oauth", name="enabled", havingValue="true")
  OAuth2TokenCustomizer<JwtEncodingContext> openAiAudienceCustomizer(JdbcTemplate jdbc) {
    return context -> {
      if (!OAuth2TokenType.ACCESS_TOKEN.equals(context.getTokenType())) return;
      String resource = jdbc.query(
          "select resource from oauth2_authorization_resource where authorization_id=?",
          rs -> rs.next() ? rs.getString(1) : null,
          context.getAuthorization().getId());
      if (resource == null || resource.isBlank())
        throw new IllegalStateException("OAuth authorization has no protected resource");
      context.getClaims().audience(new java.util.ArrayList<>(List.of(resource)));
    };
  }

  @Bean
  @ConditionalOnProperty(prefix="app.openai-oauth", name="enabled", havingValue="true")
  JwtDecoder openAiJwtDecoder(RSAKey openAiSigningKey,
      @Value("${app.openai-oauth.issuer:https://knowledgebase.blaqc.space}") String issuer) throws Exception {
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(openAiSigningKey.toRSAPublicKey()).build();
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
    return decoder;
  }
}
