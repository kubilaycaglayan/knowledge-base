package com.know.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.security.JwtTokenService;
import com.know.service.TimerChangedEvent;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class TimerWebSocketHandler extends TextWebSocketHandler {
  private final ObjectMapper mapper;
  private final JwtTokenService tokens;
  private final ConcurrentMap<UUID, ConcurrentMap<String, WebSocketSession>> sessions =
      new ConcurrentHashMap<>();
  private final ConcurrentMap<String, UUID> authenticatedUsers = new ConcurrentHashMap<>();

  public TimerWebSocketHandler(ObjectMapper mapper, JwtTokenService tokens) {
    this.mapper = mapper;
    this.tokens = tokens;
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message)
      throws IOException {
    if (authenticatedUsers.containsKey(session.getId())) return;
    try {
      AuthMessage auth = mapper.readValue(message.getPayload(), AuthMessage.class);
      UUID userId = tokens.userId(auth.token());
      authenticatedUsers.put(session.getId(), userId);
      sessions
          .computeIfAbsent(userId, ignored -> new ConcurrentHashMap<>())
          .put(session.getId(), session);
      session.sendMessage(new TextMessage("{\"type\":\"READY\"}"));
    } catch (Exception ex) {
      session.close(CloseStatus.POLICY_VIOLATION);
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void timerChanged(TimerChangedEvent event) {
    UUID userId = event.userId();
    var userSessions = sessions.get(userId);
    if (userSessions == null) return;
    String payload;
    try {
      payload = mapper.writeValueAsString(new TimerMessage(event.timer()));
    } catch (IOException ex) {
      return;
    }
    userSessions.values().removeIf(session -> !send(session, payload));
    if (userSessions.isEmpty()) sessions.remove(userId, userSessions);
  }

  private boolean send(WebSocketSession session, String payload) {
    try {
      if (!session.isOpen()) return false;
      synchronized (session) {
        session.sendMessage(new TextMessage(payload));
      }
      return true;
    } catch (IOException ex) {
      close(session);
      return false;
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    UUID userId = authenticatedUsers.remove(session.getId());
    if (userId == null) return;
    var userSessions = sessions.get(userId);
    if (userSessions != null) {
      userSessions.remove(session.getId());
      if (userSessions.isEmpty()) sessions.remove(userId, userSessions);
    }
  }

  private void close(WebSocketSession session) {
    try {
      session.close(CloseStatus.SERVER_ERROR);
    } catch (IOException ignored) {
    }
  }

  private record AuthMessage(String type, String token) {}

  private record TimerMessage(String type, com.know.service.TimerService.TimeView timer) {
    TimerMessage(com.know.service.TimerService.TimeView timer) {
      this("TIMER_STATE", timer);
    }
  }
}
