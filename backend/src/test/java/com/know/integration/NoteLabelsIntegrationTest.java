package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** The note label picker exposes only the caller's NOTE-scoped labels. */
class NoteLabelsIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  private String label(String token, String name, String scope) {
    return api.created(
            "POST",
            "/api/v1/labels",
            token,
            "{\"name\":\"" + name + "\",\"scopes\":[\"" + scope + "\"]}")
        .get("id")
        .asText();
  }

  @Test
  void noteLabelCatalogIsNoteScopedOwnerScopedOrderedAndEmptyWhenUnused() {
    String owner = api.register();
    String other = api.register();
    String beta = label(owner, "Beta", "NOTE");
    String alpha = label(owner, "Alpha", "NOTE");
    String logOnly = label(owner, "Log only", "LOG");
    String foreign = label(other, "Foreign", "NOTE");

    ApiClient.Reply reply = api.get("/api/v1/notes/labels", owner);
    assertEquals(200, reply.status(), reply.body());
    JsonNode catalog = reply.json();
    List<String> ids = catalog.findValuesAsText("id");
    assertTrue(ids.contains(alpha));
    assertTrue(ids.contains(beta));
    assertFalse(ids.contains(logOnly));
    assertFalse(ids.contains(foreign));
    List<String> names = new ArrayList<>(catalog.findValuesAsText("name"));
    List<String> sorted = new ArrayList<>(names);
    Collections.sort(sorted, String.CASE_INSENSITIVE_ORDER);
    assertEquals(sorted, names);

    String unused = api.register();
    ApiClient.Reply empty = api.get("/api/v1/notes/labels", unused);
    assertEquals(200, empty.status(), empty.body());
    assertTrue(empty.json().isArray());
    assertEquals(0, empty.json().size());
  }
}
