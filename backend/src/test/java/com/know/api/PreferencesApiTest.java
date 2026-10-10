package com.know.api;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.UserPreferencesService;
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

@WebMvcTest(PreferencesController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=preferences-api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class PreferencesApiTest {
  @Autowired MockMvc mvc;
  @MockBean UserPreferencesService service;

  @Test
  void preferenceRequestAndNestedBoardStateConstraintsRejectBeforeServiceAccess() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());

    for (String body :
        List.of(
            "{\"theme\":\"unknown\"}",
            "{\"board\":{\"view\":\"timeline\"}}",
            "{\"board\":{\"search\":\"" + "x".repeat(201) + "\"}}",
            "{\"board\":{\"ganttSorts\":[\"UNKNOWN\"]}}")) {
      mvc.perform(
              put("/api/v1/preferences")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }

    verifyNoInteractions(service);
  }
}
