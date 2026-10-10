package com.know.api;

import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.domain.*;
import com.know.service.PathManagementService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PathController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(
    properties = {
      "app.jwt-secret=api-test-secret-with-at-least-32-characters",
      "app.cors-origins=http://localhost"
    })
class PathAuthorizationApiTest {
  @Autowired MockMvc mvc;
  @MockBean PathRepository paths;
  @MockBean ActivityRepository activities;
  @MockBean TimeEntryRepository timeEntries;
  @MockBean TimeEntryLabelRepository entryLabels;
  @MockBean PathManagementService pathManagement;
  @MockBean BoardRepository boardRepository;
  @MockBean com.know.service.BoardService boardService;
  @MockBean PasswordEncoder encoder;

  @Test
  void unauthenticatedPathReadIsRejected() throws Exception {
    mvc.perform(get("/api/v1/paths/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
  }

  @Test
  void invalidBearerTokenIsRejected() throws Exception {
    mvc.perform(
            get("/api/v1/paths/" + UUID.randomUUID()).header("Authorization", "Bearer not-a-jwt"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void malformedPathIdIsRejectedAsBadRequest() throws Exception {
    var auth =
        new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
    mvc.perform(get("/api/v1/paths/not-a-uuid").with(authentication(auth)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void pathNamesAreValidatedBeforePersistence() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    for (String body :
        List.of(
            "{\"name\":\" \"}",
            "{\"name\":\"" + "x".repeat(161) + "\"}",
            "{\"name\":\"Path\",\"description\":\"" + "d".repeat(2001) + "\"}")) {
      mvc.perform(
              post("/api/v1/paths")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(paths, boardService);

    when(paths.save(any(Path.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(boardService.createForPath(any(Path.class))).thenReturn(null);
    String maximumName = "x".repeat(160);
    String maximumDescription = "d".repeat(2000);
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\""
                        + maximumName
                        + "\",\"description\":\""
                        + maximumDescription
                        + "\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.name").value(maximumName))
        .andExpect(jsonPath("$.description").value(maximumDescription));
  }

  @Test
  void pathUpdateValidatesTextAndColorBeforeOwnershipLookup() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    String endpoint = "/api/v1/paths/" + UUID.randomUUID();

    for (String body :
        List.of(
            "{\"name\":\" \"}",
            "{\"name\":\"" + "x".repeat(161) + "\"}",
            "{\"name\":\"Path\",\"description\":\"" + "d".repeat(2001) + "\"}",
            "{\"name\":\"Path\",\"color\":\"red\"}")) {
      mvc.perform(
              put(endpoint)
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(paths, boardService);
  }

  @Test
  void pathColorsAcceptPaletteHexValuesAndRejectUnsafeValues() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    when(paths.save(any(Path.class))).thenAnswer(invocation -> invocation.getArgument(0));
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Blue path\",\"color\":\"#4C6FFF\"}"))
        .andExpect(status().isCreated());
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Custom text path\",\"color\":\"#4C6FFF\",\"textColor\":\"#102030\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.textColor").value("#102030"));
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Unsafe path\",\"color\":\"red\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Unsafe text path\",\"textColor\":\"red\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void authenticatedUserCannotReadAnotherUsersPath() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID();
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.empty());
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    mvc.perform(get("/api/v1/paths/" + pathId).with(authentication(auth)))
        .andExpect(status().isNotFound());
    verify(paths).findByIdAndUserId(pathId, owner);
  }

  @Test
  void pathListIncludesBackendComputedActivityLabels() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    Path today = new Path(owner, "Today", null);
    Path week = new Path(owner, "Week", null);
    Path month = new Path(owner, "Month", null);
    Path passive = new Path(owner, "Passive", null);
    java.time.Instant now = java.time.Instant.now();
    List<Path> pathsInOrder = List.of(today, week, month, passive);
    List<PathRepository.LatestSessionProjection> latestSessions = new ArrayList<>();
    for (int i = 0; i < pathsInOrder.size() - 1; i++) {
      var latest = mock(PathRepository.LatestSessionProjection.class);
      when(latest.getPathId()).thenReturn(pathsInOrder.get(i).getId());
      when(latest.getLatestStartedAt())
          .thenReturn(now.minus(java.time.Duration.ofDays(i == 0 ? 0 : i == 1 ? 1 : 8)));
      latestSessions.add(latest);
    }
    when(paths.findAllByUserIdOrderByUpdatedAtDesc(eq(owner), any())).thenReturn(pathsInOrder);
    when(paths.findLatestSessionsByUserIdAndPathIdIn(eq(owner), any())).thenReturn(latestSessions);

    mvc.perform(get("/api/v1/paths").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].activityLabel").value("today"))
        .andExpect(jsonPath("$[1].activityLabel").value("this week"))
        .andExpect(jsonPath("$[2].activityLabel").value("this month"))
        .andExpect(jsonPath("$[3].activityLabel").value("passive"));
  }

  @Test
  void pinningRequiresOwnershipAndPersistsTheRequestedState() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID();
    Path path = new Path(owner, "Pinned", null);
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.of(path));
    when(paths.save(path)).thenReturn(path);
    when(paths.findLatestSessionsByUserIdAndPathIdIn(eq(owner), any())).thenReturn(List.of());
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(
            post("/api/v1/paths/" + pathId + "/pin")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pinned\":true}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pinned").value(true));
    assertTrue(path.isPinned());
    mvc.perform(
            post("/api/v1/paths/" + pathId + "/pin")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pinned\":false}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pinned").value(false));
    assertFalse(path.isPinned());
    verify(paths, times(2)).save(path);
  }

