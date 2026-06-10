package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WhiteboardDraft persists the canvas state of a scribble board between sessions.
// One row per (conversation_id, created_by_id) — personal boards use the literal
// string "__personal__" as conversation_id.
type WhiteboardDraft struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	ConversationID string    `gorm:"size:255;not null;uniqueIndex:idx_wb_draft_scope" json:"conversation_id"`
	CreatedByID    string    `gorm:"type:uuid;not null;uniqueIndex:idx_wb_draft_scope" json:"created_by"`
	Name           string    `gorm:"size:255;default:''" json:"name"`
	Pages          string    `gorm:"type:text;not null;default:'[]'" json:"-"`
	Notes          string    `gorm:"type:text;not null;default:'[]'" json:"-"`
	IsSaved        bool      `gorm:"default:false" json:"is_saved"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (d *WhiteboardDraft) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	if d.Pages == "" {
		d.Pages = "[]"
	}
	if d.Notes == "" {
		d.Notes = "[]"
	}
	return nil
}
