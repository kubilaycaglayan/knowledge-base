package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
                List.of()));
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());

    mvc.perform(
            get("/api/v1/reports")
                .param("period", "month")
                .param("anchor", "2026-07-20")
                .with(authentication(auth)))
        .andExpect(status().isOk());

    verify(service).report(user, ReportService.Period.MONTH, java.time.LocalDate.of(2026, 7, 20));
  }
}
