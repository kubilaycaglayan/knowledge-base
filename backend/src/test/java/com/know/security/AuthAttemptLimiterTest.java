package com.know.security;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthAttemptLimiterTest {
    @Test void allowsTenAttemptsThenBlocksTheKey() {
        AuthAttemptLimiter limiter = new AuthAttemptLimiter();
        for (int attempt = 0; attempt < 10; attempt++) assertTrue(limiter.allow("127.0.0.1|person@example.com"));
        assertFalse(limiter.allow("127.0.0.1|person@example.com"));
        assertTrue(limiter.allow("127.0.0.1|other@example.com"));
    }
}
