package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Task struct {
	ID             string     `gorm:"type:uuid;primaryKey" json:"id"`
	Title          string     `gorm:"size:500;not null" json:"title"`
	Description    *string    `gorm:"type:text" json:"description"`
	ConversationID *string    `gorm:"type:uuid;index" json:"conversation_id"`
	MessageID      *string    `gorm:"type:uuid;index" json:"message_id"`
	CreatedByID    string     `gorm:"type:uuid;not null;index" json:"created_by"`
	AssignedToID   *string    `gorm:"type:uuid;index" json:"assigned_to"`
	Status         string     `gorm:"size:50;default:todo;index" json:"status"`
	DueDate        *time.Time `gorm:"index" json:"due_date"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	CreatedBy    User          `gorm:"foreignKey:CreatedByID" json:"created_by_user,omitempty"`
	AssignedTo   *User         `gorm:"foreignKey:AssignedToID" json:"assigned_to_user,omitempty"`
	Conversation *Conversation `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
	Message      *Message      `gorm:"foreignKey:MessageID" json:"message,omitempty"`
}

func (t *Task) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}
