package com.know.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.service.*;
import com.know.domain.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.PageRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.bind.annotation.*;

/** Sessionless Streamable HTTP MCP endpoint. It deliberately exposes read tools only. */
@RestController
public class McpController {
  private final JdbcTemplate jdbc; private final ObjectMapper json;
  private final KnowledgeService knowledge; private final LogService logs; private final CalendarService calendar;
  private final TimerService timers; private final ReportService reports; private final SearchService search;
  private final LabelManagementService labels;
  private final PathRepository paths; private final BoardRepository boards; private final BoardCardRepository cards;
  private final JwtDecoder oauthJwtDecoder;
  public McpController(JdbcTemplate jdbc, ObjectMapper json, KnowledgeService knowledge, LogService logs,
      CalendarService calendar, TimerService timers, ReportService reports, SearchService search,
      LabelManagementService labels, PathRepository paths, BoardRepository boards, BoardCardRepository cards,
      ObjectProvider<JwtDecoder> oauthJwtDecoder) {
    this.jdbc=jdbc; this.json=json; this.knowledge=knowledge; this.logs=logs; this.calendar=calendar;
    this.timers=timers; this.reports=reports; this.search=search; this.labels=labels;
    this.paths=paths; this.boards=boards; this.cards=cards;
    this.oauthJwtDecoder=oauthJwtDecoder.getIfAvailable();
  }

  @PostMapping(value="/mcp", consumes=MediaType.APPLICATION_JSON_VALUE, produces={"application/json", "text/event-stream"})
  public ResponseEntity<?> handle(@RequestHeader(value="Authorization", required=false) String authorization,
      @RequestBody Map<String,Object> request, @org.springframework.beans.factory.annotation.Value("${app.openai-oauth.issuer:https://knowledgebase.blaqc.space}") String issuer) throws Exception {
    Access access;
    try { access = authenticate(authorization, issuer); }
    catch (org.springframework.web.server.ResponseStatusException unauthorized) {
      if (unauthorized.getStatusCode() != HttpStatus.UNAUTHORIZED) throw unauthorized;
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .header("WWW-Authenticate", "Bearer resource_metadata=\""+issuer+"/.well-known/oauth-protected-resource\"")
          .build();
    }
    Object id=request.get("id"); String method=Objects.toString(request.get("method"),"");
    Object result;
    Map<String,Object> params=request.get("params") instanceof Map<?,?> m ? (Map<String,Object>)m : Map.of();
    try {
      result=switch(method) {
        case "initialize" -> Map.of("protocolVersion", Objects.toString(params.get("protocolVersion"),"2025-03-26"), "capabilities", Map.of("tools",Map.of("listChanged",false)), "serverInfo",Map.of("name","Knowledge Base","version","1.0.0"));
        case "notifications/initialized", "notifications/cancelled" -> null;
        case "ping" -> Map.of();
        case "tools/list" -> toolList(access.categories());
        case "tools/call" -> callTool(access, params);
        default -> throw new IllegalArgumentException("Unsupported MCP method: " + method);
      };
      if (id == null) return ResponseEntity.accepted().build();
      return ResponseEntity.ok(Map.of("jsonrpc","2.0","id",id,"result",result));
    } catch (Exception e) {
      if (id == null) return ResponseEntity.accepted().build();
      return ResponseEntity.ok(Map.of("jsonrpc","2.0","id",id,"error",Map.of("code",-32602,"message",Objects.toString(e.getMessage(),"Request failed"))));
    }
  }

