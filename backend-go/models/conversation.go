package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Conversation struct {
	ID          string    `gorm:"type:uuid;primaryKey" json:"id"`
	Type        string    `gorm:"size:50;not null" json:"type"`
	Name        *string   `gorm:"size:255" json:"name"`
	AvatarURL   *string   `gorm:"size:500" json:"avatar_url"`
	CreatedByID string    `gorm:"type:uuid;not null" json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	Members []ConversationMember `gorm:"foreignKey:ConversationID" json:"members,omitempty"`
}

func (c *Conversation) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

type ConversationMember struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string    `gorm:"type:uuid;not null;uniqueIndex:idx_conv_user" json:"conversation_id"`
	UserID         string    `gorm:"type:uuid;not null;uniqueIndex:idx_conv_user;index" json:"user_id"`
	Role           string    `gorm:"size:50;default:member" json:"role"`
	JoinedAt       time.Time `json:"joined_at"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (cm *ConversationMember) BeforeCreate(tx *gorm.DB) error {
	if cm.ID == "" {
		cm.ID = uuid.New().String()
	}
	if cm.JoinedAt.IsZero() {
		cm.JoinedAt = time.Now()
	}
	return nil
}
