package com.know.integration;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Calendar days accept any owned label (docs/calendar-label-picker-acceptance-checklist.md). */
class CalendarLabelPickerIntegrationTest extends IntegrationTestSupport {
  @LocalServerPort int port;
  @Autowired TestRestTemplate rest;
  String base;

  @BeforeEach
  void setUp() {
    base = "http://localhost:" + port;
  }

  String token() {
    String body =
        "{\"email\":\"" + UUID.randomUUID() + "@test.example\",\"password\":\"SecurePassword123!\"}";
    ResponseEntity<JsonNode> res = exchange(HttpMethod.POST, "/api/v1/auth/register", null, body);
    assertEquals(HttpStatus.OK, res.getStatusCode());
    return res.getBody().get("token").asText();
  }

  ResponseEntity<JsonNode> exchange(HttpMethod method, String path, String token, String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (token != null) headers.setBearerAuth(token);
    return rest.exchange(base + path, method, new HttpEntity<>(body, headers), JsonNode.class);
  }

  JsonNode ok(HttpMethod method, String path, String token, String body) {
    ResponseEntity<JsonNode> res = exchange(method, path, token, body);
    assertTrue(res.getStatusCode().is2xxSuccessful(), path + " -> " + res.getStatusCode());
    return res.getBody();
  }

  /** A label hidden from Calendar, as created outside the Calendar page. */
  String hiddenLabel(String token, String name) {
    return ok(
            HttpMethod.POST,
            "/api/v1/labels",
            token,
            "{\"name\":\"" + name + "\",\"scopes\":[\"NOTE\",\"TIME_ENTRY\",\"LOG\",\"BOARD\"]}")
        .get("id")
        .asText();
  }

  List<String> scopes(String token, String labelId) {
    for (JsonNode label : ok(HttpMethod.GET, "/api/v1/labels", token, null))
      if (label.get("id").asText().equals(labelId)) {
        List<String> scopes = new ArrayList<>();
        label.get("scopes").forEach(scope -> scopes.add(scope.asText()));
        return scopes.stream().sorted().toList();
      }
    throw new AssertionError("label not found: " + labelId);
  }

  @Test
  void dayAcceptsAnOwnedLabelHiddenFromCalendarWithoutChangingItsScopes() {
    String token = token();
    String label = hiddenLabel(token, "Deep work");
    List<String> before = scopes(token, label);

    JsonNode day =
        ok(
            HttpMethod.PUT,
            "/api/v1/calendar/days/2026-10-01",
            token,
            "{\"labels\":[{\"labelId\":\"" + label + "\",\"portion\":0.5}]}");

    assertEquals(label, day.get("labels").get(0).get("labelId").asText());
    assertEquals("Deep work", day.get("labels").get(0).get("name").asText());
    JsonNode days =
        ok(
            HttpMethod.GET,
            "/api/v1/calendar/days?startDate=2026-10-01&endDate=2026-10-01",
            token,
            null);
    assertEquals(label, days.get(0).get("labels").get(0).get("labelId").asText());
    assertEquals(before, scopes(token, label));
    assertFalse(before.contains("CALENDAR"));
    for (JsonNode calendarLabel : ok(HttpMethod.GET, "/api/v1/labels?scope=CALENDAR", token, null))
      assertNotEquals(label, calendarLabel.get("id").asText());
  }

  @Test
  void rangeAcceptsAnOwnedLabelHiddenFromCalendar() {
    String token = token();
    String label = hiddenLabel(token, "Conference");

    JsonNode days =
        ok(
            HttpMethod.PUT,
            "/api/v1/calendar/days/range",
            token,
            "{\"startDate\":\"2026-10-05\",\"endDate\":\"2026-10-06\",\"labels\":[{\"labelId\":\""
                + label
                + "\"}]}");

    assertEquals(2, days.size());
    days.forEach(day -> assertEquals(label, day.get("labels").get(0).get("labelId").asText()));
    assertFalse(scopes(token, label).contains("CALENDAR"));
  }

  @Test
  void anotherUsersLabelIsStillRejected() {
    String owner = token();
    String intruder = token();
    String label = hiddenLabel(owner, "Private");

    assertEquals(
        HttpStatus.NOT_FOUND,
        exchange(
                HttpMethod.PUT,
                "/api/v1/calendar/days/2026-10-01",
                intruder,
                "{\"labels\":[{\"labelId\":\"" + label + "\"}]}")
            .getStatusCode());
    assertEquals(
        HttpStatus.NOT_FOUND,
        exchange(
                HttpMethod.PUT,
                "/api/v1/calendar/days/range",
                intruder,
                "{\"startDate\":\"2026-10-05\",\"endDate\":\"2026-10-06\",\"labels\":[{\"labelId\":\""
                    + label
                    + "\"}]}")
            .getStatusCode());
  }

  @Test
  void aCalendarLabelUsedOnDaysCanBeHiddenFromCalendar() {
    String token = token();
    String label =
        ok(
                HttpMethod.POST,
                "/api/v1/labels",
                token,
                "{\"name\":\"Leave\",\"color\":\"#2878D5\",\"scopes\":[\"CALENDAR\",\"NOTE\"]}")
            .get("id")
            .asText();
    ok(
        HttpMethod.PUT,
        "/api/v1/calendar/days/2026-10-08",
        token,
        "{\"labels\":[{\"labelId\":\"" + label + "\",\"portion\":1.0}]}");

    ok(
        HttpMethod.PUT,
        "/api/v1/labels/" + label,
        token,
        "{\"name\":\"Leave\",\"color\":\"#2878D5\",\"scopes\":[\"NOTE\"]}");

    assertEquals(List.of("NOTE"), scopes(token, label));
    for (JsonNode calendarLabel : ok(HttpMethod.GET, "/api/v1/labels?scope=CALENDAR", token, null))
      assertNotEquals(label, calendarLabel.get("id").asText());
    JsonNode day =
        ok(
                HttpMethod.GET,
                "/api/v1/calendar/days?startDate=2026-10-08&endDate=2026-10-08",
                token,
                null)
            .get(0);
    assertEquals(label, day.get("labels").get(0).get("labelId").asText());
    assertEquals(1.0, day.get("labels").get(0).get("portion").asDouble());
  }
}
