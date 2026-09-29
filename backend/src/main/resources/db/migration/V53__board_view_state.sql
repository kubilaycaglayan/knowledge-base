-- The Boards page state a user left: the open board (null means All boards),
-- the Kanban/Gantt view, the Gantt range, and the card search.
alter table user_preferences add column board_id uuid references boards(id) on delete set null;
alter table user_preferences add column board_view varchar(8) not null default 'kanban';
alter table user_preferences add column board_gantt_from date;
alter table user_preferences add column board_gantt_to date;
alter table user_preferences add column board_search varchar(200) not null default '';
