package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/store"
	"github.com/orgchat/backend/utils"
	"gorm.io/gorm"
)

// ErrTokenRevocationFailed is returned when a password reset succeeds but the
// old refresh tokens could not be revoked (e.g. Redis is temporarily unavailable).
// Callers should treat this as a warning, not a hard failure — the password was changed.
var ErrTokenRevocationFailed = errors.New("password reset succeeded but could not invalidate all active sessions")

type AuthService struct{}

type LoginResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         *models.User `json:"user"`
}

func (s *AuthService) validateDomain(email string) error {
	domain := strings.Split(email, "@")
	if len(domain) != 2 {
		return errors.New("invalid email")
	}
	cfg := s.config()
	if cfg == "" {
		return nil
	}
	allowed := strings.Split(cfg, ",")
	for _, d := range allowed {
		if strings.EqualFold(domain[1], strings.TrimSpace(d)) {
			return nil
		}
	}
	return errors.New("Invalid credentials")
}

func (s *AuthService) config() string {
	return authDomain
}

var authDomain string

func SetAuthDomain(d string) { authDomain = d }

func (s *AuthService) Login(email, password string) (*LoginResponse, error) {
	if err := s.validateDomain(email); err != nil {
		return nil, err
	}
	var user models.User
	if err := database.DB.Where("email = ? AND is_active = ?", email, true).First(&user).Error; err != nil {
		return nil, errors.New("invalid credentials")
	}
	if !utils.CheckPassword(password, user.PasswordHash) {
		return nil, errors.New("invalid credentials")
	}

	now := time.Now()
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_online": true,
		"status":    "online",
		"last_seen": now,
	})

	access, err := utils.CreateAccessToken(user.ID)
	if err != nil {
		return nil, err
	}
	refresh, err := utils.CreateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}
	if err := utils.StoreRefreshToken(user.ID, refresh); err != nil {
		return nil, err
	}
	return &LoginResponse{AccessToken: access, RefreshToken: refresh, User: &user}, nil
}

type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (s *AuthService) RefreshTokens(refreshToken string) (*RefreshResponse, error) {
	claims, err := utils.DecodeToken(refreshToken)
	if err != nil || claims.Type != "refresh" {
		return nil, errors.New("invalid refresh token")
	}
	// Atomically consume the old token — prevents replay and concurrent reuse.
	if !utils.ConsumeRefreshToken(claims.Sub, refreshToken) {
		return nil, errors.New("refresh token revoked")
	}
	var user models.User
	if err := database.DB.Where("id = ? AND is_active = ?", claims.Sub, true).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}
	access, err := utils.CreateAccessToken(user.ID)
	if err != nil {
		return nil, err
	}
	newRefresh, err := utils.CreateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}
	if err := utils.StoreRefreshToken(user.ID, newRefresh); err != nil {
		return nil, err
	}
	return &RefreshResponse{AccessToken: access, RefreshToken: newRefresh}, nil
}

func (s *AuthService) Logout(userID string) error {
	if err := utils.RevokeRefreshToken(userID); err != nil {
		return err
	}
	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"is_online": false,
		"status":    "offline",
		"last_seen": time.Now(),
	}).Error; err != nil {
		return err
	}
	return nil
}

func (s *AuthService) ChangePassword(userID, currentPassword, newPassword string) error {
	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return err
	}
	if !utils.CheckPassword(currentPassword, user.PasswordHash) {
		return errors.New("current password is incorrect")
	}
	if err := utils.ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	hash, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}
	if err := database.DB.Model(&user).Update("password_hash", hash).Error; err != nil {
		return err
	}
	if err := utils.RevokeRefreshToken(userID); err != nil {
		log.Printf("error: could not revoke refresh tokens after password change for user %s: %v", userID, err)
	}
	return nil
}

func (s *AuthService) RequestPasswordReset(email string) error {
	if err := s.validateDomain(email); err != nil {
		return err
	}
	var user models.User
	if err := database.DB.Where("email = ? AND is_active = ?", email, true).First(&user).Error; err != nil {
		return nil // silently succeed
	}

	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return err
	}
	otp := fmt.Sprintf("%06d", n.Int64())
	expires := time.Now().Add(3 * time.Minute)

	// upsert: delete old + insert new
	database.DB.Where("email = ?", email).Delete(&models.PasswordResetOTP{})
	database.DB.Create(&models.PasswordResetOTP{Email: email, OTP: otp, ExpiresAt: expires})

	// store in Redis as well for fast lookup (best-effort; the DB row above is
	// the source of truth, so skip silently when Redis is unavailable)
	if store.RDB != nil {
		store.RDB.Set(context.Background(), "otp:"+email, otp, 3*time.Minute)
	}
	return nil
}

const otpMaxAttempts = 5
const otpLockoutDuration = 5 * time.Minute

func (s *AuthService) recordOTPFailure(email string) {
	if store.RDB == nil {
		return
	}
	ctx := context.Background()
	attemptsKey := "otp:attempts:" + email
	lockKey := "otp:locked:" + email
	n, _ := store.RDB.Incr(ctx, attemptsKey).Result()
	store.RDB.Expire(ctx, attemptsKey, otpLockoutDuration)
	if n >= int64(otpMaxAttempts) {
		store.RDB.Set(ctx, lockKey, strconv.FormatInt(n, 10), otpLockoutDuration)
		store.RDB.Del(ctx, attemptsKey)
	}
}

func (s *AuthService) ResetPassword(email, otp, newPassword string) error {
	// Check lockout before touching the DB.
	if store.RDB != nil {
		lockKey := "otp:locked:" + email
		if locked, _ := store.RDB.Exists(context.Background(), lockKey).Result(); locked > 0 {
			return errors.New("too many failed attempts, please try again in 5 minutes")
		}
	}

	var record models.PasswordResetOTP
	if err := database.DB.Where("email = ? AND otp = ?", email, otp).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.recordOTPFailure(email)
			return errors.New("invalid or expired OTP")
		}
		return err
	}
	if time.Now().After(record.ExpiresAt) {
		database.DB.Delete(&record)
		s.recordOTPFailure(email)
		return errors.New("OTP has expired")
	}
	if err := utils.ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	hash, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}

	// Fetch the user ID before the transaction so it's available for token
	// revocation even if a post-commit query were to fail.
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return errors.New("user not found")
	}

	tx := database.DB.Begin()
	if err := tx.Model(&models.User{}).Where("email = ?", email).Updates(map[string]interface{}{
		"password_hash": hash,
		"is_online":     false,
		"status":        "offline",
	}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Delete(&record).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := utils.RevokeRefreshToken(user.ID); err != nil {
		log.Printf("error: could not revoke refresh tokens after password reset for user %s: %v", user.ID, err)
		return ErrTokenRevocationFailed
	}
	if store.RDB != nil {
		ctx := context.Background()
		store.RDB.Del(ctx, "otp:"+email)
		store.RDB.Del(ctx, "otp:attempts:"+email)
		store.RDB.Del(ctx, "otp:locked:"+email)
	}
	return nil
}
