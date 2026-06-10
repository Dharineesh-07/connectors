package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ScheduledMeeting struct {
	ID             string     `gorm:"type:uuid;primaryKey" json:"id"`
	Title          string     `gorm:"size:255;not null" json:"title"`
	Description    *string    `gorm:"type:text" json:"description"`
	ConversationID *string    `gorm:"type:uuid;index" json:"conversation_id"`
	CreatedByID    string     `gorm:"type:uuid;not null;index" json:"created_by"`
	StartTime      time.Time  `gorm:"not null;index" json:"start_time"`
	EndTime        *time.Time `json:"end_time"`
	Room           string     `gorm:"column:room;size:255" json:"room"`
	Status         string     `gorm:"size:50;default:scheduled" json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	CreatedBy    User              `gorm:"foreignKey:CreatedByID" json:"created_by_user,omitempty"`
	Conversation *Conversation     `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
	Attendees    []MeetingAttendee `gorm:"foreignKey:MeetingID" json:"attendees,omitempty"`
}

func (m *ScheduledMeeting) BeforeCreate(tx *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	if m.Room == "" {
		m.Room = "meeting-" + m.ID
	}
	return nil
}

type MeetingAttendee struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	MeetingID string    `gorm:"type:uuid;not null;uniqueIndex:idx_meeting_user" json:"meeting_id"`
	UserID    string    `gorm:"type:uuid;not null;uniqueIndex:idx_meeting_user;index" json:"user_id"`
	Status    string    `gorm:"size:50;default:invited" json:"status"`
	CreatedAt time.Time `json:"created_at"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (a *MeetingAttendee) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
