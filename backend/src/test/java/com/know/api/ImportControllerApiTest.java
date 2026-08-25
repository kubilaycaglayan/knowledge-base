package com.know.api;

import com.know.service.ClockifyImportService;
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

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ImportController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class ImportControllerApiTest {
    @Autowired MockMvc mvc;
    @MockBean ClockifyImportService service;

    @Test void unauthenticatedClockifyImportIsRejected() throws Exception {
        mvc.perform(post("/api/v1/imports/clockify").contentType("application/json").content("{\"timeentries\":[]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test void authenticatedClockifyImportPassesEntriesToTheOwnedService() throws Exception {
        UUID user=UUID.randomUUID();
        when(service.importEntries(eq(user), any(ClockifyImportService.ClockifyImportRequest.class)))
                .thenReturn(new ClockifyImportService.ImportSummary(1,0,1));
        var auth=new UsernamePasswordAuthenticationToken(user.toString(),null,List.of());
        mvc.perform(post("/api/v1/imports/clockify").with(authentication(auth)).contentType("application/json")
                        .content("{\"timeentries\":[{\"_id\":\"entry-1\",\"projectName\":\"Java\",\"timeInterval\":{\"start\":\"2026-08-25T10:00:00Z\",\"end\":\"2026-08-25T10:30:00Z\"}}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1)).andExpect(jsonPath("$.createdPaths").value(1));
        verify(service).importEntries(eq(user), any(ClockifyImportService.ClockifyImportRequest.class));
    }
}
