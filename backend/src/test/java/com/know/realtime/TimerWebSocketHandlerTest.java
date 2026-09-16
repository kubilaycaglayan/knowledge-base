package com.know.realtime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.security.JwtTokenService;
import com.know.service.TimerChangedEvent;
import com.know.service.TimerService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

class TimerWebSocketHandlerTest {
  private final JwtTokenService tokens = mock(JwtTokenService.class);
  private final TimerWebSocketHandler handler =
      new TimerWebSocketHandler(new ObjectMapper().findAndRegisterModules(), tokens);

  @Test
  void authenticatesAConnectionBeforeRegisteringIt() throws Exception {
    UUID user = UUID.randomUUID();
    WebSocketSession session = session("one");
    when(tokens.userId("token")).thenReturn(user);

    handler.handleMessage(session, new TextMessage("{\"type\":\"AUTH\",\"token\":\"token\"}"));

    verify(session).sendMessage(new TextMessage("{\"type\":\"READY\"}"));
    handler.timerChanged(new TimerChangedEvent(user, timer(UUID.randomUUID())));
    verify(session, times(2)).sendMessage(any(TextMessage.class));
  }

  @Test
  void rejectsInvalidAuthenticationAndDoesNotBroadcastToAnotherUser() throws Exception {
    UUID firstUser = UUID.randomUUID();
    UUID secondUser = UUID.randomUUID();
    WebSocketSession first = session("first");
    WebSocketSession second = session("second");
    when(tokens.userId("bad")).thenThrow(new IllegalArgumentException("bad token"));
    when(tokens.userId("good")).thenReturn(secondUser);

    handler.handleMessage(first, new TextMessage("{\"type\":\"AUTH\",\"token\":\"bad\"}"));
    handler.handleMessage(second, new TextMessage("{\"type\":\"AUTH\",\"token\":\"good\"}"));
    handler.timerChanged(new TimerChangedEvent(firstUser, timer(UUID.randomUUID())));

    verify(first).close(CloseStatus.POLICY_VIOLATION);
    verify(second, times(1)).sendMessage(new TextMessage("{\"type\":\"READY\"}"));
  }

  @Test
  void sendsNullTimerStateWhenTheRunningTimerStops() throws Exception {
    UUID user = UUID.randomUUID();
    WebSocketSession session = session("one");
    when(tokens.userId("token")).thenReturn(user);
    handler.handleMessage(session, new TextMessage("{\"type\":\"AUTH\",\"token\":\"token\"}"));

    handler.timerChanged(new TimerChangedEvent(user, null));

    verify(session).sendMessage(new TextMessage("{\"type\":\"TIMER_STATE\",\"timer\":null}"));
  }

  private WebSocketSession session(String id) {
    WebSocketSession session = mock(WebSocketSession.class);
    when(session.getId()).thenReturn(id);
    when(session.isOpen()).thenReturn(true);
    return session;
  }

  private TimerService.TimeView timer(UUID id) {
    return new TimerService.TimeView(
        id, null, List.of(), Instant.parse("2026-09-12T10:00:00Z"), null, null, "Read", null, true);
  }
}
