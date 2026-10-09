package com.know.security;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class AuthAttemptLimiterTest {
  @Test
  void allowsTenAttemptsThenBlocksTheKey() {
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(() -> 0L);
    for (int attempt = 0; attempt < 10; attempt++)
      assertTrue(limiter.allow("127.0.0.1|person@example.com"));
    assertFalse(limiter.allow("127.0.0.1|person@example.com"));
    assertTrue(limiter.allow("127.0.0.1|other@example.com"));
  }

  @Test
  void resetsAtTheExactWindowBoundaryWithoutSleeping() {
    AtomicLong now = new AtomicLong(1_000L);
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(now::get);
    for (int attempt = 0; attempt < 10; attempt++) assertTrue(limiter.allow("client|user"));
    assertFalse(limiter.allow("client|user"));

    now.addAndGet(Duration.ofMinutes(1).toNanos() - 1);
    assertFalse(limiter.allow("client|user"));
    now.incrementAndGet();
    assertTrue(limiter.allow("client|user"));
  }

  @Test
  void concurrentAttemptsCannotExceedTheBudget() throws Exception {
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(() -> 0L);
    int callers = 100;
    CountDownLatch ready = new CountDownLatch(callers);
    CountDownLatch start = new CountDownLatch(1);
    try (ExecutorService pool = Executors.newFixedThreadPool(callers)) {
      var results = new java.util.ArrayList<Future<Boolean>>();
      for (int i = 0; i < callers; i++) {
        results.add(pool.submit(() -> {
          ready.countDown();
          assertTrue(start.await(5, TimeUnit.SECONDS));
          return limiter.allow("shared|key");
        }));
      }
      assertTrue(ready.await(5, TimeUnit.SECONDS));
      start.countDown();
      long allowed = 0;
      for (Future<Boolean> result : results) if (result.get(5, TimeUnit.SECONDS)) allowed++;
      assertEquals(10, allowed);
    }
  }

  @Test
  void expiredKeysAreReclaimedAfterTheMapCrossesCleanupThreshold() {
    AtomicLong now = new AtomicLong(0L);
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(now::get);
    for (int key = 0; key < 1_001; key++) assertTrue(limiter.allow("client|" + key));
    assertEquals(1_001, limiter.trackedKeyCount());

    now.addAndGet(Duration.ofMinutes(1).toNanos());
    assertTrue(limiter.allow("client|fresh"));
    assertEquals(1, limiter.trackedKeyCount());
  }

  @Test
  void activeDistinctKeysRemainTrackedAndHaveIndependentBudgets() {
    AuthAttemptLimiter limiter = new AuthAttemptLimiter(() -> 0L);
    for (int key = 0; key < 2_000; key++) assertTrue(limiter.allow("client|" + key));
    assertEquals(2_000, limiter.trackedKeyCount());
    assertTrue(limiter.allow("client|0"));
    assertTrue(limiter.allow("client|1999"));
  }
}
