package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Reminder struct {
	ID          string    `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      string    `gorm:"type:uuid;not null;index" json:"user_id"`
	Title       string    `gorm:"size:255;not null" json:"title"`
	Description *string   `gorm:"type:text" json:"description"`
	DueDate     time.Time `json:"due_date"`
	IsCompleted bool      `gorm:"default:false" json:"is_completed"`
	Notified    bool      `gorm:"default:false" json:"notified"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (r *Reminder) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}
