alter table app_user
    add column password_configured boolean not null default true;
