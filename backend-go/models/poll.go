package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Poll struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string    `gorm:"type:uuid;not null;index" json:"conversation_id"`
	MessageID      string    `gorm:"type:uuid;not null;uniqueIndex" json:"message_id"`
	CreatedByID    string    `gorm:"type:uuid;not null" json:"created_by"`
	Question       string    `gorm:"size:500;not null" json:"question"`
	IsMultiple     bool      `gorm:"default:false" json:"is_multiple"`
	IsClosed       bool      `gorm:"default:false" json:"is_closed"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	Options   []PollOption `gorm:"foreignKey:PollID" json:"options,omitempty"`
	CreatedBy User         `gorm:"foreignKey:CreatedByID" json:"created_by_user,omitempty"`
}

func (p *Poll) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

type PollOption struct {
	ID        string `gorm:"type:uuid;primaryKey" json:"id"`
	PollID    string `gorm:"type:uuid;not null;index" json:"poll_id"`
	Text      string `gorm:"size:255;not null" json:"text"`
	SortOrder int    `gorm:"default:0" json:"sort_order"`

	Votes []PollVote `gorm:"foreignKey:OptionID" json:"votes,omitempty"`
}

func (o *PollOption) BeforeCreate(tx *gorm.DB) error {
	if o.ID == "" {
		o.ID = uuid.New().String()
	}
	return nil
}

type PollVote struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	PollID    string    `gorm:"type:uuid;not null;index" json:"poll_id"`
	OptionID  string    `gorm:"type:uuid;not null;uniqueIndex:idx_poll_option_user" json:"option_id"`
	UserID    string    `gorm:"type:uuid;not null;uniqueIndex:idx_poll_option_user" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (v *PollVote) BeforeCreate(tx *gorm.DB) error {
	if v.ID == "" {
		v.ID = uuid.New().String()
	}
	return nil
}