  @Test
  void pathOrderingRejectsForeignIds() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());
    when(paths.findByUserIdAndIdIn(eq(owner), any())).thenReturn(List.of());

    mvc.perform(
            put("/api/v1/paths/order")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pathIds\":[\"" + UUID.randomUUID() + "\"]}"))
        .andExpect(status().isBadRequest());
    verify(paths, never()).saveAll(any());
  }

  @Test
  void pathOrderingRejectsInvalidRequestBodiesBeforeRepositoryAccess() throws Exception {
    UUID owner = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    for (String body :
        List.of(
            "{\"pathIds\":null}",
            "{}",
            "null",
            "{\"pathIds\":\"not-an-array\"}",
            "{\"pathIds\":[\"not-a-uuid\"]}")) {
      mvc.perform(
              put("/api/v1/paths/order")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }

    verifyNoInteractions(paths);
  }

  @Test
  void restoringAnotherUsersOrMissingPathIsRejected() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID();
    when(paths.restoreByIdAndUserId(pathId, owner)).thenReturn(0);
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(post("/api/v1/paths/" + pathId + "/restore").with(authentication(auth)))
        .andExpect(status().isNotFound());
  }

  @Test
  void mergingDelegatesAnOwnedSourceAndTargetToPathManagement() throws Exception {
    UUID owner = UUID.randomUUID(), source = UUID.randomUUID(), target = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(
            post("/api/v1/paths/" + source + "/merge")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"targetPathId\":\"" + target + "\"}"))
        .andExpect(status().isNoContent());

    verify(pathManagement).merge(owner, source, target);
  }

  @Test
  void pathMergeRequiresAValidTargetId() throws Exception {
    UUID owner = UUID.randomUUID(), source = UUID.randomUUID();
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    for (String request : List.of("{\"targetPathId\":null}", "{\"targetPathId\":\"not-a-uuid\"}")) {
      mvc.perform(
              post("/api/v1/paths/" + source + "/merge")
                  .with(authentication(auth))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(request))
          .andExpect(status().isBadRequest());
    }
    verifyNoInteractions(pathManagement);
  }

  @Test
  void pathSummaryIncludesElapsedRunningTimer() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID();
    Path path = new Path(owner, "Learning", null);
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.of(path));
    when(timeEntries.findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, pathId))
        .thenReturn(
            List.of(
                new TimeEntry(
                    owner,
                    pathId,
                    java.time.Instant.now().minusSeconds(5),
                    "live",
                    TimeSource.WEB)));
    when(activities.findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(owner, pathId))
        .thenReturn(List.of());
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(get("/api/v1/paths/" + pathId + "/summary").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.trackedSeconds").value(org.hamcrest.Matchers.greaterThanOrEqualTo(4)));
  }

  @Test
  void pathSummaryOnlyIncludesTimeTrackedOnThePath() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID(), otherPathId = UUID.randomUUID();
    Path path = new Path(owner, "Learning", null);
    TimeEntry selected =
        new TimeEntry(
            owner, pathId, java.time.Instant.now().minusSeconds(300), "selected", TimeSource.WEB);
    selected.stop(selected.getStartedAt().plusSeconds(120));
    TimeEntry other =
        new TimeEntry(
            owner, otherPathId, java.time.Instant.now().minusSeconds(300), "other", TimeSource.WEB);
    other.stop(other.getStartedAt().plusSeconds(900));
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.of(path));
    when(timeEntries.findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, pathId))
        .thenReturn(List.of(selected));
    when(activities.findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(owner, pathId))
        .thenReturn(List.of());
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(get("/api/v1/paths/" + pathId + "/summary").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.trackedSeconds").value(120));
  }
}
