package com.know.api;

import com.know.domain.Activity;
import com.know.service.KnowledgeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ActivityController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class ActivityApiTest {
    @Autowired MockMvc mvc;
    @MockBean KnowledgeService service;

    @Test void malformedActivityFilterIdsAreRejected() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
        mvc.perform(get("/api/v1/activities").param("itemId", "not-a-uuid").with(authentication(auth)))
                .andExpect(status().isBadRequest());
    }

    @Test void authenticatedActivityFiltersReachTheOwnedServiceQuery() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        when(service.filteredActivities(eq(userId), any(), any(), eq(null), eq(itemId), eq(null))).thenReturn(List.<Activity>of());

        var auth = new UsernamePasswordAuthenticationToken(userId.toString(), null, List.of());
        mvc.perform(get("/api/v1/activities").param("itemId", itemId.toString()).param("from", "2026-01-01T00:00:00Z").with(authentication(auth)))
                .andExpect(status().isOk());

        verify(service).filteredActivities(eq(userId), any(), any(), eq(null), eq(itemId), eq(null));
    }
}
