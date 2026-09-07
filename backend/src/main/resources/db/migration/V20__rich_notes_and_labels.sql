alter table note add column content_text text;
alter table note add column version bigint not null default 0;

update note set content_text = content where content_text is null;

create table note_tag (
    note_id uuid not null references note(id) on delete cascade,
    tag_id uuid not null references tag(id) on delete cascade,
    primary key (note_id, tag_id)
);

create index note_user_updated_idx on note (user_id, updated_at desc, id desc);
create index note_user_content_text_idx on note (user_id, content_text);
