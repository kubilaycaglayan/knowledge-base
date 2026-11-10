CREATE TABLE oauth2_registered_client (
    id VARCHAR(100) PRIMARY KEY,
    client_id VARCHAR(100) NOT NULL UNIQUE,
    client_id_issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_secret VARCHAR(200),
    client_secret_expires_at TIMESTAMPTZ,
    client_name VARCHAR(200) NOT NULL,
    client_authentication_methods TEXT NOT NULL,
    authorization_grant_types TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    post_logout_redirect_uris TEXT NOT NULL DEFAULT '',
    scopes TEXT NOT NULL,
    client_settings TEXT NOT NULL,
    token_settings TEXT NOT NULL
);

CREATE TABLE oauth2_authorization (
    id VARCHAR(100) PRIMARY KEY,
    registered_client_id VARCHAR(100) NOT NULL REFERENCES oauth2_registered_client(id) ON DELETE CASCADE,
    principal_name VARCHAR(200) NOT NULL,
    authorization_grant_type VARCHAR(100) NOT NULL,
    authorized_scopes TEXT NOT NULL,
    attributes TEXT,
    state VARCHAR(500),
    authorization_code_value TEXT,
    authorization_code_issued_at TIMESTAMPTZ,
    authorization_code_expires_at TIMESTAMPTZ,
    authorization_code_metadata TEXT,
    access_token_value TEXT,
    access_token_issued_at TIMESTAMPTZ,
    access_token_expires_at TIMESTAMPTZ,
    access_token_metadata TEXT,
    access_token_type VARCHAR(100),
    access_token_scopes TEXT,
    refresh_token_value TEXT,
    refresh_token_issued_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    refresh_token_metadata TEXT
);
CREATE INDEX idx_oauth2_authorization_principal ON oauth2_authorization(principal_name);

CREATE TABLE oauth2_authorization_resource (
    authorization_id VARCHAR(100) PRIMARY KEY REFERENCES oauth2_authorization(id) ON DELETE CASCADE,
    resource VARCHAR(500) NOT NULL
);

CREATE TABLE oauth2_authorization_consent (
    registered_client_id VARCHAR(100) NOT NULL REFERENCES oauth2_registered_client(id) ON DELETE CASCADE,
    principal_name VARCHAR(200) NOT NULL,
    authorities TEXT NOT NULL,
    PRIMARY KEY (registered_client_id, principal_name)
);

CREATE TABLE oauth2_refresh_token_history (
    token_hash CHAR(64) PRIMARY KEY,
    authorization_id VARCHAR(100) NOT NULL REFERENCES oauth2_authorization(id) ON DELETE CASCADE,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE spring_session (
    primary_id CHAR(36) NOT NULL PRIMARY KEY,
    session_id CHAR(36) NOT NULL UNIQUE,
    creation_time BIGINT NOT NULL,
    last_access_time BIGINT NOT NULL,
    max_inactive_interval INT NOT NULL,
    expiry_time BIGINT NOT NULL,
    principal_name VARCHAR(100)
);
CREATE INDEX idx_spring_session_expiry ON spring_session(expiry_time);
CREATE INDEX idx_spring_session_principal ON spring_session(principal_name);

CREATE TABLE spring_session_attributes (
    session_primary_id CHAR(36) NOT NULL REFERENCES spring_session(primary_id) ON DELETE CASCADE,
    attribute_name VARCHAR(200) NOT NULL,
    attribute_bytes BYTEA NOT NULL,
    PRIMARY KEY (session_primary_id, attribute_name)
);
