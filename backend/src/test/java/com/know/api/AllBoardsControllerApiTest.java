package com.know.api;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.domain.BoardCardSort;
import com.know.service.AllBoardsService;
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

@WebMvcTest(AllBoardsController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=all-boards-api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class AllBoardsControllerApiTest {
  @Autowired MockMvc mvc;
  @MockBean AllBoardsService service;

  @Test
  void columnSortValidatesRequiredNameLengthAndSortAtTheApiBoundary() throws Exception {
    UUID user = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

    for (String body :
        List.of(
            "{}",
            "{\"name\":\" \",\"cardSort\":\"MANUAL\"}",
            "{\"name\":\"" + "x".repeat(81) + "\",\"cardSort\":\"MANUAL\"}",
            "{\"name\":\"Tasks\",\"cardSort\":null}",
            "{\"name\":\"Tasks\",\"cardSort\":\"UNKNOWN\"}")) {
      mvc.perform(
              put("/api/v1/boards/all/columns/sort")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(service);

    String maximumName = "x".repeat(80);
    when(service.sortColumn(user, maximumName, BoardCardSort.MANUAL))
        .thenReturn(BoardCardSort.MANUAL);
    mvc.perform(
            put("/api/v1/boards/all/columns/sort")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + maximumName + "\",\"cardSort\":\"MANUAL\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value(maximumName))
        .andExpect(jsonPath("$.cardSort").value("MANUAL"));
    verify(service).sortColumn(user, maximumName, BoardCardSort.MANUAL);
  }
}
