package com.know.api;

import jakarta.validation.ConstraintViolationException;
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

    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class,
            HttpMessageNotReadableException.class, IllegalArgumentException.class})
    ResponseEntity<ErrorResponse> invalidRequest(Exception ignored) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse("Invalid request"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ErrorResponse> responseStatus(ResponseStatusException exception) {
        return ResponseEntity
            .status(exception.getStatusCode())
            .body(new ErrorResponse(exception.getReason()));
    }
}
