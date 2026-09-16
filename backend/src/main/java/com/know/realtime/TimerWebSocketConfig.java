package com.know.realtime;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class TimerWebSocketConfig implements WebSocketConfigurer {
  private final TimerWebSocketHandler handler;
  private final String origins;

  public TimerWebSocketConfig(
      TimerWebSocketHandler handler, @Value("${app.cors-origins}") String origins) {
    this.handler = handler;
    this.origins = origins;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry
        .addHandler(handler, "/ws/timers")
        .setAllowedOrigins(
            Arrays.stream(origins.split(",")).map(String::trim).toArray(String[]::new));
  }
}
