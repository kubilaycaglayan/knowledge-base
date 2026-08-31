package com.know.api;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.domain.*;
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
  @MockBean PathItemRepository pathItems;
  @MockBean ItemRepository items;
  @MockBean ActivityRepository activities;
  @MockBean TimeEntryRepository timeEntries;
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
    mvc.perform(
            post("/api/v1/paths")
                .with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + "x".repeat(161) + "\"}"))
        .andExpect(status().isBadRequest());
    verifyNoInteractions(paths);
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
                .content("{\"name\":\"Unsafe path\",\"color\":\"red\"}"))
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
    when(paths.findAllByUserIdOrderByUpdatedAtDesc(eq(owner), any()))
        .thenReturn(pathsInOrder);
    when(paths.findLatestSessionsByUserIdAndPathIdIn(eq(owner), any()))
        .thenReturn(latestSessions);

    mvc.perform(get("/api/v1/paths").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].activityLabel").value("today"))
        .andExpect(jsonPath("$[1].activityLabel").value("this week"))
        .andExpect(jsonPath("$[2].activityLabel").value("this month"))
        .andExpect(jsonPath("$[3].activityLabel").value("passive"));
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
  void pathSummaryIncludesElapsedRunningTimer() throws Exception {
    UUID owner = UUID.randomUUID(), pathId = UUID.randomUUID();
    Path path = new Path(owner, "Learning", null);
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.of(path));
    when(pathItems.findItemIds(pathId)).thenReturn(List.of());
    when(timeEntries.findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, pathId))
        .thenReturn(
            List.of(
                new TimeEntry(
                    owner,
                    pathId,
                    null,
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
  void pathSummaryExcludesTimeExplicitlyTrackedOnAnotherPath() throws Exception {
    UUID owner = UUID.randomUUID(),
        pathId = UUID.randomUUID(),
        otherPathId = UUID.randomUUID(),
        itemId = UUID.randomUUID();
    Path path = new Path(owner, "Learning", null);
    Item item = new Item(owner, "Shared item", ItemType.PROJECT, null);
    TimeEntry selected =
        new TimeEntry(
            owner,
            pathId,
            itemId,
            java.time.Instant.now().minusSeconds(300),
            "selected",
            TimeSource.WEB);
    selected.stop(selected.getStartedAt().plusSeconds(120));
    TimeEntry other =
        new TimeEntry(
            owner,
            otherPathId,
            itemId,
            java.time.Instant.now().minusSeconds(300),
            "other",
            TimeSource.WEB);
    other.stop(other.getStartedAt().plusSeconds(900));
    TimeEntry itemOnly =
        new TimeEntry(
            owner,
            null,
            itemId,
            java.time.Instant.now().minusSeconds(300),
            "item only",
            TimeSource.WEB);
    itemOnly.stop(itemOnly.getStartedAt().plusSeconds(60));
    when(paths.findByIdAndUserId(pathId, owner)).thenReturn(Optional.of(path));
    when(pathItems.findItemIds(pathId)).thenReturn(List.of(itemId));
    when(items.findAllByUserIdAndIdIn(owner, List.of(itemId))).thenReturn(List.of(item));
    when(timeEntries.findAllByUserIdAndPathIdOrderByStartedAtDesc(owner, pathId))
        .thenReturn(List.of(selected));
    when(timeEntries.findRecentForPathAndItems(
            eq(owner),
            eq(pathId),
            eq(List.of(itemId)),
            any(org.springframework.data.domain.Pageable.class)))
        .thenReturn(List.of(selected, itemOnly));
    when(activities.findTop50ByUserIdAndPathIdOrderByOccurredAtDesc(owner, pathId))
        .thenReturn(List.of());
    when(activities.findRecentForPathAndItems(
            eq(owner),
            eq(pathId),
            eq(List.of(itemId)),
            any(org.springframework.data.domain.Pageable.class)))
        .thenReturn(List.of());
    var auth = new UsernamePasswordAuthenticationToken(owner.toString(), null, List.of());

    mvc.perform(get("/api/v1/paths/" + pathId + "/summary").with(authentication(auth)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.trackedSeconds").value(180));
  }
}
