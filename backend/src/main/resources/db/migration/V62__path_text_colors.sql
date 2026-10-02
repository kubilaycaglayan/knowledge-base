alter table path add column text_color varchar(7);

alter table path
    add constraint path_text_color_hex
    check (text_color is null or text_color ~ '^#[0-9A-Fa-f]{6}$');
