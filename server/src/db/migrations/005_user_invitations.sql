-- Migration 005: User invitations system
-- Any user can send invites; passwords are not defined beforehand; unique invite link allows user to set their password.

CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    trip_role VARCHAR(50) DEFAULT 'VIEWER',
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash ON user_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_trip ON user_invitations(trip_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
