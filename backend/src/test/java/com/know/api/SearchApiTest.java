package com.know.api;

import com.know.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.UUID;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SearchController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class SearchApiTest {
    @Autowired MockMvc mvc;
    @MockBean PathRepository paths;
    @MockBean ItemRepository items;
    @MockBean NoteRepository notes;
    @MockBean ActivityRepository activities;

    @Test void searchRejectsUnboundedQueryInput() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
        mvc.perform(get("/api/v1/search").param("q", "x".repeat(201)).with(authentication(auth)))
                .andExpect(status().isBadRequest());
    }

    @Test void searchReturnsResultsFromOwnedRepositories() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null, List.of());
        when(activities.search(any(),org.mockito.ArgumentMatchers.eq("java"),any())).thenReturn(List.of());
        mvc.perform(get("/api/v1/search").param("q", "java").with(authentication(auth)))
                .andExpect(status().isOk());
        verify(paths).findAllByUserIdAndNameContainingIgnoreCase(any(),eq("java"),argThat(page -> page.getPageSize()==100));
        verify(items).findAllByUserIdAndTitleContainingIgnoreCase(any(),eq("java"),argThat(page -> page.getPageSize()==100));
        verify(notes).findAllByUserIdAndTitleContainingIgnoreCaseOrUserIdAndContentContainingIgnoreCase(any(),eq("java"),any(),eq("java"),argThat(page -> page.getPageSize()==100));
        verify(activities).search(any(),org.mockito.ArgumentMatchers.eq("java"),argThat(page -> page.getPageSize()==100));
    }
}
