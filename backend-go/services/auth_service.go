package services

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/store"
	"github.com/orgchat/backend/utils"
	"gorm.io/gorm"
)

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
	if cfg != "" && domain[1] != cfg {
		return fmt.Errorf("only %s email addresses are allowed", cfg)
	}
	return nil
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

func (s *AuthService) RefreshAccessToken(refreshToken string) (string, error) {
	claims, err := utils.DecodeToken(refreshToken)
	if err != nil || claims.Type != "refresh" {
		return "", errors.New("invalid refresh token")
	}
	if !utils.ValidateRefreshToken(claims.Sub, refreshToken) {
		return "", errors.New("refresh token revoked")
	}
	var user models.User
	if err := database.DB.Where("id = ? AND is_active = ?", claims.Sub, true).First(&user).Error; err != nil {
		return "", errors.New("user not found")
	}
	return utils.CreateAccessToken(user.ID)
}

func (s *AuthService) Logout(userID string) {
	utils.RevokeRefreshToken(userID)
	database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"is_online": false,
		"status":    "offline",
		"last_seen": time.Now(),
	})
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
	return database.DB.Model(&user).Update("password_hash", hash).Error
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

func (s *AuthService) ResetPassword(email, otp, newPassword string) error {
	var record models.PasswordResetOTP
	if err := database.DB.Where("email = ? AND otp = ?", email, otp).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("invalid or expired OTP")
		}
		return err
	}
	if time.Now().After(record.ExpiresAt) {
		database.DB.Delete(&record)
		return errors.New("OTP has expired")
	}
	if err := utils.ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	hash, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
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

	// revoke refresh token for the user
	var user models.User
	if database.DB.Where("email = ?", email).First(&user).Error == nil {
		utils.RevokeRefreshToken(user.ID)
	}
	if store.RDB != nil {
		store.RDB.Del(context.Background(), "otp:"+email)
	}
	return nil
}
