package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL        string
	RedisURL           string
	SecretKey          string
	CompanyEmailDomain string
	MaxFileSizeMB      int64
	UploadsDir         string
	S3Bucket           string
	S3Region           string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	TURNServerURL      string
	TURNUsername       string
	TURNCredential     string
	CORSOrigins        []string
}

var App *Config

func Load() {
	_ = godotenv.Load()

	maxSize, _ := strconv.ParseInt(getEnv("MAX_FILE_SIZE_MB", "10"), 10, 64)

	App = &Config{
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6379"),
		SecretKey:          getEnv("SECRET_KEY", ""),
		CompanyEmailDomain: getEnv("COMPANY_EMAIL_DOMAIN", ""),
		MaxFileSizeMB:      maxSize,
		UploadsDir:         getEnv("UPLOADS_DIR", "./uploads"),
		S3Bucket:           getEnv("S3_BUCKET", ""),
		S3Region:           getEnv("S3_REGION", ""),
		AWSAccessKeyID:     getEnv("AWS_ACCESS_KEY_ID", ""),
		AWSSecretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY", ""),
		TURNServerURL:      getEnv("TURN_SERVER_URL", ""),
		TURNUsername:       getEnv("TURN_USERNAME", ""),
		TURNCredential:     getEnv("TURN_CREDENTIAL", ""),
		CORSOrigins:        strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
	}

	if App.SecretKey == "" {
		log.Fatal("SECRET_KEY is required")
	}
	if App.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
