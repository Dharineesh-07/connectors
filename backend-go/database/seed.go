package database

import (
	"log"

	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/utils"
)

type seedUser struct {
	email    string
	fullName string
	role     string
	password string
}

var seedUsers = []seedUser{
	{"admin@cnc.com", "Admin", "admin", "Admin@123!"},
	{"alice.johnson@cnc.com", "Alice Johnson", "employee", "Alice@123!"},
	{"bob.smith@cnc.com", "Bob Smith", "employee", "Bob@1234!"},
	{"carol.white@cnc.com", "Carol White", "employee", "Carol@123!"},
	{"david.lee@cnc.com", "David Lee", "employee", "David@123!"},
	{"eva.martinez@cnc.com", "Eva Martinez", "employee", "Eva@12345!"},
}

func Seed() {
	var count int64
	DB.Model(&models.User{}).Count(&count)
	if count > 0 {
		return
	}

	log.Println("Seeding initial users...")
	for _, s := range seedUsers {
		hash, err := utils.HashPassword(s.password)
		if err != nil {
			log.Printf("seed: failed to hash password for %s: %v", s.email, err)
			continue
		}
		user := models.User{
			Email:        s.email,
			PasswordHash: hash,
			FullName:     s.fullName,
			Role:         s.role,
			IsActive:     true,
			Status:       "offline",
		}
		if err := DB.Create(&user).Error; err != nil {
			log.Printf("seed: failed to create user %s: %v", s.email, err)
		}
	}
	log.Println("Seeding complete.")
}
