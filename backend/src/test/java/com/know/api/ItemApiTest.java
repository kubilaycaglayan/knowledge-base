package com.know.api;

import com.know.domain.ItemStatus;
import com.know.domain.ItemType;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.http.MediaType;

@WebMvcTest(ItemController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class ItemApiTest {
    @Autowired MockMvc mvc;
    @MockBean KnowledgeService service;

    @Test void unauthenticatedItemListIsRejected() throws Exception {
        mvc.perform(get("/api/v1/items")).andExpect(status().isUnauthorized());
    }

    @Test void itemTitleIsValidatedBeforeServiceCall() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(post("/api/v1/items").with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\""+"x".repeat(241)+"\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void itemSourceIsValidatedBeforeServiceCall() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(post("/api/v1/items").with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Sourceful\",\"source\":\""+"x".repeat(1001)+"\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void progressRangeIsValidatedBeforeServiceCall() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(post("/api/v1/items/"+UUID.randomUUID()+"/progress").with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON).content("{\"progress\":101}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void malformedItemIdIsRejectedAsBadRequest() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(get("/api/v1/items/not-a-uuid/progress").with(authentication(auth)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
