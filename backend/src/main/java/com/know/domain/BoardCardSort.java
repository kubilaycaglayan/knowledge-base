package com.know.domain;

/**
 * How a status column orders its cards: by hand, or by priority (Urgent first, or Low first) with
 * manual order breaking ties.
 */
public enum BoardCardSort { MANUAL, PRIORITY, PRIORITY_LAST }
