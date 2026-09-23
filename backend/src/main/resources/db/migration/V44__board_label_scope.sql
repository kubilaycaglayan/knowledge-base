alter table label_scope drop constraint label_scope_value;
alter table label_scope
  add constraint label_scope_value
  check (scope in ('NOTE', 'CALENDAR', 'TIME_ENTRY', 'LOG', 'BOARD'));