  record Access(UUID user, Set<String> categories) {}
  private Access authenticate(String auth, String issuer) throws Exception {
    if (auth == null || !auth.startsWith("Bearer ")) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED);
    String secret=auth.substring(7);
    Access oauth = oauthAccess(secret, issuer + "/mcp");
    if (oauth != null) return oauth;
    String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
    List<Access> ids =
        jdbc.query(
            "select user_id,categories from mcp_access_token where token_hash=? and revoked_at is null and expires_at>now()",
            (rs, n) -> {
              Object[] values = (Object[]) rs.getArray(2).getArray();
              Set<String> categories =
                  Arrays.stream(values)
                      .map(Objects::toString)
                      .collect(java.util.stream.Collectors.toUnmodifiableSet());
              return new Access(rs.getObject(1, UUID.class), categories);
            },
            hash);
    if(ids.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED);
    jdbc.update("update mcp_access_token set last_used_at=now() where token_hash=?",hash);
    return ids.get(0);
  }

  private Access oauthAccess(String token, String resource) {
    if (oauthJwtDecoder == null) return null;
    Jwt jwt;
    try {
      jwt = oauthJwtDecoder.decode(token);
      if (!jwt.getAudience().contains(resource)) return null;
    } catch (JwtException invalidToken) {
      return null;
    }
    List<Access> found;
    try { found = jdbc.query("select a.principal_name, a.authorized_scopes from oauth2_authorization a join oauth2_authorization_resource r on r.authorization_id=a.id where a.access_token_value=? and a.access_token_expires_at>now() and r.resource=?",
        (rs, n) -> {
          UUID user = UUID.fromString(rs.getString(1));
          String scopes = rs.getString(2);
          Set<String> categories = Arrays.stream(scopes.split(" ")).filter(s -> s.startsWith("kb:") && s.endsWith(":read"))
              .map(s -> s.substring(3, s.length()-5)).collect(java.util.stream.Collectors.toUnmodifiableSet());
          return new Access(user, categories);
        }, token, resource); }
    catch (org.springframework.dao.DataAccessException missingOAuthTables) { return null; }
    if (found.isEmpty() || !jwt.getSubject().equals(found.get(0).user().toString())) return null;
    return found.get(0);
  }
  Map<String,Object> toolList(Set<String> grants) {
    Map<String,String> descriptions=Map.ofEntries(
      Map.entry("notes_list","List retained note metadata, including archived notes with archived=true. Use note_get to retrieve one note's plain-text body. Supports page, size, q, archived."),
      Map.entry("note_get","Get one retained note by noteId. Returns plain-text content without rich-text JSON."),
      Map.entry("logs_list","List retained logs."), Map.entry("calendar_days","Read calendar days for an ISO date range (maximum one year)."),
      Map.entry("sessions_list","List retained time entries using page and size."), Map.entry("activity_list","List recent activity."),
      Map.entry("report_read","Read report totals and category breakdowns for period WEEK, MONTH, or YEAR, or startDate/endDate. Daily rows are omitted by default; set includeDays=true to fetch a page of at most 31 days. Sankey data is not returned."),
      Map.entry("labels_list","List labels."), Map.entry("search","Search across only the data categories granted to this token."),
      Map.entry("paths_list","List retained paths; archived paths are marked."), Map.entry("boards_list","List retained boards; archived boards are marked."),
      Map.entry("board_cards","List cards for a user-owned board, including archived cards when requested."));
    List<Map<String,Object>> tools=new ArrayList<>();
    descriptions.forEach(
        (name, description) -> {
          String category =
              switch (name) {
                case "notes_list", "note_get" -> "notes";
                case "logs_list" -> "logs";
                case "calendar_days" -> "calendar";
                case "sessions_list" -> "sessions";
                case "activity_list" -> "activity";
                case "report_read" -> "reports";
                case "labels_list" -> "labels";
                case "search" -> "";
                case "paths_list" -> "paths";
                default -> "boards";
              };
          if (category.isEmpty() ? !searchTypes(grants).isEmpty() : grants.contains(category)) {
            tools.add(
                Map.of(
                    "name", name,
                    "description", description,
                    "inputSchema", inputSchema()));
          }
        });
    return Map.of("tools",tools);
  }
  private static Map<String, Object> inputSchema() {
    Map<String, Object> properties = new LinkedHashMap<>();
    properties.put("page", Map.of("type", "integer"));
    properties.put("size", Map.of("type", "integer"));
    properties.put("q", Map.of("type", "string"));
    properties.put("archived", Map.of("type", "boolean"));
    properties.put("startDate", Map.of("type", "string", "format", "date"));
    properties.put("endDate", Map.of("type", "string", "format", "date"));
    properties.put("period", Map.of("type", "string"));
    properties.put("includeDays", Map.of("type", "boolean"));
    properties.put("daysPage", Map.of("type", "integer"));
    properties.put("daysSize", Map.of("type", "integer"));
    properties.put("noteId", Map.of("type", "string"));
    properties.put("boardId", Map.of("type", "string"));
    return Map.of("type", "object", "properties", properties, "additionalProperties", false);
  }
  Map<String,Object> callTool(Access access, Map<String,Object> params) throws Exception {
    String name=Objects.toString(params.get("name"),""); Map<String,Object> a=params.get("arguments") instanceof Map<?,?> m?(Map<String,Object>)m:Map.of();
    String category=switch(name) { case "notes_list", "note_get" -> "notes"; case "logs_list" -> "logs"; case "calendar_days" -> "calendar"; case "sessions_list" -> "sessions"; case "activity_list" -> "activity"; case "report_read" -> "reports"; case "labels_list" -> "labels"; case "search" -> ""; case "paths_list" -> "paths"; case "boards_list", "board_cards" -> "boards"; default -> ""; };
    if ((category.isEmpty() && ( !name.equals("search") || searchTypes(access.categories()).isEmpty())) || (!category.isEmpty() && !access.categories().contains(category))) throw new IllegalArgumentException("This token does not have access to that category");
    UUID user=access.user();
    Object value=switch(name) {
      case "notes_list" -> { var page=knowledge.pageNotes(user, integer(a,"page",0), integer(a,"size",20), (String)a.get("q"), Boolean.TRUE.equals(a.get("archived"))); yield Map.of("items",page.items().stream().map(note->noteOutput(note,false)).toList(),"page",page.page(),"size",page.size(),"totalItems",page.totalItems(),"totalPages",page.totalPages()); }
      case "note_get" -> noteOutput(knowledge.getNote(user,UUID.fromString(Objects.toString(a.get("noteId"),""))),true);
      case "logs_list" -> logs.page(user,integer(a,"page",0),Math.min(100,integer(a,"size",50)));
      case "calendar_days" -> { LocalDate from=LocalDate.parse(Objects.toString(a.get("startDate"),LocalDate.now().minusDays(30).toString())); LocalDate to=LocalDate.parse(Objects.toString(a.get("endDate"),LocalDate.now().toString())); if(to.isBefore(from)||from.plusYears(1).isBefore(to)) throw new IllegalArgumentException("Calendar range must be between zero days and one year"); yield calendar.days(user,from,to); }
      case "sessions_list" -> { var page=timers.historyPage(user,integer(a,"page",0),Math.min(50,integer(a,"size",20))); yield Map.of("sessions",page.sessions().stream().map(session->{Map<String,Object> item=json.convertValue(session,Map.class); item.put("retained",true); return item;}).toList(),"page",page.page(),"pageSize",page.pageSize(),"totalSessions",page.totalSessions(),"totalPages",page.totalPages()); }
      case "activity_list" -> knowledge.activities(user).stream().limit(200).toList();
      case "report_read" -> reportOutput(user, a);
      case "labels_list" -> labels.list(user);
      case "paths_list" -> paths.findAllByUserIdOrderByUpdatedAtDesc(user,PageRequest.of(integer(a,"page",0),Math.min(100,Math.max(1,integer(a,"size",50))))).stream().map(p -> Map.of("id",p.getId(),"name",p.getName(),"description",Objects.toString(p.getDescription(),""),"status",p.getStatus(),"archived",p.getStatus()==PathStatus.ARCHIVED,"createdAt",p.getCreatedAt())).toList();
      case "boards_list" -> boards.findAllByUserIdOrderByUpdatedAtDesc(user,PageRequest.of(integer(a,"page",0),Math.min(100,Math.max(1,integer(a,"size",50))))).stream().map(b -> Map.of("id",b.getId(),"name",b.getName(),"pathId",Objects.toString(b.getPathId(),""),"archived",b.isArchived(),"hidden",b.isHidden(),"updatedAt",b.getUpdatedAt())).toList();
      case "board_cards" -> { UUID boardId=UUID.fromString(Objects.toString(a.get("boardId"),"")); Board board=boards.findByIdAndUserId(boardId,user).orElseThrow(()->new IllegalArgumentException("Board not found")); boolean archived=Boolean.TRUE.equals(a.get("archived")); var pageable=PageRequest.of(integer(a,"page",0),Math.min(100,Math.max(1,integer(a,"size",50)))); yield (archived ? cards.findAllByBoardIdAndArchivedAtNotNullOrderByUpdatedAtDesc(board.getId(),pageable) : cards.findAllByBoardIdAndArchivedAtIsNullOrderByStatusIdAscPositionAsc(board.getId(),pageable)).stream().map(c->Map.of("id",c.getId(),"title",c.getTitle(),"body",Objects.toString(c.getBody(),""),"archived",c.isArchived(),"statusId",c.getStatusId(),"priority",c.getPriority())).toList(); }
      case "search" -> { int size=Math.min(50,Math.max(1,integer(a,"size",20))); int offset=Math.min(1000,integer(a,"page",0)*size); yield search.search(user,Objects.toString(a.get("q"),""),searchTypes(access.categories()),size,offset,false); }
      default -> throw new IllegalArgumentException("Unknown tool");
    };
    return Map.of("content",List.of(Map.of("type","text","text",json.writeValueAsString(value))),"isError",false);
  }
  private static int integer(Map<String,Object> a,String key,int fallback) { Object v=a.get(key); return v instanceof Number n?Math.max(0,n.intValue()):fallback; }
  private Map<String, Object> reportOutput(UUID user, Map<String, Object> arguments) {
    ReportService.Report report;
    if (arguments.containsKey("startDate")) {
      LocalDate from = LocalDate.parse((String) arguments.get("startDate"));
      LocalDate to = LocalDate.parse(Objects.toString(arguments.get("endDate"), ""));
      if (to.isBefore(from) || from.plusYears(2).isBefore(to)) {
        throw new IllegalArgumentException("Report range cannot exceed two years");
      }
      report = reports.report(user, from, to);
    } else {
      ReportService.Period period =
          ReportService.Period.valueOf(
              Objects.toString(arguments.get("period"), "WEEK").toUpperCase(Locale.ROOT));
      report = reports.report(user, period, null);
    }

    Map<String, Object> output = json.convertValue(report, Map.class);
    output.remove("sankey");
    List<?> days = (List<?>) output.remove("days");
    if (Boolean.TRUE.equals(arguments.get("includeDays"))) {
      int page = integer(arguments, "daysPage", 0);
      int size = Math.min(31, Math.max(1, integer(arguments, "daysSize", 31)));
      int start = (int) Math.min(days.size(), (long) page * size);
      int end = Math.min(days.size(), start + size);
      output.put("days", days.subList(start, end));
      output.put("daysPage", page);
      output.put("daysPageSize", size);
      output.put("totalDays", days.size());
      output.put("totalDayPages", (days.size() + size - 1) / size);
    }
    return output;
  }
  private static Map<String,Object> noteOutput(KnowledgeService.NoteView note,boolean includeContent) {
    Map<String,Object> output=new LinkedHashMap<>();
    output.put("id",note.id()); output.put("pathId",note.pathId()); output.put("activityId",note.activityId());
    output.put("timeEntryId",note.timeEntryId()); output.put("title",note.title()); output.put("createdAt",note.createdAt());
    output.put("updatedAt",note.updatedAt()); output.put("tags",note.tags()); output.put("pinned",note.pinned());
    output.put("archived",note.deletedAt()!=null); output.put("retained",true);
    if(includeContent) output.put("contentText",Objects.toString(note.contentText(),""));
    return output;
  }
  private static Set<SearchService.Type> searchTypes(Set<String> grants) {
    EnumSet<SearchService.Type> types=EnumSet.noneOf(SearchService.Type.class);
    if(grants.contains("paths")) types.add(SearchService.Type.PATH);
    if(grants.contains("boards")) { types.add(SearchService.Type.BOARD); types.add(SearchService.Type.CARD); }
    if(grants.contains("labels")) types.add(SearchService.Type.LABEL);
    if(grants.contains("notes")) types.add(SearchService.Type.NOTE);
    if(grants.contains("logs")) types.add(SearchService.Type.LOG);
    if(grants.contains("sessions")) types.add(SearchService.Type.SESSION);
    if(grants.contains("calendar")) types.add(SearchService.Type.CALENDAR_DAY);
    return types;
  }
}
