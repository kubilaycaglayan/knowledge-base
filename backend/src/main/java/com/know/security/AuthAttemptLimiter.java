package com.know.security;

import org.springframework.stereotype.Component;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AuthAttemptLimiter {
    private static final int MAX_ATTEMPTS = 10;
    private static final long WINDOW_NANOS = Duration.ofMinutes(1).toNanos();
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public boolean allow(String key) {
        long now = System.nanoTime();
        Window next = windows.compute(key, (ignored, current) -> {
            if (current == null || now >= current.resetAt()) return new Window(1, now + WINDOW_NANOS);
            return new Window(current.attempts() + 1, current.resetAt());
        });
        if (windows.size() > 1_000) windows.entrySet().removeIf(entry -> now >= entry.getValue().resetAt());
        return next.attempts() <= MAX_ATTEMPTS;
    }

    private record Window(int attempts, long resetAt) {}
}
