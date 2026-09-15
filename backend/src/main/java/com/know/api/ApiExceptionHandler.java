package com.know.api;

import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
  record ErrorResponse(String error) {}

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    ConstraintViolationException.class,
    HttpMessageNotReadableException.class,
    IllegalArgumentException.class
  })
  ResponseEntity<ErrorResponse> invalidRequest(Exception exception) {
    String message = "Invalid request";
    if (exception instanceof MethodArgumentNotValidException validation) {
      message = validation.getBindingResult().getFieldErrors().stream()
          .map(error -> error.getField() + ": " + error.getDefaultMessage())
          .distinct()
          .collect(Collectors.joining("; "));
    } else if (exception instanceof ConstraintViolationException validation
        && !validation.getConstraintViolations().isEmpty()) {
      message = validation.getConstraintViolations().stream()
          .map(error -> error.getPropertyPath() + ": " + error.getMessage())
          .distinct()
          .collect(Collectors.joining("; "));
    }
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(message));
  }

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<ErrorResponse> responseStatus(ResponseStatusException exception) {
    return ResponseEntity.status(exception.getStatusCode())
        .body(new ErrorResponse(exception.getReason()));
  }
}
