ALTER TABLE oauth2_authorization
    ADD COLUMN oidc_id_token_value TEXT,
    ADD COLUMN oidc_id_token_issued_at TIMESTAMPTZ,
    ADD COLUMN oidc_id_token_expires_at TIMESTAMPTZ,
    ADD COLUMN oidc_id_token_metadata TEXT,
    ADD COLUMN user_code_value TEXT,
    ADD COLUMN user_code_issued_at TIMESTAMPTZ,
    ADD COLUMN user_code_expires_at TIMESTAMPTZ,
    ADD COLUMN user_code_metadata TEXT,
    ADD COLUMN device_code_value TEXT,
    ADD COLUMN device_code_issued_at TIMESTAMPTZ,
    ADD COLUMN device_code_expires_at TIMESTAMPTZ,
    ADD COLUMN device_code_metadata TEXT;
