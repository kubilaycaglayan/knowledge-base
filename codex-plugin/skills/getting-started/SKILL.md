---
name: recall-personal-knowledge-base
description: Use Recall Personal Knowledge Base with the user's Knowledge Base MCP connection for questions about tracked work, hours by project or label, notes, logs, daily records, boards, and recent activity.
---

# Recall Personal Knowledge Base

Use the user's existing Knowledge Base MCP connection for questions about their own records. It is read-only. Retrieve, compare, and summarize; do not claim to create or change records.

## First-use context

Before answering the user's first Knowledge Base question in a conversation, call labels_list and paths_list. Collect every available label and path name, paging through paths_list until no more paths are returned. Treat these names as the user's semantic map: records can be organized under one or more labels and paths, and the names can reveal the user's terminology for projects, topics, and kinds of work. Use this context to guide searches and interpret results. Names are clues, not definitions; qualify uncertain interpretations instead of presenting guesses as facts. Reuse the map for later questions in the same conversation, and refresh it when the user asks or when results show it may be stale. If a category is unavailable, say so and continue only with the context and tools the token permits.

## Connection defaults

Default endpoint: https://knowledgebase.blaqc.space/mcp  
Default server name: knowledge-base

The plugin connects through OAuth. The user signs in to their existing Knowledge Base account and selects read categories during consent. Do not ask users for MCP tokens or passwords in chat. For direct clients, use the OAuth connection flow supported by that client; manually created MCP tokens remain available separately in **Settings → MCP**.

## Knowledge Base records

- **Paths** are work areas, projects, or topics. Sessions can be assigned to a path; reports summarize time by path.
- **Sessions** are tracked time entries with start, optional end, duration, description, and sometimes a path. Session labels can represent work topics.
- **Notes** are longer knowledge records with titles and content. They may link to paths or other records, carry labels, and be archived.
- **Logs** are timestamped journal entries for short updates; they can carry labels.
- **Calendar days** are daily records, not scheduled appointments. Each day may contain a note and labels with portions.
- **Labels** organize notes, sessions, logs, calendar days, and boards. A label may have multiple scopes.
- **Boards and cards** organize work and tasks. Cards have a board, status, priority, and archived state.
- **Activity** shows up to the 200 most recent actions; older actions may not appear.

## Choose the tool

- **Hours today / this week / this month / this year:** report_read. It returns total seconds plus path, session-label, and calendar-label breakdowns. Daily rows are omitted by default; request them only when useful with includeDays=true and page through the bounded result. Sankey data is not returned. Convert seconds to hours and state the dates used.
- **Last month / last year:** report_read with explicit startDate and endDate. Bare WEEK, MONTH, and YEAR mean the current calendar period, not the previous one.
- **Work by project or topic:** report_read for time totals; use path and session-label breakdowns. Use search for related notes, logs, sessions, cards, or calendar records.
- **A date's journal/calendar details:** calendar_days.
- **Short updates:** logs_list. Use labels_list and search to explore their labels.
- **Longer written material:** use notes_list to find matching note metadata (q searches text); call note_get with the returned noteId to read one note's plain-text body. Use archived=true when archived notes are requested.
- **Label exploration:** labels_list gives the names, IDs, and scopes. Then search by the exact label name. Label-based results include via=LABEL and viaName; use these to identify records found through that label.
- **Projects and tasks:** paths_list, boards_list, then board_cards using a boardId returned by boards_list.
- **Recent changes:** activity_list.
- **Broad questions:** search, then use report_read for totals or a focused list tool for details.

## MCP tool reference

These are MCP tools on the connected server, not separate REST endpoints. Calls go through /mcp.

| Tool | Arguments and limits |
| --- | --- |
| report_read | period=WEEK, MONTH, YEAR means current calendar period. Or send inclusive startDate/endDate as YYYY-MM-DD; custom ranges may not exceed two years. Returns totals and category breakdowns; daily rows are omitted unless includeDays=true, then daysPage/daysSize paginate at most 31 rows. Sankey data is omitted. |
| calendar_days | Optional ISO startDate/endDate; defaults to the past 30 days through today; maximum range one year. |
| sessions_list | page is zero-based; size defaults to 20 and is capped at 50. No date filter. |
| notes_list | Returns metadata without note bodies. page is zero-based; size defaults to 20 and is capped at 100; optional q and archived. |
| note_get | Requires noteId from notes_list; returns plain-text content for one note, without the rich-text JSON document. |
| logs_list | page is zero-based; size defaults to 50 and is capped at 100. No date or text filter. |
| activity_list | Latest 200 entries maximum; no date filter. |
| labels_list | Lists labels, IDs, scopes, and system status. |
| search | Send q; page is zero-based; size defaults to 20 and is capped at 50; offset stops at 1,000. No date filter. |
| paths_list | page is zero-based; size defaults to 50 and is capped at 100; archived paths are marked. |
| boards_list | page is zero-based; size defaults to 50 and is capped at 100; archived and hidden boards are marked. |
| board_cards | Requires boardId; archived=true selects archived cards. page is zero-based; size defaults to 50 and is capped at 100. |

## Query guidance

1. For time totals, prefer report_read over adding up one page of sessions. For a custom range, include both dates; the end date is inclusive.
2. “This week” means Monday through Sunday. “Last month” and “last year” mean the previous complete calendar periods, so calculate their explicit date bounds.
3. To explore a label, get its exact name using labels_list, then search by that name. Search also matches direct text and matching paths; inspect via and viaName so you can explain why each result appeared.
4. Page through bounded lists before concluding there are no records. Search may return fuzzy matches when literal matches are absent, and is capped at offset 1,000.
5. If a tool is absent or the token lacks a category, explain the needed category. Do not use another tool or endpoint to bypass the grant.
6. Give concise answers with the date range, total or finding, and relevant path, label, or source. Mention limits when they affect the conclusion.
