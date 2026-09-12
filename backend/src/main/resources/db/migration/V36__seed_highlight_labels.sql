update labels
set system = true
where lower(name) = 'highlight';

insert into labels (id, user_id, name, color, system, created_at)
select gen_random_uuid(), u.id, 'Highlight', null, true, now()
from app_user u
where not exists (
    select 1 from labels l
    where l.user_id = u.id and lower(l.name) = 'highlight'
);

insert into label_scope (label_id, scope)
select l.id, 'LOG'
from labels l
where lower(l.name) = 'highlight'
  and not exists (
      select 1 from label_scope s
      where s.label_id = l.id and s.scope = 'LOG'
  );
