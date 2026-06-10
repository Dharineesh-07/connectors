package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Announcement struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	AuthorID  string    `gorm:"type:uuid;not null;index" json:"author_id"`
	Author    User      `gorm:"foreignKey:AuthorID" json:"author"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	IsPinned  bool      `gorm:"default:false" json:"is_pinned"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (a *Announcement) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
