package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Notification struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    string    `gorm:"type:uuid;not null;index:idx_notif_user_read" json:"user_id"`
	Type      string    `gorm:"size:100;not null" json:"type"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Content   *string   `gorm:"type:text" json:"content"`
	Data      *string   `gorm:"type:jsonb" json:"data"`
	IsRead    bool      `gorm:"default:false;index:idx_notif_user_read" json:"is_read"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}

func (n *Notification) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	return nil
}
