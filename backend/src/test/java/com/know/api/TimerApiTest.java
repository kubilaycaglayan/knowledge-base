package com.know.api;

import com.know.domain.TimeSource;
import com.know.service.TimerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.http.MediaType;

@WebMvcTest(TimerController.class)
@Import(com.know.security.SecurityConfig.class)
@TestPropertySource(properties={"app.jwt-secret=api-test-secret-with-at-least-32-characters","app.cors-origins=http://localhost"})
class TimerApiTest {
    @Autowired MockMvc mvc;
    @MockBean TimerService service;

    @Test void unauthenticatedTimerReadIsRejected() throws Exception {
        mvc.perform(get("/api/v1/timers/current")).andExpect(status().isUnauthorized());
    }

    @Test void timerStartPassesExplicitSourceAndTargetsToService() throws Exception {
        UUID user=UUID.randomUUID(), path=UUID.randomUUID(), item=UUID.randomUUID();
        var auth=new UsernamePasswordAuthenticationToken(user.toString(),null,List.of());
        when(service.start(eq(user),eq(path),eq(item),eq("Chapter 4"),eq(TimeSource.IOS)))
                .thenReturn(new TimerService.TimeView(UUID.randomUUID(),path,item,Instant.now(),null,null,"Chapter 4",TimeSource.IOS,true));

        mvc.perform(post("/api/v1/timers").with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"pathId\":\""+path+"\",\"itemId\":\""+item+"\",\"description\":\"Chapter 4\",\"source\":\"IOS\"}"))
                .andExpect(status().isCreated());
        verify(service).start(user,path,item,"Chapter 4",TimeSource.IOS);
    }

    @Test void oversizedTimerDescriptionIsRejectedBeforeServiceCall() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(post("/api/v1/timers").with(authentication(auth)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\""+"x".repeat(501)+"\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void malformedTimerIdIsRejectedAsBadRequest() throws Exception {
        var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of());
        mvc.perform(post("/api/v1/timers/not-a-uuid/stop").with(authentication(auth)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
