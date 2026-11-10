package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.domain.*;
import com.know.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(OutputCaptureExtension.class)
class McpControllerTest {
  private final KnowledgeService knowledge=mock(KnowledgeService.class);
  private final SearchService search=mock(SearchService.class);
  private final McpController controller=new McpController(mock(JdbcTemplate.class),new ObjectMapper().findAndRegisterModules(),knowledge,
      mock(LogService.class),mock(CalendarService.class),mock(TimerService.class),mock(ReportService.class),
      search,mock(LabelManagementService.class),mock(PathRepository.class),
      mock(BoardRepository.class),mock(BoardCardRepository.class),mock(ObjectProvider.class));

  @Test void unauthenticatedEmptyProbeGetsOAuthChallengeRegardlessOfContentType() throws Exception {
    MockMvc mvc = MockMvcBuilders.standaloneSetup(controller)
        .addPlaceholderValue("app.openai-oauth.issuer", "https://kb.example.test")
        .build();

    mvc.perform(post("/mcp").contentType(MediaType.APPLICATION_OCTET_STREAM).accept(MediaType.ALL))
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("WWW-Authenticate",
            org.hamcrest.Matchers.containsString("/.well-known/oauth-protected-resource")));
  }

  @Test void logsSafeReasonWhenOAuthAudienceDoesNotMatchMcpResource(CapturedOutput output) throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    JwtDecoder decoder = mock(JwtDecoder.class);
    @SuppressWarnings("unchecked") ObjectProvider<JwtDecoder> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(decoder);
    when(decoder.decode("oauth-token-never-log"))
        .thenReturn(Jwt.withTokenValue("oauth-token-never-log").header("alg", "RS256")
            .subject(UUID.randomUUID().toString()).audience(List.of("https://wrong.example/mcp"))
            .issuedAt(java.time.Instant.now()).expiresAt(java.time.Instant.now().plusSeconds(300)).build());
    McpController oauthController = new McpController(jdbc, new ObjectMapper().findAndRegisterModules(), knowledge,
        mock(LogService.class), mock(CalendarService.class), mock(TimerService.class), mock(ReportService.class),
        search, mock(LabelManagementService.class), mock(PathRepository.class), mock(BoardRepository.class),
        mock(BoardCardRepository.class), provider);

    var response = oauthController.handle("Bearer oauth-token-never-log", "application/json",
        new ObjectMapper().writeValueAsBytes(Map.of("id", 1, "method", "tools/list", "params", Map.of())),
        "https://kb.example.test");

    assertEquals(401, response.getStatusCode().value());
    assertTrue(output.getOut().contains("MCP OAuth bearer rejected reason=audience_mismatch"));
    assertTrue(output.getOut().contains("https://wrong.example/mcp"));
    assertFalse(output.getOut().contains("oauth-token-never-log"));
  }

  @Test void toolDiscoveryContainsReadOnlyToolsAndHonorsCategoryGrants() {
    var response=controller.toolList(Set.of("notes"));
    @SuppressWarnings("unchecked") var tools=(List<Map<String,Object>>)response.get("tools");
    assertEquals(Set.of("notes_list","note_get","search"),new HashSet<>(tools.stream().map(t->(String)t.get("name")).toList()));
    assertTrue(controller.toolList(Set.of()).get("tools").equals(List.of()));
    @SuppressWarnings("unchecked") var allTools = (List<Map<String,Object>>) controller.toolList(
        Set.of("notes", "logs", "calendar", "sessions", "activity", "reports", "paths", "labels", "boards"))
        .get("tools");
    assertEquals(12, allTools.size());
    for (var tool : allTools) {
      assertEquals(Map.of("readOnlyHint", true, "destructiveHint", false, "openWorldHint", false),
          tool.get("annotations"));
    }
  }

  @Test void searchIsRestrictedToTheGrantedSourceCategories() throws Exception {
    UUID user=UUID.randomUUID();
    when(search.search(eq(user),eq("idea"),anySet(),eq(20),eq(0),eq(false)))
        .thenReturn(new SearchService.Response(List.of(),false,false));
    controller.callTool(new McpController.Access(user,Set.of("notes")),Map.of("name","search","arguments",Map.of("q","idea")));
    verify(search).search(eq(user),eq("idea"),eq(Set.of(SearchService.Type.NOTE)),eq(20),eq(0),eq(false));
  }

  @Test void categoryGrantIsCheckedBeforeCallingDomainService() {
    var request=Map.<String,Object>of("name","notes_list","arguments",Map.of());
    assertThrows(IllegalArgumentException.class,()->controller.callTool(new McpController.Access(UUID.randomUUID(),Set.of("logs")),request));
    verifyNoInteractions(knowledge);
  }

  @Test void noteToolMarksRetainedArchivedItemsAndUsesServicePagination() throws Exception {
    UUID user=UUID.randomUUID();
    var note=new KnowledgeService.NoteView(UUID.randomUUID(),null,null,null,"Old note","content",null,null,
        java.time.Instant.parse("2025-01-01T00:00:00Z"),1,"content",List.of(),false,null,null);
    when(knowledge.pageNotes(user,2,25,null,true)).thenReturn(new KnowledgeService.NotePage(List.of(note),2,25,1,1));
    var result=controller.callTool(new McpController.Access(user,Set.of("notes")),Map.of("name","notes_list","arguments",Map.of("page",2,"size",25,"archived",true)));
    @SuppressWarnings("unchecked") var content=(List<Map<String,Object>>)result.get("content");
    String serialized=(String)content.get(0).get("text");
    assertTrue(serialized.contains("\"archived\":true"));
    assertTrue(serialized.contains("\"retained\":true"));
    assertFalse(serialized.contains("contentText"));
    assertFalse(serialized.contains("content\""));
    verify(knowledge).pageNotes(user,2,25,null,true);
  }

  @Test void noteGetReturnsPlainTextWithoutRichTextDocument() throws Exception {
    UUID user=UUID.randomUUID();
    UUID noteId=UUID.randomUUID();
    var note=new KnowledgeService.NoteView(noteId,null,null,null,"A note","{\"type\":\"doc\"}",null,null,
        null,1,"Plain text body",List.of(),false,null,null);
    when(knowledge.getNote(user,noteId)).thenReturn(note);

    var result=controller.callTool(new McpController.Access(user,Set.of("notes")),
        Map.of("name","note_get","arguments",Map.of("noteId",noteId.toString())));

    @SuppressWarnings("unchecked") var content=(List<Map<String,Object>>)result.get("content");
    String serialized=(String)content.get(0).get("text");
    assertTrue(serialized.contains("\"contentText\":\"Plain text body\""));
    assertFalse(serialized.contains("\"content\""));
    verify(knowledge).getNote(user,noteId);
  }

  @Test void oauthBearerUsesThePersistedAudienceAndScopeGrant() throws Exception {
    UUID user = UUID.randomUUID();
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    JwtDecoder decoder = mock(JwtDecoder.class);
    @SuppressWarnings("unchecked") ObjectProvider<JwtDecoder> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(decoder);
    var jwt = Jwt.withTokenValue("oauth-token").header("alg", "RS256")
        .subject(user.toString()).audience(List.of("https://kb.example.test/mcp"))
        .issuedAt(java.time.Instant.now()).expiresAt(java.time.Instant.now().plusSeconds(300)).build();
    when(decoder.decode("oauth-token")).thenReturn(jwt);
    when(jdbc.query(anyString(), any(RowMapper.class), eq("oauth-token"), eq("https://kb.example.test/mcp")))
        .thenAnswer(invocation -> {
          java.sql.ResultSet row = mock(java.sql.ResultSet.class);
          when(row.getString(1)).thenReturn(user.toString());
          when(row.getString(2)).thenReturn("kb:notes:read,kb:logs:read");
          @SuppressWarnings("unchecked") RowMapper<McpController.Access> mapper = invocation.getArgument(1);
          return Collections.singletonList(mapper.mapRow(row, 0));
        });
    McpController oauthController = new McpController(jdbc, new ObjectMapper().findAndRegisterModules(), knowledge,
        mock(LogService.class), mock(CalendarService.class), mock(TimerService.class), mock(ReportService.class),
        search, mock(LabelManagementService.class), mock(PathRepository.class), mock(BoardRepository.class),
        mock(BoardCardRepository.class), provider);

    var response = oauthController.handle("Bearer oauth-token", "application/json",
        new ObjectMapper().writeValueAsBytes(Map.of("id", 1, "method", "tools/list", "params", Map.of())),
        "https://kb.example.test");

    assertEquals(200, response.getStatusCode().value());
    verify(jdbc).query(contains("oauth2_authorization"), any(RowMapper.class),
        eq("oauth-token"), eq("https://kb.example.test/mcp"));
    verify(jdbc, never()).query(contains("mcp_access_token"), any(RowMapper.class), any());
  }
}
