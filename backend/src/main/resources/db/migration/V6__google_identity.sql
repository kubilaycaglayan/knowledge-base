alter table app_user add column google_subject varchar(255);
create unique index app_user_google_subject_unique on app_user (google_subject) where google_subject is not null;
