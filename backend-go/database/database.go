package database

import (
	"log"

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

	if err := DB.AutoMigrate(
		&models.User{},
		&models.Conversation{},
		&models.ConversationMember{},
		&models.Message{},
		&models.MessageReceipt{},
		&models.Call{},
		&models.CallParticipant{},
		&models.Notification{},
		&models.Reminder{},
		&models.AdminLog{},
		&models.PasswordResetOTP{},
	); err != nil {
		log.Fatalf("auto-migrate failed: %v", err)
	}
}
