package config

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL        string
	RedisURL           string
	SecretKey          string
	CompanyEmailDomain string
	MaxFileSizeMB      int64
	FileExpiryDays     int
	UploadsDir         string
	S3Bucket           string
	S3Region           string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	// WebRTC / SFU
	STUNURLs           []string // STUN server URLs advertised to the browser and the SFU
	TURNURL            string   // comma-separated TURN URLs (e.g. turn:host:3478?transport=tcp)
	TURNSecret         string   // shared secret — MUST equal coturn static-auth-secret
	TURNRealm          string   // coturn realm
	WebRTCNAT1To1IP    string   // host IP the SFU advertises as its ICE host candidate (Docker/NAT)
	WebRTCUDPPort      int      // fixed UDP port the SFU binds for media (0 = ephemeral range)
	CORSOrigins        []string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	FrontendURL        string
}

// ICEServer is the JSON shape consumed by the browser's RTCPeerConnection
// config (and mirrored into the SFU's Pion SettingEngine).
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// ICEServers returns the STUN/TURN list for a given user. TURN credentials are
// time-limited and minted with coturn's shared-secret (use-auth-secret) scheme:
//
//	username   = "<unix-expiry>:<userID>"
//	credential = base64( HMAC-SHA1( secret, username ) )
func (c *Config) ICEServers(userID string) []ICEServer {
	servers := make([]ICEServer, 0, 2)
	if len(c.STUNURLs) > 0 && c.STUNURLs[0] != "" {
		servers = append(servers, ICEServer{URLs: c.STUNURLs})
	}
	if c.TURNURL != "" && c.TURNSecret != "" {
		expiry := time.Now().Add(12 * time.Hour).Unix()
		username := fmt.Sprintf("%d:%s", expiry, userID)
		mac := hmac.New(sha1.New, []byte(c.TURNSecret))
		mac.Write([]byte(username))
		credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		servers = append(servers, ICEServer{
			URLs:       strings.Split(c.TURNURL, ","),
			Username:   username,
			Credential: credential,
		})
	}
	return servers
}

var App *Config

func Load() {
	_ = godotenv.Load()

	maxSize, _ := strconv.ParseInt(getEnv("MAX_FILE_SIZE_MB", "10"), 10, 64)
	expiryDays, _ := strconv.Atoi(getEnv("FILE_EXPIRY_DAYS", "30"))
	udpPort, _ := strconv.Atoi(getEnv("WEBRTC_UDP_PORT", "0"))

	App = &Config{
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		RedisURL:           getEnv("REDIS_URL", "redis://localhost:6379"),
		SecretKey:          getEnv("SECRET_KEY", ""),
		CompanyEmailDomain: getEnv("COMPANY_EMAIL_DOMAIN", ""),
		MaxFileSizeMB:      maxSize,
		FileExpiryDays:     expiryDays,
		UploadsDir:         getEnv("UPLOADS_DIR", "./uploads"),
		S3Bucket:           getEnv("S3_BUCKET", ""),
		S3Region:           getEnv("S3_REGION", ""),
		AWSAccessKeyID:     getEnv("AWS_ACCESS_KEY_ID", ""),
		AWSSecretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY", ""),
		STUNURLs:           strings.Split(getEnv("STUN_URLS", "stun:stun.l.google.com:19302"), ","),
		TURNURL:            getEnv("TURN_URL", ""),
		TURNSecret:         getEnv("TURN_SECRET", ""),
		TURNRealm:          getEnv("TURN_REALM", "orgchat"),
		WebRTCNAT1To1IP:    getEnv("WEBRTC_NAT_1TO1_IP", ""),
		WebRTCUDPPort:      udpPort,
		CORSOrigins:        strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:8000/api/google/calendar/callback"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:5173"),
	}

	if App.SecretKey == "" {
		log.Fatal("SECRET_KEY is required")
	}
	if len(App.SecretKey) < 32 {
		log.Fatal("SECRET_KEY must be at least 32 characters")
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
