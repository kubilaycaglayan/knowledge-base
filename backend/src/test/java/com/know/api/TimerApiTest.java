package com.know.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.domain.TimeSource;
import com.know.service.TimerService;
import java.time.Instant;
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

@WebMvcTest(TimerController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class TimerApiTest {
  @Autowired MockMvc mvc;
  @MockBean TimerService service;

  @Test
  void unauthenticatedTimerReadIsRejected() throws Exception {
    mvc.perform(get("/api/v1/timers/current")).andExpect(status().isUnauthorized());
  }

  @Test
  void timerStartPassesExplicitSourceAndTargetsToService() throws Exception {
    UUID user = UUID.randomUUID(), path = UUID.randomUUID(), label = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    when(service.start(eq(user), eq(path), eq(List.of(label)), eq("Chapter 4"), eq(TimeSource.IOS)))
        .thenReturn(
            new TimerService.TimeView(
                UUID.randomUUID(),
                path,
                List.of(label),
                Instant.now(),
                null,
                null,
                "Chapter 4",
                TimeSource.IOS,
                true));

    mvc.perform(
            post("/api/v1/timers")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"pathId\":\""
                        + path
                        + "\",\"labelIds\":[\""
                        + label
                        + "\"],\"description\":\"Chapter 4\",\"source\":\"IOS\"}"))
        .andExpect(status().isCreated());
    verify(service).start(user, path, List.of(label), "Chapter 4", TimeSource.IOS);
  }

  @Test
  void oversizedTimerDescriptionIsRejectedBeforeServiceCall() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(
            post("/api/v1/timers")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"labelIds\":[],\"description\":\"" + "x".repeat(5001) + "\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }

  @Test
  void malformedTimerIdIsRejectedAsBadRequest() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(post("/api/v1/timers/not-a-uuid/stop").with(authentication(auth)))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(service);
  }

  @Test
  void runningTimerConfigurationPassesEditableStartAndTargets() throws Exception {
    UUID user = UUID.randomUUID(), timer = UUID.randomUUID(), path = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    when(service.configure(
            eq(user),
            eq(timer),
            eq(path),
            eq(List.of()),
            any(Instant.class),
            isNull(),
            eq("Chapter 5")))
        .thenReturn(
            new TimerService.TimeView(
                timer,
                path,
                List.of(),
                Instant.parse("2026-08-25T10:00:00Z"),
                null,
                null,
                "Chapter 5",
                TimeSource.WEB,
                true));
    mvc.perform(
            put("/api/v1/timers/" + timer)
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"pathId\":\""
                        + path
                        + "\",\"labelIds\":[],\"startedAt\":\"2026-08-25T10:00:00Z\",\"description\":\"Chapter"
                        + " 5\"}"))
        .andExpect(status().isOk());
    verify(service)
        .configure(
            eq(user),
            eq(timer),
            eq(path),
            eq(List.of()),
            eq(Instant.parse("2026-08-25T10:00:00Z")),
            isNull(),
            eq("Chapter 5"));
  }

  @Test
  void timerStartRequiresExplicitLabelCollection() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());

    mvc.perform(
            post("/api/v1/timers")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isBadRequest());

    verifyNoInteractions(service);
  }

  @Test
  void runningAndManualEntryRequestsRequireTheirLabelAndTimeFields() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    String timer = UUID.randomUUID().toString();
    String start = "2026-10-09T10:00:00Z";
    String end = "2026-10-09T11:00:00Z";

    mvc.perform(
            put("/api/v1/timers/" + timer)
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"labelIds\":null,\"startedAt\":\"" + start + "\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            put("/api/v1/timers/" + timer)
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"labelIds\":[],\"startedAt\":null}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/time-entries")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"labelIds\":[],\"startedAt\":\"" + start + "\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/time-entries")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"labelIds\":[],\"startedAt\":\""
                        + start
                        + "\",\"endedAt\":\""
                        + end
                        + "\",\"description\":\""
                        + "d".repeat(5001)
                        + "\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            put("/api/v1/time-entries/" + UUID.randomUUID())
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"labelIds\":null,\"startedAt\":\""
                        + start
                        + "\",\"endedAt\":\""
                        + end
                        + "\"}"))
        .andExpect(status().isBadRequest());

    verifyNoInteractions(service);
  }

  @Test
  void canonicalAndExplicitStopRoutesUseTheSameTimerAndResponse() throws Exception {
    UUID user = UUID.randomUUID(), timer = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    var running =
        new TimerService.TimeView(
            timer, null, List.of(), Instant.parse("2026-10-09T10:00:00Z"), null, null, "Work", TimeSource.WEB, true);
    var stopped =
        new TimerService.TimeView(
            timer, null, List.of(), Instant.parse("2026-10-09T10:00:00Z"), Instant.parse("2026-10-09T11:00:00Z"), 3600L, "Work", TimeSource.WEB, false);
    when(service.current(user)).thenReturn(running);
    when(service.stop(user, timer)).thenReturn(stopped);

    mvc.perform(post("/api/v1/timers/stop").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json(
            "{\"id\":\"" + timer + "\",\"durationSeconds\":3600}"));
    mvc.perform(post("/api/v1/timers/" + timer + "/stop").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().json(
            "{\"id\":\"" + timer + "\",\"durationSeconds\":3600}"));

    verify(service, times(2)).current(user);
    verify(service, times(2)).stop(user, timer);
  }

  @Test
  void canonicalAndExplicitCancelRoutesCancelTheSameTimer() throws Exception {
    UUID user = UUID.randomUUID(), timer = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(user.toString(), null, List.of());
    var running =
        new TimerService.TimeView(
            timer, null, List.of(), Instant.parse("2026-10-09T10:00:00Z"), null, null, "Work", TimeSource.WEB, true);
    when(service.current(user)).thenReturn(running);

    mvc.perform(post("/api/v1/timers/cancel").with(authentication(auth)))
        .andExpect(status().isNoContent());
    mvc.perform(post("/api/v1/timers/" + timer + "/cancel").with(authentication(auth)))
        .andExpect(status().isNoContent());

    verify(service, times(2)).current(user);
    verify(service, times(2)).cancel(user, timer);
  }
}
