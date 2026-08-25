package com.know.api;

import com.know.domain.*;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/v1/auth")
public class AuthController {
    private final UserRepository users; private final PasswordEncoder encoder; private final com.know.security.AuthAttemptLimiter limiter; private final SecretKey key;
    public AuthController(UserRepository users, PasswordEncoder encoder, com.know.security.AuthAttemptLimiter limiter, @Value("${app.jwt-secret}") String secret) { this.users=users; this.encoder=encoder; this.limiter=limiter; this.key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); }
    record Credentials(@Email @NotBlank String email, @NotBlank @Size(min=12,max=200) String password) {}
    record AuthResponse(String token, UUID userId, String email, String displayName) {}
    @PostMapping("/register") public AuthResponse register(@Valid @RequestBody Credentials c, jakarta.servlet.http.HttpServletRequest request) {
        String email=c.email().trim().toLowerCase(Locale.ROOT); checkRate(request,email); if(users.findByEmailIgnoreCase(email).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Email already registered");
        User u=users.save(new User(email,encoder.encode(c.password()),email.substring(0,email.indexOf('@')))); return response(u);
    }
    @PostMapping("/login") public AuthResponse login(@Valid @RequestBody Credentials c, jakarta.servlet.http.HttpServletRequest request) { String email=c.email().trim().toLowerCase(Locale.ROOT); checkRate(request,email); User u=users.findByEmailIgnoreCase(email).filter(x->encoder.matches(c.password(),x.getPasswordHash())).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid credentials")); return response(u); }
    private void checkRate(jakarta.servlet.http.HttpServletRequest request,String email){if(!limiter.allow(request.getRemoteAddr()+"|"+email))throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many authentication attempts; try again shortly");}
    private AuthResponse response(User u){String token=Jwts.builder().subject(u.getId().toString()).claim("email",u.getEmail()).issuedAt(new Date()).expiration(Date.from(Instant.now().plusSeconds(86400*30))).signWith(key).compact(); return new AuthResponse(token,u.getId(),u.getEmail(),u.getDisplayName());}
}
