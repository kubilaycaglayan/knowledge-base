alter table user_preferences
    alter column theme type varchar(16);

alter table user_preferences
    drop constraint user_preferences_theme;

alter table user_preferences
    add constraint user_preferences_theme
        check (theme in ('auto', 'light', 'dark', 'solarized', 'banana', 'melon', 'fruity', 'neon', 'tokyo-neon', 'beach'));
