package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** REST timer state remains authoritative across WebSocket disconnect and reconnect. */
class TimerWebSocketReconnectIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private WebSocket connect(String token, LinkedBlockingQueue<String> messages) throws Exception {
    WebSocket socket =
        HttpClient.newHttpClient()
            .newWebSocketBuilder()
            .buildAsync(
                URI.create("ws://localhost:" + port + "/ws/timers"),
                new WebSocket.Listener() {
                  @Override
                  public void onOpen(WebSocket webSocket) {
                    webSocket.sendText("{\"type\":\"AUTH\",\"token\":\"" + token + "\"}", true);
                    WebSocket.Listener.super.onOpen(webSocket);
                  }

                  @Override
                  public java.util.concurrent.CompletionStage<?> onText(
                      WebSocket webSocket, CharSequence data, boolean last) {
                    if (last) messages.offer(data.toString());
                    webSocket.request(1);
                    return java.util.concurrent.CompletableFuture.completedFuture(null);
                  }
                })
            .get(5, TimeUnit.SECONDS);
    assertEquals("READY", api.MAPPER.readTree(messages.poll(5, TimeUnit.SECONDS)).get("type").asText());
    return socket;
  }

  private JsonNode start(String token, String description) {
    return api.created(
        "POST",
        "/api/v1/timers",
        token,
        "{\"labelIds\":[],\"description\":\"" + description + "\",\"source\":\"WEB\"}");
  }

  @Test
  void restRemainsAuthoritativeAndRecoversCurrentTimerAfterReconnect() throws Exception {
    String owner = api.register();
    LinkedBlockingQueue<String> messages = new LinkedBlockingQueue<>();
    JsonNode beforeDisconnect = start(owner, "Before disconnect");
    WebSocket firstSocket = connect(owner, messages);
    assertEquals(
        beforeDisconnect.get("id").asText(),
        api.get("/api/v1/timers/current", owner).json().get("id").asText());
    firstSocket.sendClose(WebSocket.NORMAL_CLOSURE, "disconnect").get(5, TimeUnit.SECONDS);

    assertEquals(200, api.post("/api/v1/timers/stop", owner, "{}").status());
    assertTrue(api.get("/api/v1/timers/current", owner).body().isBlank());
    JsonNode afterDisconnect = start(owner, "Started while disconnected");

    WebSocket reconnected = connect(owner, messages);
    JsonNode recovered = api.get("/api/v1/timers/current", owner).json();
    assertTrue(recovered.get("running").asBoolean());
    assertEquals(afterDisconnect.get("id").asText(), recovered.get("id").asText());
    assertNotEquals(beforeDisconnect.get("id").asText(), recovered.get("id").asText());
    reconnected.sendClose(WebSocket.NORMAL_CLOSURE, "done").get(5, TimeUnit.SECONDS);
    assertEquals(200, api.post("/api/v1/timers/stop", owner, "{}").status());
  }
}
