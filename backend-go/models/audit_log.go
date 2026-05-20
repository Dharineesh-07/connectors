package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AdminLog struct {
	ID           string    `gorm:"type:uuid;primaryKey" json:"id"`
	AdminID      string    `gorm:"type:uuid;not null;index" json:"admin_id"`
	Action       string    `gorm:"size:100;not null;index" json:"action"`
	TargetUserID *string   `gorm:"type:uuid" json:"target_user_id"`
	Details      *string   `gorm:"type:jsonb" json:"details"`
	CreatedAt    time.Time `gorm:"index" json:"created_at"`

	Admin      User  `gorm:"foreignKey:AdminID" json:"admin,omitempty"`
	TargetUser *User `gorm:"foreignKey:TargetUserID" json:"target_user,omitempty"`
}

func (al *AdminLog) BeforeCreate(tx *gorm.DB) error {
	if al.ID == "" {
		al.ID = uuid.New().String()
	}
	return nil
}

type PasswordResetOTP struct {
	ID        string    `gorm:"type:uuid;primaryKey" json:"id"`
	Email     string    `gorm:"size:255;not null;index" json:"email"`
	OTP       string    `gorm:"size:6;not null" json:"otp"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

func (p *PasswordResetOTP) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}
