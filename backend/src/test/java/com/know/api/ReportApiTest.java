package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.know.service.ReportService;
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

@WebMvcTest(ReportController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class ReportApiTest {
  @Autowired MockMvc mvc;
  @MockBean ReportService service;

  @Test
  void invalidReportPeriodIsRejected() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(get("/api/v1/reports").param("period", "quarter").with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void customDateRangeAcceptsAnIndependentAggregation() throws Exception {
    UUID user = UUID.randomUUID();
    var from = java.time.LocalDate.of(2026, 1, 1);
    var to = java.time.LocalDate.of(2026, 12, 31);
    when(service.report(user, from, to, ReportService.Aggregation.QUARTER))
        .thenReturn(new ReportService.Report("CUSTOM", from, to, 0, List.of(), List.of(), List.of(), List.of(), null));
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

    mvc.perform(get("/api/v1/reports")
            .param("startDate", from.toString())
            .param("endDate", to.toString())
            .param("aggregation", "quarter")
            .with(authentication(auth)))
        .andExpect(status().isOk());

    verify(service).report(user, from, to, ReportService.Aggregation.QUARTER);
  }

  @Test
  void invalidCustomAggregationIsRejected() throws Exception {
    var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(get("/api/v1/reports")
            .param("startDate", "2026-01-01")
            .param("endDate", "2026-12-31")
            .param("aggregation", "decade")
            .with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void reportPeriodAndAnchorReachTheOwnedService() throws Exception {
    UUID user = UUID.randomUUID();
    when(service.report(
            eq(user), eq(ReportService.Period.MONTH), eq(java.time.LocalDate.of(2026, 7, 20))))
        .thenReturn(
            new ReportService.Report(
                "MONTH",
                java.time.LocalDate.of(2026, 7, 1),
                java.time.LocalDate.of(2026, 7, 31),
                0,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                new ReportService.Sankey(
                    "WEEK",
                    List.of(new ReportService.SankeyNode("bucket:2026-07-01:path:walk", "Jul 1–7 · Walking", "#123456", 0, 600, "Walking", "Jul 1–7")),
                    List.of(new ReportService.SankeyLink("bucket:2026-07-01", "path:walk", "Jul 1–7", "Walking", 600)))));
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

    mvc.perform(
            get("/api/v1/reports")
                .param("period", "month")
                .param("anchor", "2026-07-20")
                .with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.sankey.granularity").value("WEEK"))
        .andExpect(jsonPath("$.sankey.links[0].value").value(600));

    verify(service).report(user, ReportService.Period.MONTH, java.time.LocalDate.of(2026, 7, 20));
  }

  @Test
  void customDateRangeReachesTheOwnedService() throws Exception {
    UUID user = UUID.randomUUID();
    var from = java.time.LocalDate.of(2026, 8, 24);
    var to = java.time.LocalDate.of(2026, 8, 30);
    when(service.report(user, from, to, ReportService.Aggregation.DAY))
        .thenReturn(new ReportService.Report("CUSTOM", from, to, 0, List.of(), List.of(), List.of(), List.of(), null));
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

    mvc.perform(get("/api/v1/reports").param("startDate", from.toString()).param("endDate", to.toString()).with(authentication(auth)))
        .andExpect(status().isOk());

    verify(service).report(user, from, to, ReportService.Aggregation.DAY);
  }

  @Test
  void incompleteOrReversedCustomRangeIsRejected() throws Exception {
    var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(get("/api/v1/reports").param("startDate", "2026-08-24").with(authentication(auth)))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/v1/reports").param("startDate", "2026-08-30").param("endDate", "2026-08-24").with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void customRangeAllowsTwoYearsButRejectsAnythingLonger() throws Exception {
    UUID user = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    var from = java.time.LocalDate.of(2024, 9, 9);
    var twoYears = java.time.LocalDate.of(2026, 9, 9);
    when(service.report(user, from, twoYears, ReportService.Aggregation.QUARTER))
        .thenReturn(new ReportService.Report("CUSTOM", from, twoYears, 0, List.of(), List.of(), List.of(), List.of(), null));

    mvc.perform(get("/api/v1/reports")
            .param("startDate", from.toString())
            .param("endDate", twoYears.toString())
            .param("aggregation", "QUARTER")
            .with(authentication(auth)))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/reports")
            .param("startDate", from.toString())
            .param("endDate", twoYears.plusDays(1).toString())
            .param("aggregation", "QUARTER")
            .with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }
}
