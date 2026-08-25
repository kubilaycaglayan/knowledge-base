alter table path add column color varchar(7) not null default '#E8754E';
alter table path add constraint path_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
