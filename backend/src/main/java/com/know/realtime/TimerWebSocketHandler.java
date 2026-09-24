package com.know.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.security.JwtTokenService;
import com.know.service.TimerChangedEvent;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
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
    TextMessage message = new TextMessage(payload);
    userSessions.values().removeIf(session -> !send(session, message));
    if (userSessions.isEmpty()) sessions.remove(userId, userSessions);
  }

  // Proxies such as Cloudflare close WebSockets that carry no traffic for
  // about 100 seconds; a ping keeps quiet timer connections open.
  @Scheduled(fixedRate = 30_000, initialDelay = 30_000)
  public void sendHeartbeats() {
    sessions.forEach(
        (userId, userSessions) -> {
          userSessions
              .values()
              .removeIf(session -> !send(session, new PingMessage(ByteBuffer.allocate(0))));
          if (userSessions.isEmpty()) sessions.remove(userId, userSessions);
        });
  }

  private boolean send(WebSocketSession session, WebSocketMessage<?> message) {
    try {
      if (!session.isOpen()) return false;
      synchronized (session) {
        session.sendMessage(message);
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
