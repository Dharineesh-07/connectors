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
	{"admin@compunetconnections.com", "Admin", "admin", "Admin@1234$"},
	{"ranjithp@compunetconnections.com", "Ranjith", "admin", "Ranjith@123"},
	{"kalaimanir@compunetconnections.com", "Kalaimani", "employee", "Kalaimani@123"},
	{"rahulr@compunetconnections.com", "Rahul", "employee", "Rahul@123"},
	{"yaminidevip@compunet.work", "Yamini", "employee", "Yamini@123"},
	{"akshayar@compunetconnections.com", "Akshaya", "employee", "Akshaya@123"},
	{"ajeethaar@compunet.work", "Ajeetha", "employee", "Ajeetha@123"},
	{"athreyans@compunetconnections.com", "Athreyan", "admin", "Athreyan@123"},
	{"logeshwaranv@compunet.work", "Logeshwaran", "employee", "Logesh@123"},
	{"praveenkumarr@compunet.work", "Praveen Kumar", "employee", "Praveen@123"},
	{"karthikeyann@compunet.work", "Karthikeyan","employee", "Karthikeyan@123"},
	{"ajithe@compunet.work", "Ajith","employee", "Ajith@123"},
	{"antonyv@compunet.work", "Victor","employee", "Victor@123"},
	{"mohanasundaris@compunet.work", "Mohanasundari", "employee", "Mohanasundari@123"},
	{"santhoshkumard@compunet.work", "Santhosh Kumar", "employee", "Santhosh@123"},
	{"sanjays@compunet.work", "Sanjay", "employee", "Sanjay@123"},
	{"dharineeshss@compunet.work", "Dharineesh", "employee", "Dharineesh@123"},
	{"vijayaragavana@compunet.work", "Vijayaragavan", "employee", "Vijay@123"},
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
