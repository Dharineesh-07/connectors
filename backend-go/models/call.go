package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Call struct {
	ID              string     `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID  string     `gorm:"type:uuid;not null;index" json:"conversation_id"`
	InitiatedBy     string     `gorm:"type:uuid;not null;index" json:"initiated_by"`
	Type            string     `gorm:"size:50;not null" json:"type"`
	Status          string     `gorm:"size:50;not null;index" json:"status"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at"`
	DurationSeconds *int       `json:"duration_seconds"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`

	Participants []CallParticipant `gorm:"foreignKey:CallID" json:"participants,omitempty"`
	Initiator    User              `gorm:"foreignKey:InitiatedBy" json:"initiator,omitempty"`
	Conversation Conversation      `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
}

func (c *Call) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	if c.StartedAt.IsZero() {
		c.StartedAt = time.Now()
	}
	return nil
}

type CallParticipant struct {
	ID       string     `gorm:"type:uuid;primaryKey" json:"id"`
	CallID   string     `gorm:"type:uuid;not null;index" json:"call_id"`
	UserID   string     `gorm:"type:uuid;not null;index" json:"user_id"`
	JoinedAt *time.Time `json:"joined_at"`
	LeftAt   *time.Time `json:"left_at"`
	Status   string     `gorm:"size:50;not null;default:missed" json:"status"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (cp *CallParticipant) BeforeCreate(tx *gorm.DB) error {
	if cp.ID == "" {
		cp.ID = uuid.New().String()
	}
	return nil
}
