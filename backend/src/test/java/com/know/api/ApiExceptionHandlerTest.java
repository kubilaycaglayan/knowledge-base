package com.know.api;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.validation.ConstraintViolationException;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.server.ResponseStatusException;

class ApiExceptionHandlerTest {
  private final ApiExceptionHandler handler = new ApiExceptionHandler();

  @Test
  void malformedAndInvalidRequestsAlwaysUseTheStableBadRequestEnvelope() {
    var malformed = handler.invalidRequest(new HttpMessageNotReadableException("bad json"));
    var illegal = handler.invalidRequest(new IllegalArgumentException("bad value"));
    var constraint = handler.invalidRequest(new ConstraintViolationException(Set.of()));

    assertEquals(HttpStatus.BAD_REQUEST, malformed.getStatusCode());
    assertEquals("Invalid request", malformed.getBody().error());
    assertEquals(HttpStatus.BAD_REQUEST, illegal.getStatusCode());
    assertEquals("Invalid request", illegal.getBody().error());
    assertEquals(HttpStatus.BAD_REQUEST, constraint.getStatusCode());
    assertEquals("Invalid request", constraint.getBody().error());
  }

  @Test
  void validationErrorsExplainWhichFieldMustBeFixed() {
    var binding = org.mockito.Mockito.mock(org.springframework.validation.BindingResult.class);
    org.mockito.Mockito.when(binding.getFieldErrors())
        .thenReturn(
            java.util.List.of(
                new org.springframework.validation.FieldError(
                    "request", "description", "size must be between 0 and 5000")));
    var response = handler.invalidRequest(new MethodArgumentNotValidException(null, binding));

    assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    assertEquals("description: size must be between 0 and 5000", response.getBody().error());
  }

  @Test
  void domainStatusErrorsPreserveStatusAndReason() {
    var response =
        handler.responseStatus(new ResponseStatusException(HttpStatus.CONFLICT, "Already running"));

    assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
    assertNotNull(response.getBody());
    assertEquals("Already running", response.getBody().error());
  }

  @Test
  void statusErrorsWithoutReasonStillReturnAnErrorBody() {
    var response = handler.responseStatus(new ResponseStatusException(HttpStatus.NOT_FOUND));

    assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    assertNotNull(response.getBody());
    assertNull(response.getBody().error());
  }
}
