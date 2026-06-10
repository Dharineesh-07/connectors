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
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
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
	}
	for _, ddl := range indexes {
		if err := DB.Exec(ddl).Error; err != nil {
			log.Printf("index creation warning: %v", err)
		}
	}
}
