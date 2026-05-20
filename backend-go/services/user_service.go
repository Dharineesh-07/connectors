package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/utils"
	"gorm.io/gorm"
)

type UserService struct{}

type UserListResponse struct {
	Users      []models.User `json:"users"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	Limit      int           `json:"limit"`
	TotalPages int           `json:"total_pages"`
}

type AdminStatsResponse struct {
	TotalUsers      int64 `json:"total_users"`
	ActiveUsers     int64 `json:"active_users"`
	OnlineUsers     int64 `json:"online_users"`
	MessagesToday   int64 `json:"messages_today"`
	CallsToday      int64 `json:"calls_today"`
	NewUsersThisWeek int64 `json:"new_users_this_week"`
}

type AuditLogListResponse struct {
	Logs       []models.AdminLog `json:"logs"`
	Total      int64             `json:"total"`
	Page       int               `json:"page"`
	Limit      int               `json:"limit"`
	TotalPages int               `json:"total_pages"`
}

func (s *UserService) LogAdminAction(tx *gorm.DB, adminID, action string, targetUserID *string, details interface{}) error {
	var detailsJSON *string
	if details != nil {
		b, _ := json.Marshal(details)
		str := string(b)
		detailsJSON = &str
	}
	entry := &models.AdminLog{
		AdminID:      adminID,
		Action:       action,
		TargetUserID: targetUserID,
		Details:      detailsJSON,
	}
	db := tx
	if db == nil {
		db = database.DB
	}
	return db.Create(entry).Error
}

func (s *UserService) CreateUser(adminID string, email, fullName string, department, role *string) (*models.User, error) {
	// domain check
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return nil, errors.New("invalid email")
	}
	if authDomain != "" && parts[1] != authDomain {
		return nil, fmt.Errorf("only %s email addresses are allowed", authDomain)
	}

	var existing models.User
	if database.DB.Where("email = ?", email).First(&existing).Error == nil {
		return nil, errors.New("email already registered")
	}

	tempPassword := fmt.Sprintf("Temp%d!", time.Now().UnixNano()%100000)
	hash, err := utils.HashPassword(tempPassword)
	if err != nil {
		return nil, err
	}

	r := "employee"
	if role != nil && *role != "" {
		r = *role
	}
	user := &models.User{
		Email:        email,
		PasswordHash: hash,
		FullName:     fullName,
		Department:   department,
		Role:         r,
		CreatedByID:  &adminID,
	}

	tx := database.DB.Begin()
	if err := tx.Create(user).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := s.LogAdminAction(tx, adminID, "create_user", &user.ID, map[string]string{"email": email}); err != nil {
		tx.Rollback()
		return nil, err
	}
	tx.Commit()

	// mock invite email
	fmt.Printf("[EMAIL] Invite sent to %s with temp password: %s\n", email, tempPassword)
	return user, nil
}

func (s *UserService) ListUsers(page, limit int, search, department string, isActive *bool, role string) (*UserListResponse, error) {
	query := database.DB.Model(&models.User{})
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("full_name LIKE ? OR email LIKE ?", like, like)
	}
	if department != "" {
		query = query.Where("department = ?", department)
	}
	if isActive != nil {
		query = query.Where("is_active = ?", *isActive)
	}
	if role != "" {
		query = query.Where("role = ?", role)
	}

	var total int64
	query.Count(&total)

	var users []models.User
	offset := (page - 1) * limit
	query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&users)

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &UserListResponse{Users: users, Total: total, Page: page, Limit: limit, TotalPages: pages}, nil
}

func (s *UserService) UpdateUser(adminID, userID string, updates map[string]interface{}) (*models.User, error) {
	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return nil, errors.New("user not found")
	}

	// prevent admin from changing their own role or deactivating themselves
	if adminID == userID {
		delete(updates, "role")
		if v, ok := updates["is_active"]; ok {
			if active, _ := v.(bool); !active {
				return nil, errors.New("cannot deactivate your own account")
			}
		}
	}

	allowed := []string{"full_name", "display_name", "department", "role", "is_active", "phone_number", "avatar_url"}
	filtered := make(map[string]interface{})
	for _, k := range allowed {
		if v, ok := updates[k]; ok {
			filtered[k] = v
		}
	}

	tx := database.DB.Begin()
	if err := tx.Model(&user).Updates(filtered).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := s.LogAdminAction(tx, adminID, "update_user", &userID, filtered); err != nil {
		tx.Rollback()
		return nil, err
	}
	tx.Commit()
	database.DB.First(&user, "id = ?", userID)
	return &user, nil
}

func (s *UserService) DeactivateUser(adminID, userID string) error {
	if adminID == userID {
		return errors.New("cannot deactivate your own account")
	}
	tx := database.DB.Begin()
	tx.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"is_active": false,
		"is_online": false,
		"status":    "offline",
	})
	s.LogAdminAction(tx, adminID, "deactivate_user", &userID, nil)
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return err
	}
	utils.RevokeRefreshToken(userID)
	return nil
}

func (s *UserService) ResetUserPassword(adminID, userID, newPassword string) error {
	if err := utils.ValidatePasswordStrength(newPassword); err != nil {
		return err
	}
	hash, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}
	tx := database.DB.Begin()
	tx.Model(&models.User{}).Where("id = ?", userID).Update("password_hash", hash)
	s.LogAdminAction(tx, adminID, "reset_password", &userID, nil)
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return err
	}
	utils.RevokeRefreshToken(userID)
	return nil
}

func (s *UserService) ListAuditLogs(page, limit int, adminID, action, dateFrom, dateTo string) (*AuditLogListResponse, error) {
	query := database.DB.Model(&models.AdminLog{}).Preload("Admin").Preload("TargetUser")
	if adminID != "" {
		query = query.Where("admin_id = ?", adminID)
	}
	if action != "" {
		query = query.Where("action = ?", action)
	}
	if dateFrom != "" {
		query = query.Where("created_at >= ?", dateFrom)
	}
	if dateTo != "" {
		query = query.Where("created_at <= ?", dateTo)
	}

	var total int64
	query.Count(&total)

	var logs []models.AdminLog
	offset := (page - 1) * limit
	query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&logs)

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &AuditLogListResponse{Logs: logs, Total: total, Page: page, Limit: limit, TotalPages: pages}, nil
}

func (s *UserService) GetStats() (*AdminStatsResponse, error) {
	var stats AdminStatsResponse
	database.DB.Model(&models.User{}).Count(&stats.TotalUsers)
	database.DB.Model(&models.User{}).Where("is_active = ?", true).Count(&stats.ActiveUsers)
	database.DB.Model(&models.User{}).Where("is_online = ?", true).Count(&stats.OnlineUsers)

	today := time.Now().Truncate(24 * time.Hour)
	database.DB.Model(&models.Message{}).Where("created_at >= ?", today).Count(&stats.MessagesToday)
	database.DB.Model(&models.Call{}).Where("created_at >= ?", today).Count(&stats.CallsToday)

	weekAgo := time.Now().AddDate(0, 0, -7)
	database.DB.Model(&models.User{}).Where("created_at >= ?", weekAgo).Count(&stats.NewUsersThisWeek)
	return &stats, nil
}

func (s *UserService) DirectoryUsers(search string, limit int) ([]models.User, error) {
	query := database.DB.Where("is_active = ?", true)
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("full_name LIKE ? OR email LIKE ?", like, like)
	}
	var users []models.User
	query.Limit(limit).Find(&users)
	return users, nil
}

func (s *UserService) UpdateSelf(userID string, updates map[string]interface{}) (*models.User, error) {
	allowed := []string{"display_name", "phone_number", "avatar_url"}
	filtered := make(map[string]interface{})
	for _, k := range allowed {
		if v, ok := updates[k]; ok {
			filtered[k] = v
		}
	}
	database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(filtered)
	var user models.User
	database.DB.First(&user, "id = ?", userID)
	return &user, nil
}

func (s *UserService) StoreFCMToken(userID, token string) {
	// store FCM token in Redis: fcm:{user_id}
	from := fmt.Sprintf("fcm:%s", userID)
	database.DB.Exec("SELECT 1") // keep DB alive; actual store is Redis
	_ = from
	// in real impl: store.RDB.Set(ctx, "fcm:"+userID, token, 0)
	fmt.Printf("[FCM] stored token for user %s\n", userID)
}
