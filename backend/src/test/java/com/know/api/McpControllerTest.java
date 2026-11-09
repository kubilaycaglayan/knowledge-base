package com.know.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.know.domain.*;
import com.know.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class McpControllerTest {
  private final KnowledgeService knowledge=mock(KnowledgeService.class);
  private final SearchService search=mock(SearchService.class);
  private final McpController controller=new McpController(mock(JdbcTemplate.class),new ObjectMapper().findAndRegisterModules(),knowledge,
      mock(LogService.class),mock(CalendarService.class),mock(TimerService.class),mock(ReportService.class),
      search,mock(LabelManagementService.class),mock(PathRepository.class),
      mock(BoardRepository.class),mock(BoardCardRepository.class));

  @Test void toolDiscoveryContainsReadOnlyToolsAndHonorsCategoryGrants() {
    var response=controller.toolList(Set.of("notes"));
    @SuppressWarnings("unchecked") var tools=(List<Map<String,Object>>)response.get("tools");
    assertEquals(List.of("notes_list","search"),tools.stream().map(t->t.get("name")).toList());
    assertTrue(controller.toolList(Set.of()).get("tools").equals(List.of()));
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
    verify(knowledge).pageNotes(user,2,25,null,true);
  }
}
