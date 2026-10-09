package com.know.security;

import java.time.Duration;
import java.util.Objects;
import java.util.function.LongSupplier;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class AuthAttemptLimiter {
  private static final int MAX_ATTEMPTS = 10;
  private static final long WINDOW_NANOS = Duration.ofMinutes(1).toNanos();
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
  private final LongSupplier nanoTime;

  public AuthAttemptLimiter() {
    this(System::nanoTime);
  }

  AuthAttemptLimiter(LongSupplier nanoTime) {
    this.nanoTime = Objects.requireNonNull(nanoTime);
  }

  public boolean allow(String key) {
    long now = nanoTime.getAsLong();
    Window next =
        windows.compute(
            key,
            (ignored, current) -> {
              if (current == null || now >= current.resetAt())
                return new Window(1, now + WINDOW_NANOS);
              return new Window(current.attempts() + 1, current.resetAt());
            });
    if (windows.size() > 1_000)
      windows.entrySet().removeIf(entry -> now >= entry.getValue().resetAt());
    return next.attempts() <= MAX_ATTEMPTS;
  }

  int trackedKeyCount() {
    return windows.size();
  }

  private record Window(int attempts, long resetAt) {}
}
