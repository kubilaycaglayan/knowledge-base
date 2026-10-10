package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Active, archived, searched, paginated, and owner-scoped note lists. */
class NoteListIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  ApiClient api;

  @BeforeEach
  void setUp() {
    api = new ApiClient(port);
  }

  @Test
  void noteListsSeparateActiveArchivedSearchPagesAndOwners() {
    String owner = api.register();
    String other = api.register();
    JsonNode first =
        api.created(
            "POST",
            "/api/v1/notes",
            owner,
            "{\"title\":\"Alpha searchable\",\"content\":\"alpha body\",\"contentText\":\"alpha needle\"}");
    JsonNode second =
        api.created(
            "POST",
            "/api/v1/notes",
            owner,
            "{\"title\":\"Beta searchable\",\"content\":\"beta body\",\"contentText\":\"beta needle\"}");
    JsonNode third =
        api.created(
            "POST",
            "/api/v1/notes",
            owner,
            "{\"title\":\"Gamma searchable\",\"content\":\"gamma body\",\"contentText\":\"gamma needle\"}");
    JsonNode foreign =
        api.created(
            "POST",
            "/api/v1/notes",
            other,
            "{\"title\":\"Foreign searchable\",\"content\":\"foreign body\"}");
    assertEquals(204, api.delete("/api/v1/notes/" + second.get("id").asText(), owner).status());

    JsonNode active = api.get("/api/v1/notes", owner).json();
    assertTrue(active.isArray());
    assertEquals(2, active.size());
    assertTrue(active.toString().contains(first.get("id").asText()));
    assertTrue(active.toString().contains(third.get("id").asText()));
    assertFalse(active.toString().contains(second.get("id").asText()));
    assertFalse(active.toString().contains(foreign.get("id").asText()));

    JsonNode page = api.get("/api/v1/notes?page=0&size=1", owner).json();
    assertEquals(0, page.get("page").asInt());
    assertEquals(1, page.get("size").asInt());
    assertEquals(2, page.get("totalItems").asLong());
    assertEquals(2, page.get("totalPages").asInt());
    JsonNode secondPage = api.get("/api/v1/notes?page=1&size=1", owner).json();
    assertEquals(1, secondPage.get("items").size());
    assertNotEquals(
        page.get("items").get(0).get("id").asText(),
        secondPage.get("items").get(0).get("id").asText());

    JsonNode search = api.get("/api/v1/notes?q=needle", owner).json();
    assertEquals(2, search.get("totalItems").asLong());
    assertEquals(2, search.get("items").size());

    JsonNode archived = api.get("/api/v1/notes?archived=true&page=0&size=10", owner).json();
    assertEquals(1, archived.get("totalItems").asLong());
    assertEquals(second.get("id").asText(), archived.get("items").get(0).get("id").asText());
    assertFalse(archived.get("items").get(0).get("deletedAt").isNull());

    JsonNode archivedSearch = api.get("/api/v1/notes?archived=true&q=beta", owner).json();
    assertEquals(1, archivedSearch.get("totalItems").asLong());
    assertEquals(second.get("id").asText(), archivedSearch.get("items").get(0).get("id").asText());
  }

  @Test
  void notePaginationClampsPageAndSizeAndReturnsAnEmptyFinalPage() {
    String owner = api.register();
    api.created("POST", "/api/v1/notes", owner, "{\"title\":\"First\",\"content\":\"one\"}");
    api.created("POST", "/api/v1/notes", owner, "{\"title\":\"Second\",\"content\":\"two\"}");

    JsonNode lowerBound = api.get("/api/v1/notes?page=-3&size=0", owner).json();
    assertEquals(0, lowerBound.get("page").asInt());
    assertEquals(1, lowerBound.get("size").asInt());
    assertEquals(1, lowerBound.get("items").size());

    JsonNode upperBound = api.get("/api/v1/notes?page=0&size=101", owner).json();
    assertEquals(100, upperBound.get("size").asInt());
    assertEquals(2, upperBound.get("items").size());

    JsonNode emptyPage = api.get("/api/v1/notes?page=2&size=1", owner).json();
    assertEquals(2, emptyPage.get("page").asInt());
    assertEquals(0, emptyPage.get("items").size());
    assertEquals(2, emptyPage.get("totalItems").asLong());
  }
}
