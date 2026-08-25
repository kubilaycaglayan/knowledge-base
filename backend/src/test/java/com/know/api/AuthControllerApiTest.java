package com.know.api;

import com.know.domain.User;
import com.know.domain.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Optional;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class AuthControllerApiTest {
    @Autowired MockMvc mvc;
    @MockBean UserRepository users;
    @MockBean PasswordEncoder encoder;
    @MockBean com.know.security.AuthAttemptLimiter limiter;

    @BeforeEach void allowAuthenticationAttempts() { when(limiter.allow(anyString())).thenReturn(true); }

    @Test void registerReturnsBearerTokenAndNormalizesEmail() throws Exception {
        User saved=new User("person@example.com","hash","person");
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.empty());
        when(encoder.encode("correct-horse-battery")).thenReturn("hash");
        when(users.save(any(User.class))).thenReturn(saved);
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"Person@Example.com\",\"password\":\"correct-horse-battery\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty()).andExpect(jsonPath("$.email").value("person@example.com"));
        verify(encoder).encode("correct-horse-battery");
    }

    @Test void registrationRejectsShortPasswords() throws Exception {
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"person@example.com\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(users,encoder);
    }

    @Test void duplicateRegistrationIsRejected() throws Exception {
        User existing=new User("person@example.com","hash","person");
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(existing));
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"person@example.com\",\"password\":\"correct-horse-battery\"}"))
                .andExpect(status().isConflict());
        verifyNoInteractions(encoder);
    }

    @Test void invalidLoginDoesNotRevealWhetherAccountExists() throws Exception {
        User existing=new User("person@example.com","hash","person");
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(existing));
        when(encoder.matches("wrong-password-value", "hash")).thenReturn(false);
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"person@example.com\",\"password\":\"wrong-password-value\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test void rateLimitedAuthenticationReturnsTooManyRequests() throws Exception {
        when(limiter.allow(anyString())).thenReturn(false);
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"person@example.com\",\"password\":\"correct-horse-battery\"}"))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(users, encoder);
    }
}
