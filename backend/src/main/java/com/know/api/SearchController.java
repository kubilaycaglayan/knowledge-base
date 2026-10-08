package com.know.api;

import com.know.service.SearchService;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {
  private final SearchService search;

  public SearchController(SearchService search) {
    this.search = search;
  }

  @GetMapping
  public SearchService.Response search(
      Authentication a,
      @RequestParam String q,
      @RequestParam(required = false) String types,
      @RequestParam(defaultValue = "" + SearchService.DEFAULT_LIMIT) int limit,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(required = false) Boolean fuzzy) {
    if (q.length() > SearchService.MAX_QUERY_LENGTH)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search query is too long");
    if (limit < 1 || limit > SearchService.MAX_LIMIT)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "limit must be between 1 and " + SearchService.MAX_LIMIT);
    if (offset < 0 || offset > SearchService.MAX_OFFSET)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "offset must be between 0 and " + SearchService.MAX_OFFSET);
    return search.search(UUID.fromString(a.getName()), q, parseTypes(types), limit, offset, fuzzy);
  }

  private static Set<SearchService.Type> parseTypes(String types) {
    Set<SearchService.Type> parsed = EnumSet.noneOf(SearchService.Type.class);
    if (types == null || types.isBlank()) return parsed;
    for (String type : types.split(",")) {
      if (type.isBlank()) continue;
      try {
        parsed.add(SearchService.Type.valueOf(type.trim().toUpperCase(Locale.ROOT)));
      } catch (IllegalArgumentException unknown) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown search type: " + (type.trim().length() > 40 ? type.trim().substring(0, 40) + "…" : type.trim()));
      }
    }
    return parsed;
  }
}
