-- PostgreSQL schema for orgchat
-- Run this once against a fresh database before starting the application.
-- Tables are ordered by foreign-key dependency (referenced tables first).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID          PRIMARY KEY,
    email           VARCHAR(255)  NOT NULL,
    password_hash   VARCHAR(255)  NOT NULL,
    full_name       VARCHAR(255)  NOT NULL,
    display_name    VARCHAR(255),
    avatar_url      VARCHAR(500),
    role            VARCHAR(50)   NOT NULL DEFAULT 'employee',
    department      VARCHAR(255),
    phone_number    VARCHAR(50),
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    is_online       BOOLEAN       NOT NULL DEFAULT FALSE,
    status          VARCHAR(50)   NOT NULL DEFAULT 'offline',
    last_seen       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Self-referential: added via ALTER TABLE after table creation
    created_by_id   UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email        ON users (email);
CREATE        INDEX IF NOT EXISTS idx_users_created_by   ON users (created_by_id);

ALTER TABLE users
    ADD CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL
    NOT VALID;  -- NOT VALID skips scanning existing rows; validate separately if needed

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID         PRIMARY KEY,
    type            VARCHAR(50)  NOT NULL,
    name            VARCHAR(255),
    avatar_url      VARCHAR(500),
    created_by_id   UUID         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_conversations_created_by
        FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations (created_by_id);

-- ============================================================
-- conversation_members
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_members (
    id               UUID         PRIMARY KEY,
    conversation_id  UUID         NOT NULL,
    user_id          UUID         NOT NULL,
    role             VARCHAR(50)  NOT NULL DEFAULT 'member',
    joined_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_conv_members_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_conv_members_user
        FOREIGN KEY (user_id)         REFERENCES users          (id) ON DELETE CASCADE
);

-- Composite unique index mirrors the GORM uniqueIndex:idx_conv_user tag
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_user              ON conversation_members (conversation_id, user_id);
CREATE        INDEX IF NOT EXISTS idx_conv_members_user_id   ON conversation_members (user_id);

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id               UUID         PRIMARY KEY,
    conversation_id  UUID         NOT NULL,
    sender_id        UUID         NOT NULL,
    type             VARCHAR(50)  NOT NULL DEFAULT 'text',
    content          TEXT,
    file_url         VARCHAR(500),
    file_name        VARCHAR(255),
    file_size        BIGINT,
    reply_to_id      UUID,
    is_edited        BOOLEAN      NOT NULL DEFAULT FALSE,
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id)       REFERENCES users          (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_reply_to
        FOREIGN KEY (reply_to_id)     REFERENCES messages       (id) ON DELETE SET NULL
);

-- Composite index mirrors GORM index:idx_msg_conv_time on (conversation_id, created_at)
CREATE INDEX IF NOT EXISTS idx_msg_conv_time     ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages (sender_id);

-- ============================================================
-- message_receipts
-- ============================================================
CREATE TABLE IF NOT EXISTS message_receipts (
    id          UUID         PRIMARY KEY,
    message_id  UUID         NOT NULL,
    user_id     UUID         NOT NULL,
    status      VARCHAR(50)  NOT NULL,
    timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_receipts_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_receipts_user
        FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
);

-- Composite unique index mirrors GORM uniqueIndex:idx_receipt_msg_user
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_msg_user      ON message_receipts (message_id, user_id);
CREATE        INDEX IF NOT EXISTS idx_receipts_user_id      ON message_receipts (user_id);

-- ============================================================
-- calls
-- ============================================================
CREATE TABLE IF NOT EXISTS calls (
    id                UUID         PRIMARY KEY,
    conversation_id   UUID         NOT NULL,
    initiated_by      UUID         NOT NULL,
    type              VARCHAR(50)  NOT NULL,
    status            VARCHAR(50)  NOT NULL,
    started_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at          TIMESTAMPTZ,
    duration_seconds  INTEGER,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_calls_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_calls_initiator
        FOREIGN KEY (initiated_by)    REFERENCES users          (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation_id  ON calls (conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_initiated_by     ON calls (initiated_by);
CREATE INDEX IF NOT EXISTS idx_calls_status           ON calls (status);

-- ============================================================
-- call_participants
-- ============================================================
CREATE TABLE IF NOT EXISTS call_participants (
    id         UUID         PRIMARY KEY,
    call_id    UUID         NOT NULL,
    user_id    UUID         NOT NULL,
    joined_at  TIMESTAMPTZ,
    left_at    TIMESTAMPTZ,
    status     VARCHAR(50)  NOT NULL DEFAULT 'missed',

    CONSTRAINT fk_call_participants_call
        FOREIGN KEY (call_id)  REFERENCES calls (id) ON DELETE CASCADE,
    CONSTRAINT fk_call_participants_user
        FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_id  ON call_participants (call_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user_id  ON call_participants (user_id);

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID          PRIMARY KEY,
    user_id     UUID          NOT NULL,
    type        VARCHAR(100)  NOT NULL,
    title       VARCHAR(255)  NOT NULL,
    content     TEXT,
    data        JSONB,
    is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Composite index mirrors GORM index:idx_notif_user_read on (user_id, is_read)
CREATE INDEX IF NOT EXISTS idx_notif_user_read          ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);

-- ============================================================
-- reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
    id            UUID          PRIMARY KEY,
    user_id       UUID          NOT NULL,
    title         VARCHAR(255)  NOT NULL,
    description   TEXT,
    due_date      TIMESTAMPTZ   NOT NULL,
    is_completed  BOOLEAN       NOT NULL DEFAULT FALSE,
    notified      BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_reminders_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders (user_id);

-- ============================================================
-- admin_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
    id              UUID          PRIMARY KEY,
    admin_id        UUID          NOT NULL,
    action          VARCHAR(100)  NOT NULL,
    target_user_id  UUID,
    details         JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_admin_logs_admin
        FOREIGN KEY (admin_id)       REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_logs_target
        FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id   ON admin_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action     ON admin_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs (created_at);

-- ============================================================
-- password_reset_otps
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_otps (
    id          UUID          PRIMARY KEY,
    email       VARCHAR(255)  NOT NULL,
    otp         VARCHAR(6)    NOT NULL,
    expires_at  TIMESTAMPTZ   NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps (email);
