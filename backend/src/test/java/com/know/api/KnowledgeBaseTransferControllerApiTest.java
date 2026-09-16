package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.know.service.KnowledgeBaseTransferService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(KnowledgeBaseTransferController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class KnowledgeBaseTransferControllerApiTest {
  @Autowired MockMvc mvc;
  @MockBean KnowledgeBaseTransferService service;

  @Test
  void exportRequiresAuthentication() throws Exception {
    mvc.perform(get("/api/v1/imports/knowledge-base/export")).andExpect(status().isUnauthorized());
  }

  @Test
  void authenticatedExportAndImportUseTheOwnedService() throws Exception {
    UUID user = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    when(service.exportCsv(user)).thenReturn("entity,id,payload\n".getBytes());
    when(service.importCsv(eq(user), anyString()))
        .thenReturn(new KnowledgeBaseTransferService.ImportSummary(UUID.randomUUID(), 2, 1, 1));
    mvc.perform(get("/api/v1/imports/knowledge-base/export").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(
            header()
                .string("Content-Disposition", "attachment; filename=knowledge-base-export.csv"));
    mvc.perform(
            post("/api/v1/imports/knowledge-base")
                .with(authentication(auth))
                .contentType("text/csv")
                .content("entity,id,payload\n"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(2));
    verify(service).exportCsv(user);
    verify(service).importCsv(eq(user), anyString());
  }
}
