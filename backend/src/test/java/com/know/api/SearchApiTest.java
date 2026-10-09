package com.know.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.SearchService;
import java.util.EnumSet;
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

@WebMvcTest(SearchController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class SearchApiTest {
  @Autowired MockMvc mvc;
  @MockBean SearchService search;

  private final UUID user = UUID.randomUUID();
  private final UsernamePasswordAuthenticationToken auth =
      new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

  @Test
  void searchRejectsUnboundedQueryInput() throws Exception {
    mvc.perform(get("/api/v1/search").param("q", "x".repeat(201)).with(authentication(auth)))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(search);
  }

  @Test
  void searchPassesTheOwnerQueryTypesAndPage() throws Exception {
    when(search.search(any(), any(), any(), anyInt(), anyInt(), any()))
        .thenReturn(new SearchService.Response(List.of(), false, false));
    mvc.perform(
            get("/api/v1/search")
                .param("q", "java")
                .param("types", "note, Log,,")
                .param("limit", "20")
                .param("offset", "40")
                .param("fuzzy", "true")
                .with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.groups").isArray());
    verify(search)
        .search(
            eq(user),
            eq("java"),
            eq(EnumSet.of(SearchService.Type.NOTE, SearchService.Type.LOG)),
            eq(20),
            eq(40),
            eq(true));
  }

  @Test
  void searchDefaultsToEveryTypeAndTheFirstFiveResults() throws Exception {
    when(search.search(any(), any(), any(), anyInt(), anyInt(), any()))
        .thenReturn(new SearchService.Response(List.of(), false, false));
    mvc.perform(get("/api/v1/search").param("q", "java").with(authentication(auth)))
        .andExpect(status().isOk());
    verify(search).search(eq(user), eq("java"), eq(EnumSet.noneOf(SearchService.Type.class)), eq(5), eq(0), isNull());
  }

  @Test
  void searchRejectsOutOfRangePagesAndUnknownTypes() throws Exception {
    for (String[] bad :
        new String[][] {
          {"limit", "0"}, {"limit", "51"}, {"fuzzy", "maybe"}, {"offset", "-1"}, {"offset", "1001"}, {"types", "NOTE,NOPE"}
        })
      mvc.perform(get("/api/v1/search").param("q", "java").param(bad[0], bad[1]).with(authentication(auth)))
          .andExpect(status().isBadRequest());
    verifyNoInteractions(search);
  }

  @Test
  void searchAcceptsInclusiveQueryAndPageBoundaries() throws Exception {
    when(search.search(any(), any(), any(), anyInt(), anyInt(), any()))
        .thenReturn(new SearchService.Response(List.of(), false, false));

    mvc.perform(
            get("/api/v1/search")
                .param("q", "x".repeat(200))
                .param("limit", "1")
                .param("offset", "0")
                .with(authentication(auth)))
        .andExpect(status().isOk());
    verify(search)
        .search(
            eq(user), eq("x".repeat(200)), eq(EnumSet.noneOf(SearchService.Type.class)), eq(1), eq(0), isNull());

    reset(search);
    when(search.search(any(), any(), any(), anyInt(), anyInt(), any()))
        .thenReturn(new SearchService.Response(List.of(), false, false));
    mvc.perform(
            get("/api/v1/search")
                .param("q", "x")
                .param("limit", "50")
                .param("offset", "1000")
                .with(authentication(auth)))
        .andExpect(status().isOk());
    verify(search)
        .search(
            eq(user), eq("x"), eq(EnumSet.noneOf(SearchService.Type.class)), eq(50), eq(1000), isNull());
  }

  @Test
  void searchResponseExposesIncompleteTimeoutSignal() throws Exception {
    when(search.search(any(), any(), any(), anyInt(), anyInt(), any()))
        .thenReturn(new SearchService.Response(List.of(), false, true));

    mvc.perform(get("/api/v1/search").param("q", "java").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.incomplete").value(true))
        .andExpect(jsonPath("$.fuzzy").value(false))
        .andExpect(jsonPath("$.groups").isArray());
  }

  @Test
  void searchRequiresAuthentication() throws Exception {
    mvc.perform(get("/api/v1/search").param("q", "java")).andExpect(status().isUnauthorized());
  }
}
