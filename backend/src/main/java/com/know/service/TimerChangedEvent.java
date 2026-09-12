package com.know.service;

import java.util.UUID;

/** Published after a committed timer mutation for one user's connected clients. */
public record TimerChangedEvent(UUID userId, TimerService.TimeView timer) {}
