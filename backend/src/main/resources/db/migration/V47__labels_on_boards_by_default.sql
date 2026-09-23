-- Labels are offered on Boards by default: every existing user label gains the
-- BOARD scope once. System labels (the Logs-only Highlight) keep their scopes,
-- and users can still hide any label from Boards on the Labels page.
insert into label_scope (label_id, scope)
select l.id, 'BOARD'
from labels l
where not l.system
  and not exists (
    select 1 from label_scope s where s.label_id = l.id and s.scope = 'BOARD'
  );
