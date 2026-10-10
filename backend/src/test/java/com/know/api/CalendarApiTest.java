package com.know.api;

import static org.mockito.Mockito.verifyNoInteractions;
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

  @Test
  void calendarWritesRequireAssignmentListsAndOwnedLabelIdsBeforeServiceAccess() throws Exception {
    for (String body :
        List.of(
            "{}",
            "{\"labels\":null}",
            "{\"labels\":[{\"portion\":0.5}]}",
            "{\"labels\":[{\"labelId\":null,\"portion\":0.5}]}")) {
      mvc.perform(
              put("/api/v1/calendar/days/2026-10-10")
                  .with(authentication(auth))
                  .contentType("application/json")
                  .content(body))
          .andExpect(status().isBadRequest());
    }

    for (String body :
        List.of(
            "{\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-02\"}",
            "{\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-02\",\"labels\":null}",
            "{\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-02\",\"labels\":[{\"portion\":0.5}]}")) {
      mvc.perform(
              put("/api/v1/calendar/days/range")
                  .with(authentication(auth))
                  .contentType("application/json")
                  .content(body))
          .andExpect(status().isBadRequest());
    }

    verifyNoInteractions(service);
  }

  @Test
  void calendarDaysRequireValidDateQueryValuesBeforeServiceAccess() throws Exception {
    for (String query :
        List.of(
            "startDate=2026-10-01",
            "startDate=not-a-date&endDate=2026-10-02",
            "startDate=2026-02-30&endDate=2026-03-01",
            "startDate=2026-10-01&endDate=not-a-date")) {
      mvc.perform(get("/api/v1/calendar/days?" + query).with(authentication(auth)))
          .andExpect(status().isBadRequest());
    }

    verifyNoInteractions(service);
  }

  @Test
  void calendarDayWritesRejectMalformedPathDatesBeforeServiceAccess() throws Exception {
    for (String date : List.of("not-a-date", "2026-02-30")) {
      mvc.perform(
              put("/api/v1/calendar/days/" + date)
                  .with(authentication(auth))
                  .contentType("application/json")
                  .content("{\"labels\":[]}"))
          .andExpect(status().isBadRequest());
    }

    verifyNoInteractions(service);
  }
}
