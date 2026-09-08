package com.know.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.LabelManagementService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(LabelController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties = {"app.jwt-secret=api-test-secret-with-at-least-32-characters", "app.cors-origins=http://localhost"})
class LabelApiTest {
  @Autowired MockMvc mvc;
  @MockBean LabelManagementService service;

  @Test void unauthenticatedLabelCatalogIsRejected() throws Exception {
    mvc.perform(get("/api/v1/labels")).andExpect(status().isUnauthorized());
  }

  @Test void invalidLabelPayloadIsRejected() throws Exception {
    var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(post("/api/v1/labels").with(authentication(auth)).contentType("application/json")
        .content("{\"name\":\" \",\"scopes\":[\"CALENDAR\"]}"))
        .andExpect(status().isBadRequest());
  }
}
