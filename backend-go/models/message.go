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
	ThreadParentID *string    `gorm:"type:uuid;index" json:"thread_parent_id"`
	PollID         *string    `gorm:"type:uuid;index" json:"poll_id"`
	IsEdited       bool       `gorm:"default:false" json:"is_edited"`
	IsDeleted      bool       `gorm:"default:false" json:"is_deleted"`
	IsEncrypted    bool       `gorm:"default:false" json:"is_encrypted"`
	CreatedAt      time.Time  `gorm:"index:idx_msg_conv_time" json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	Sender        User              `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	ReplyTo       *Message          `gorm:"foreignKey:ReplyToID" json:"reply_to,omitempty"`
	Receipts      []MessageReceipt  `gorm:"foreignKey:MessageID" json:"receipts,omitempty"`
	Reactions     []MessageReaction `gorm:"foreignKey:MessageID" json:"reactions,omitempty"`
	ThreadReplies []Message         `gorm:"foreignKey:ThreadParentID" json:"thread_replies,omitempty"`
	Poll          *Poll             `gorm:"foreignKey:MessageID" json:"poll,omitempty"`
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

type MessageReaction struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	MessageID string    `gorm:"type:uuid;not null;uniqueIndex:idx_reaction_msg_user_emoji" json:"message_id"`
	UserID    string    `gorm:"type:uuid;not null;uniqueIndex:idx_reaction_msg_user_emoji" json:"user_id"`
	Emoji     string    `gorm:"size:50;not null;uniqueIndex:idx_reaction_msg_user_emoji" json:"emoji"`
	CreatedAt time.Time `json:"created_at"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (r *MessageReaction) BeforeCreate(tx *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	return nil
}

type PinnedMessage struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string    `gorm:"type:uuid;not null;index" json:"conversation_id"`
	MessageID      string    `gorm:"type:uuid;not null;uniqueIndex" json:"message_id"`
	PinnedByID     string    `gorm:"type:uuid;not null" json:"pinned_by"`
	PinnedAt       time.Time `json:"pinned_at"`

	Message  Message `gorm:"foreignKey:MessageID" json:"message,omitempty"`
	PinnedBy User    `gorm:"foreignKey:PinnedByID" json:"pinned_by_user,omitempty"`
}

func (p *PinnedMessage) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	if p.PinnedAt.IsZero() {
		p.PinnedAt = time.Now()
	}
	return nil
}

type ScheduledMessage struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string    `gorm:"type:uuid;not null;index" json:"conversation_id"`
	SenderID       string    `gorm:"type:uuid;not null;index" json:"sender_id"`
	Type           string    `gorm:"size:50;not null;default:text" json:"type"`
	Content        *string   `gorm:"type:text" json:"content"`
	FileURL        *string   `gorm:"size:500" json:"file_url"`
	FileName       *string   `gorm:"size:255" json:"file_name"`
	FileSize       *int64    `json:"file_size"`
	ScheduledAt    time.Time `gorm:"not null;index" json:"scheduled_at"`
	Sent           bool      `gorm:"default:false;index" json:"sent"`
	CreatedAt      time.Time `json:"created_at"`
}

func (s *ScheduledMessage) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
