package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Message struct {
	ID             string     `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string     `gorm:"type:uuid;not null;index:idx_msg_conv_time" json:"conversation_id"`
	SenderID       string     `gorm:"type:uuid;not null;index" json:"sender_id"`
	Type           string     `gorm:"size:50;not null;default:text" json:"type"`
	Content        *string    `gorm:"type:text" json:"content"`
	FileURL        *string    `gorm:"size:500" json:"file_url"`
	FileName       *string    `gorm:"size:255" json:"file_name"`
	FileSize       *int64     `json:"file_size"`
	ReplyToID      *string    `gorm:"type:uuid" json:"reply_to_id"`
	IsEdited       bool       `gorm:"default:false" json:"is_edited"`
	IsDeleted      bool       `gorm:"default:false" json:"is_deleted"`
	CreatedAt      time.Time  `gorm:"index:idx_msg_conv_time" json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	Sender   User             `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	ReplyTo  *Message         `gorm:"foreignKey:ReplyToID" json:"reply_to,omitempty"`
	Receipts []MessageReceipt `gorm:"foreignKey:MessageID" json:"receipts,omitempty"`
}

func (m *Message) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	return nil
}

type MessageReceipt struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	MessageID string    `gorm:"type:uuid;not null;uniqueIndex:idx_receipt_msg_user" json:"message_id"`
	UserID    string    `gorm:"type:uuid;not null;uniqueIndex:idx_receipt_msg_user;index" json:"user_id"`
	Status    string    `gorm:"size:50;not null" json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

func (mr *MessageReceipt) BeforeCreate(tx *gorm.DB) error {
	if mr.ID == "" {
		mr.ID = uuid.New().String()
	}
	return nil
}
