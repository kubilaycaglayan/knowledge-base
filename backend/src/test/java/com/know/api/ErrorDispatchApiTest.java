package com.know.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.know.security.SecurityConfig;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(BasicErrorController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = {
    "app.jwt-secret=api-test-secret-with-at-least-32-characters",
    "app.cors-origins=http://localhost"
})
class ErrorDispatchApiTest {
  @Autowired MockMvc mvc;

  @Test
  void errorDispatchPreservesOriginalStatusWithoutReauthenticating() throws Exception {
    for (int code : new int[] {404, 500, 503}) {
      mvc.perform(get("/error")
              .with(request -> {
                request.setDispatcherType(DispatcherType.ERROR);
                return request;
              })
              .requestAttr(RequestDispatcher.ERROR_STATUS_CODE, code)
              .requestAttr(RequestDispatcher.ERROR_REQUEST_URI, "/api/v1/paths"))
          .andExpect(status().is(code));
    }
  }

  @Test
  void directRequestsStillRequireAuthentication() throws Exception {
    mvc.perform(get("/error")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/paths")).andExpect(status().isUnauthorized());
  }
}
