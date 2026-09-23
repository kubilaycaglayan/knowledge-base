-- Each status column orders its cards by hand (MANUAL) or by priority.
alter table board_statuses add column card_sort varchar(16) not null default 'MANUAL';
alter table board_statuses add constraint board_statuses_card_sort_check check (card_sort in ('MANUAL', 'PRIORITY'));
