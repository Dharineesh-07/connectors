package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID           string     `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string     `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string     `gorm:"size:255;not null" json:"-"`
	FullName     string     `gorm:"size:255;not null" json:"full_name"`
	DisplayName  *string    `gorm:"size:255" json:"display_name"`
	AvatarURL    *string    `gorm:"size:500" json:"avatar_url"`
	Role         string     `gorm:"size:50;default:employee" json:"role"`
	Department   *string    `gorm:"size:255" json:"department"`
	PhoneNumber  *string    `gorm:"size:50" json:"phone_number"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	IsOnline     bool       `gorm:"default:false" json:"is_online"`
	Status       string     `gorm:"size:50;default:offline" json:"status"`
	LastSeen     *time.Time `json:"last_seen"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	CreatedByID  *string    `gorm:"type:uuid;column:created_by_id" json:"created_by_id"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}
