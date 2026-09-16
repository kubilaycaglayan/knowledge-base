package com.know.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.service.CalendarService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CalendarController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class CalendarApiTest {
  @Autowired MockMvc mvc;
  @MockBean CalendarService service;
  private final UsernamePasswordAuthenticationToken auth =
      new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());

  @Test
  void unauthenticatedCalendarIsRejected() throws Exception {
    mvc.perform(get("/api/v1/calendar/labels")).andExpect(status().isUnauthorized());
  }

  @Test
  void invalidDayLabelAndRangeAreRejected() throws Exception {
    mvc.perform(
            post("/api/v1/calendar/labels")
                .with(authentication(auth))
                .contentType("application/json")
                .content("{\"name\":\" \",\"color\":\"blue\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            get("/api/v1/calendar/days")
                .param("startDate", "2026-09-05")
                .param("endDate", "2026-09-04")
                .with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }
}
