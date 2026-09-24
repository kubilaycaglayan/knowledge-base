-- Columns can also sort by priority with Low first.
alter table board_statuses drop constraint board_statuses_card_sort_check;
alter table board_statuses add constraint board_statuses_card_sort_check check (card_sort in ('MANUAL', 'PRIORITY', 'PRIORITY_LAST'));

-- The All boards view merges columns by name; each user keeps a sort per
-- merged column (the trimmed, lower-cased name). A missing row means MANUAL.
create table board_column_sorts (
    user_id uuid not null references app_user(id) on delete cascade,
    column_key varchar(80) not null,
    card_sort varchar(16) not null,
    primary key (user_id, column_key),
    constraint board_column_sorts_card_sort_check check (card_sort in ('PRIORITY', 'PRIORITY_LAST'))
);

-- The board a new card from the All boards view goes to.
alter table user_preferences add column last_card_board_id uuid references boards(id) on delete set null;
