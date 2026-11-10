CREATE TABLE oauth2_signing_key (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    jwk TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
