package com.know.service;

import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;

@Component
public class TimerEventPublisher {
  private final ApplicationEventPublisher events;

  public TimerEventPublisher(ApplicationEventPublisher events) {
    this.events = events;
  }

  public void changed(UUID userId, TimerService.TimeView timer) {
    events.publishEvent(new TimerChangedEvent(userId, timer));
  }

}
