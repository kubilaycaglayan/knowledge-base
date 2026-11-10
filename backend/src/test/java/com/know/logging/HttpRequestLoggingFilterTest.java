package com.know.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.http.MediaType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.stereotype.Controller;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;

@ExtendWith(OutputCaptureExtension.class)
class HttpRequestLoggingFilterTest {
  private MockMvc mvc =
      MockMvcBuilders.standaloneSetup(new ProbeController())
          .addFilters(new HttpRequestLoggingFilter())
          .build();

  @Test
  void logsRequestMethodPathStatusAndDuration(CapturedOutput output) throws Exception {
    mvc.perform(get("/api/v1/logging-test?secret=do-not-log")).andExpect(status().isOk());

    assertThat(output.getOut())
        .containsPattern("GET /api/v1/logging-test 200 \\([0-9]+ ms\\)")
        .doesNotContain("do-not-log");
  }

  @Test
  void logsMcpRequestMetadataWithoutLoggingBearerOrBody(CapturedOutput output) throws Exception {
    mvc.perform(post("/mcp")
            .contentType(MediaType.TEXT_PLAIN)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .header("Authorization", "Bearer do-not-log-this-token")
            .header("User-Agent", "OpenAI-MCP-Scanner")
            .content("private request body"))
        .andExpect(status().isUnsupportedMediaType());

    assertThat(output.getOut())
        .contains("MCP request method=POST path=/mcp status=415")
        .contains("contentType=text/plain")
        .contains("accept=text/event-stream")
        .contains("authorization=bearer-present")
        .contains("userAgent=OpenAI-MCP-Scanner")
        .doesNotContain("do-not-log-this-token")
        .doesNotContain("private request body");
  }

  @Controller
  static class ProbeController {
    @GetMapping("/api/v1/logging-test")
    void probe() {}

    @org.springframework.web.bind.annotation.PostMapping(
        value = "/mcp", consumes = MediaType.APPLICATION_JSON_VALUE)
    void mcp(@org.springframework.web.bind.annotation.RequestBody String body) {}
  }
}
