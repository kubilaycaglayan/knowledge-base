alter table labels add column system boolean not null default false;

update labels
set system = true
where lower(name) = 'highlight'
  and exists (
    select 1 from label_scope
    where label_scope.label_id = labels.id and label_scope.scope = 'LOG'
  );
