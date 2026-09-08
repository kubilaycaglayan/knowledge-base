-- V23 could not distinguish legacy random Google hashes from real passwords.
-- Google authentication is sufficient to establish or replace the password,
-- so restore the default state for those existing rows.
update app_user
set password_configured = true
where password_configured = false
  and google_subject is not null;
