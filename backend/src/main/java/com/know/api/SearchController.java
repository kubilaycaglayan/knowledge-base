package com.know.api;

import com.know.domain.*;
import java.util.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {
  private static final int RESULT_LIMIT = 100;
  private final PathRepository paths;
  private final ItemRepository items;
  private final NoteRepository notes;
  private final ActivityRepository activities;

  public SearchController(
      PathRepository paths,
      ItemRepository items,
      NoteRepository notes,
      ActivityRepository activities) {
    this.paths = paths;
    this.items = items;
    this.notes = notes;
    this.activities = activities;
  }

  record Result(String kind, UUID id, String title, String detail) {}

  @GetMapping
  public List<Result> search(Authentication a, @RequestParam String q) {
    if (q.length() > 200)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search query is too long");
    UUID user = UUID.fromString(a.getName());
    String query = q.trim();
    if (query.isBlank()) return List.of();
    var page = PageRequest.of(0, RESULT_LIMIT);
    List<Result> result = new ArrayList<>();
    paths
        .findAllByUserIdAndNameContainingIgnoreCase(user, query, page)
        .forEach(p -> result.add(new Result("PATH", p.getId(), p.getName(), p.getDescription())));
    items
        .findAllByUserIdAndTitleContainingIgnoreCase(user, query, page)
        .forEach(i -> result.add(new Result("ITEM", i.getId(), i.getTitle(), i.getDescription())));
    notes
        .findAllByUserIdAndTitleContainingIgnoreCaseOrUserIdAndContentContainingIgnoreCase(
            user, query, user, query, page)
        .forEach(n -> result.add(new Result("NOTE", n.getId(), n.getTitle(), n.getContent())));
    activities
        .search(user, query, page)
        .forEach(
            event ->
                result.add(
                    new Result("ACTIVITY", event.getId(), event.getTitle(), event.getDetail())));
    return result;
  }
}
