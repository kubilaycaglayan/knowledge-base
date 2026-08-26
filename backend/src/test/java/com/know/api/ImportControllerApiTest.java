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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
                .thenReturn(new ClockifyImportService.ImportSummary(UUID.randomUUID(),1,0,1));
        var auth=new UsernamePasswordAuthenticationToken(user.toString(),null,List.of());
        mvc.perform(post("/api/v1/imports/clockify").with(authentication(auth)).contentType("application/json")
                        .content("{\"timeentries\":[{\"_id\":\"entry-1\",\"projectName\":\"Java\",\"timeInterval\":{\"start\":\"2026-08-25T10:00:00Z\",\"end\":\"2026-08-25T10:30:00Z\"}}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(1)).andExpect(jsonPath("$.createdPaths").value(1));
        verify(service).importEntries(eq(user), any(ClockifyImportService.ClockifyImportRequest.class));
    }

    @Test void authenticatedBatchListAndUndoUseTheOwnedService() throws Exception {
        UUID user=UUID.randomUUID(), batchId=UUID.randomUUID();
        when(service.listBatches(user)).thenReturn(List.of(new ClockifyImportService.ImportBatchView(batchId, com.know.domain.TimeSource.IMPORT, 2, 1, 1, java.time.Instant.parse("2026-08-26T10:00:00Z"), null)));
        when(service.undoBatch(user,batchId)).thenReturn(new ClockifyImportService.UndoSummary(batchId,2,2));
        var auth=new UsernamePasswordAuthenticationToken(user.toString(),null,List.of());

        mvc.perform(get("/api/v1/imports/clockify/batches").with(authentication(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(batchId.toString())).andExpect(jsonPath("$[0].imported").value(2));
        mvc.perform(delete("/api/v1/imports/clockify/batches/{id}",batchId).with(authentication(auth)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deletedEntries").value(2));
        verify(service).listBatches(user);
        verify(service).undoBatch(user,batchId);
    }
}
