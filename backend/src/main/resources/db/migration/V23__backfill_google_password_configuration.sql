-- Google-linked accounts may have been created with the legacy random hash.
-- They can establish a real password after authenticating with Google.
update app_user
set password_configured = false
where google_subject is not null
  and password_configured = true;
