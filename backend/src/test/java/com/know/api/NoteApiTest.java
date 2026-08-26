package com.know.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.KnowledgeService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(NoteController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class NoteApiTest {
  @Autowired MockMvc mvc;
  @MockBean KnowledgeService service;

  @Test
  void unauthenticatedNoteCreateIsRejected() throws Exception {
    mvc.perform(
            post("/api/v1/notes")
                .contentType("application/json")
                .content("{\"title\":\"Reflection\",\"content\":\"Useful\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void blankNoteFieldsAreRejectedBeforeServiceCall() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(
            post("/api/v1/notes")
                .with(authentication(auth))
                .contentType("application/json")
                .content("{\"title\":\" \",\"content\":\"Useful\"}"))
        .andExpect(status().isBadRequest());
  }
}
