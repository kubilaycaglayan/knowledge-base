package com.know.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** The timer socket rejects malformed and non-AUTH first messages with policy violation. */
class TimerWebSocketAuthIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private int closeStatus(String firstMessage, LinkedBlockingQueue<String> received)
      throws Exception {
    LinkedBlockingQueue<Integer> closes = new LinkedBlockingQueue<>();
    WebSocket socket =
        HttpClient.newHttpClient()
            .newWebSocketBuilder()
            .buildAsync(
                URI.create("ws://localhost:" + port + "/ws/timers"),
                new WebSocket.Listener() {
                  @Override
                  public void onOpen(WebSocket webSocket) {
                    webSocket.sendText(firstMessage, true);
                    WebSocket.Listener.super.onOpen(webSocket);
                  }

                  @Override
                  public java.util.concurrent.CompletionStage<?> onText(
                      WebSocket webSocket, CharSequence data, boolean last) {
                    if (last) received.offer(data.toString());
                    webSocket.request(1);
                    return java.util.concurrent.CompletableFuture.completedFuture(null);
                  }

                  @Override
                  public java.util.concurrent.CompletionStage<?> onClose(
                      WebSocket webSocket, int statusCode, String reason) {
                    closes.offer(statusCode);
                    return null;
                  }
                })
            .get(5, TimeUnit.SECONDS);
    Integer status = closes.poll(5, TimeUnit.SECONDS);
    if (status == null) socket.abort();
    return status == null ? -1 : status;
  }

  @Test
  void malformedMissingAndWrongTypeFirstMessagesAreRejected() throws Exception {
    String token = api.register();
    LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();

    assertEquals(1008, closeStatus("not-json", received));
    assertEquals(1008, closeStatus("{\"type\":\"AUTH\"}", received));
    assertEquals(
        1008,
        closeStatus("{\"type\":\"PING\",\"token\":\"" + token + "\"}", received));
    assertTrue(received.isEmpty(), "Rejected first messages must not receive READY");
  }
}
