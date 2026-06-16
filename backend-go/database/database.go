package database

import (
	"log"
	"time"

	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() {
	var err error
	DB, err = gorm.Open(postgres.Open(config.App.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	sqlDB, err := DB.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(50)
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetConnMaxLifetime(10 * time.Minute)
	}

	if err := DB.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.ConversationMember{},
		&models.Message{},
		&models.MessageReceipt{},
		&models.MessageReaction{},
		&models.PinnedMessage{},
		&models.ScheduledMessage{},
		&models.Call{},
		&models.CallParticipant{},
		&models.Notification{},
		&models.Reminder{},
		&models.Announcement{},
		&models.AdminLog{},
		&models.PasswordResetOTP{},
		&models.ScheduledMeeting{},
		&models.MeetingAttendee{},
		&models.Task{},
		&models.Poll{},
		&models.PollOption{},
		&models.PollVote{},
		&models.WhiteboardDraft{},
	); err != nil {
		log.Fatalf("auto-migrate failed: %v", err)
	}

	Seed()

	// Additional indexes not expressed via GORM struct tags.
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_message_thread_parent ON messages(thread_parent_id)`,
		`CREATE INDEX IF NOT EXISTS idx_message_reply_to ON messages(reply_to_id)`,
		`CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_logs(admin_id)`,
		`CREATE INDEX IF NOT EXISTS idx_admin_log_action_time ON admin_logs(action, created_at)`,

		// Partial index for the main message list (excludes thread replies and soft-deleted rows).
		// Covers: WHERE conversation_id = ? AND thread_parent_id IS NULL ORDER BY created_at DESC
		`CREATE INDEX IF NOT EXISTS idx_messages_conv_main ON messages(conversation_id, created_at DESC) WHERE thread_parent_id IS NULL AND is_deleted = false`,

		// Covers the unread-count subquery: WHERE user_id = ? AND status = 'read'
		`CREATE INDEX IF NOT EXISTS idx_msg_receipts_user_status ON message_receipts(user_id, status, message_id)`,

		// Background job: UPDATE scheduled_messages WHERE sent = false AND scheduled_at <= ?
		`CREATE INDEX IF NOT EXISTS idx_scheduled_msg_unsent ON scheduled_messages(scheduled_at) WHERE sent = false`,

		// Background job: SELECT reminders WHERE is_completed = false AND notified = false AND due_date <= ?
		`CREATE INDEX IF NOT EXISTS idx_reminders_bg ON reminders(due_date) WHERE is_completed = false AND notified = false`,

		// Background job: DELETE password_reset_otps WHERE expires_at < ?
		`CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires ON password_reset_otps(expires_at)`,

		// Announcements list: ORDER BY is_pinned DESC, created_at DESC
		`CREATE INDEX IF NOT EXISTS idx_announcements_list ON announcements(is_pinned, created_at)`,

		// Active call lookup: WHERE conversation_id = ? AND status IN ('initiated','ongoing')
		`CREATE INDEX IF NOT EXISTS idx_calls_active ON calls(conversation_id, status)`,

		// Public group discovery: WHERE type = 'group' AND is_private = false
		`CREATE INDEX IF NOT EXISTS idx_conversations_public_groups ON conversations(type, is_private)`,
	}
	for _, ddl := range indexes {
		if err := DB.Exec(ddl).Error; err != nil {
			log.Printf("index creation warning: %v", err)
		}
	}
}
