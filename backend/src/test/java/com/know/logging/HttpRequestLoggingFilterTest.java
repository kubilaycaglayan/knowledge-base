package com.know.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.stereotype.Controller;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;

@ExtendWith(OutputCaptureExtension.class)
class HttpRequestLoggingFilterTest {
  private MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProbeController())
      .addFilters(new HttpRequestLoggingFilter())
      .build();

  @Test
  void logsRequestMethodPathStatusAndDuration(CapturedOutput output) throws Exception {
    mvc.perform(get("/api/v1/logging-test?secret=do-not-log").header("X-Request-ID", "extension-test-123"))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-ID", "extension-test-123"));

    assertThat(output.getOut())
        .containsPattern("requestId=extension-test-123 GET /api/v1/logging-test 200 \\([0-9]+ ms\\)")
        .doesNotContain("do-not-log");
  }

  @Test
  void replacesUnsafeRequestIds(CapturedOutput output) throws Exception {
    mvc.perform(get("/api/v1/logging-test").header("X-Request-ID", "unsafe request id"))
        .andExpect(status().isOk())
        .andExpect(header().exists("X-Request-ID"));

    assertThat(output.getOut()).doesNotContain("unsafe request id");
  }

  @Controller
  static class ProbeController {
    @GetMapping("/api/v1/logging-test")
    void probe() {}
  }
}
