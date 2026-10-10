package com.know.api;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.LogService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(LogController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class LogApiTest {
  @Autowired MockMvc mvc;
  @MockBean LogService service;

  @Test
  void logLabelAssignmentRequiresACollectionOfAtMostOneHundredIds() throws Exception {
    UUID user = UUID.randomUUID();
    UUID logId = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    String endpoint = "/api/v1/logs/" + logId + "/labels";

    for (String body : List.of("{}", "{\"labelIds\":null}")) {
      mvc.perform(
              put(endpoint)
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }
    String oversizedIds =
        java.util.stream.IntStream.range(0, 101)
            .mapToObj(index -> "\"" + UUID.randomUUID() + "\"")
            .collect(java.util.stream.Collectors.joining(",", "{\"labelIds\":[", "]}"));
    mvc.perform(
            put(endpoint)
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(oversizedIds))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);

    List<UUID> maximumIds =
        java.util.stream.IntStream.range(0, 100).mapToObj(index -> UUID.randomUUID()).toList();
    String maximumBody =
        maximumIds.stream()
            .map(id -> "\"" + id + "\"")
            .collect(java.util.stream.Collectors.joining(",", "{\"labelIds\":[", "]}"));
    mvc.perform(
            put(endpoint)
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(maximumBody))
        .andExpect(status().isOk());
    verify(service).setLabels(user, logId, maximumIds);
  }
}
