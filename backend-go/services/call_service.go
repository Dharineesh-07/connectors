package services

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
)

type CallService struct{}

type TURNCredentials struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
}

type CallResponse struct {
	Call            *models.Call     `json:"call"`
	TURNCredentials *TURNCredentials `json:"turn_credentials,omitempty"`
}

type CallListResponse struct {
	Calls      []models.Call `json:"calls"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	Limit      int           `json:"limit"`
	TotalPages int           `json:"total_pages"`
}

func (s *CallService) GenerateTURNCredentials(userID string) *TURNCredentials {
	cfg := config.App
	timestamp := time.Now().Unix() + 86400
	username := fmt.Sprintf("%d:%s", timestamp, userID)
	mac := hmac.New(sha1.New, []byte(cfg.TURNCredential))
	mac.Write([]byte(username))
	credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return &TURNCredentials{
		URLs:       []string{cfg.TURNServerURL},
		Username:   username,
		Credential: credential,
	}
}

func (s *CallService) requireMember(convID, userID string) error {
	var m models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&m).Error; err != nil {
		return errors.New("not a member of this conversation")
	}
	return nil
}

func (s *CallService) loadCall(callID string) (*models.Call, error) {
	var call models.Call
	if err := database.DB.Preload("Participants.User").Preload("Initiator").Preload("Conversation").
		First(&call, "id = ?", callID).Error; err != nil {
		return nil, errors.New("call not found")
	}
	return &call, nil
}

func (s *CallService) InitiateCall(convID, initiatorID, callType string) (*CallResponse, error) {
	if err := s.requireMember(convID, initiatorID); err != nil {
		return nil, err
	}

	call := &models.Call{
		ConversationID: convID,
		InitiatedBy:    initiatorID,
		Type:           callType,
		Status:         "initiated",
		StartedAt:      time.Now(),
	}
	tx := database.DB.Begin()
	if err := tx.Create(call).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Add all conversation members as participants.
	// Initiator = joined+now, everyone else = missed+nil (matches Python).
	var members []models.ConversationMember
	tx.Where("conversation_id = ?", convID).Find(&members)
	now := time.Now()
	for _, m := range members {
		p := &models.CallParticipant{CallID: call.ID, UserID: m.UserID}
		if m.UserID == initiatorID {
			p.Status = "joined"
			p.JoinedAt = &now
		} else {
			p.Status = "missed"
			p.JoinedAt = nil
		}
		tx.Create(p)
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	loaded, err := s.loadCall(call.ID)
	if err != nil {
		return nil, err
	}
	return &CallResponse{Call: loaded, TURNCredentials: s.GenerateTURNCredentials(initiatorID)}, nil
}

func (s *CallService) JoinCall(callID, userID string) (*CallResponse, error) {
	var check models.Call
	if err := database.DB.First(&check, "id = ?", callID).Error; err != nil {
		return nil, errors.New("call not found")
	}
	if check.Status == "ended" {
		return nil, errors.New("this call has already ended")
	}
	if check.Status == "missed" {
		return nil, errors.New("this call was missed")
	}

	if err := s.requireMember(check.ConversationID, userID); err != nil {
		return nil, err
	}

	now := time.Now()
	var p models.CallParticipant
	result := database.DB.Where("call_id = ? AND user_id = ?", callID, userID).First(&p)
	if result.Error != nil {
		p = models.CallParticipant{CallID: callID, UserID: userID, Status: "joined", JoinedAt: &now}
		database.DB.Create(&p)
	} else {
		database.DB.Model(&p).Updates(map[string]interface{}{"status": "joined", "joined_at": now, "left_at": nil})
	}

	if check.Status == "initiated" {
		database.DB.Model(&check).Update("status", "ongoing")
	}

	loaded, err := s.loadCall(callID)
	if err != nil {
		return nil, err
	}
	return &CallResponse{Call: loaded, TURNCredentials: s.GenerateTURNCredentials(userID)}, nil
}

func (s *CallService) LeaveCall(callID, userID string) (*models.Call, error) {
	var call models.Call
	if err := database.DB.First(&call, "id = ?", callID).Error; err != nil {
		return nil, errors.New("call not found")
	}
	if call.Status == "ended" || call.Status == "missed" {
		return nil, errors.New("call is already finished")
	}

	var p models.CallParticipant
	now := time.Now()
	if database.DB.Where("call_id = ? AND user_id = ?", callID, userID).First(&p).Error == nil {
		newStatus := "left"
		if p.Status == "missed" {
			newStatus = "rejected"
		}
		database.DB.Model(&p).Updates(map[string]interface{}{"left_at": now, "status": newStatus})
	}

	// count remaining joined participants (excluding this user)
	var remainingJoined int64
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND status = ? AND user_id != ?", callID, "joined", userID).
		Count(&remainingJoined)

	// load conversation to check type
	var conv models.Conversation
	isDirectCall := false
	if database.DB.First(&conv, "id = ?", call.ConversationID).Error == nil {
		isDirectCall = conv.Type == "direct"
	}

	// end the call if no joined participants remain, or it is a 1:1 call
	if remainingJoined == 0 || isDirectCall {
		duration := int(now.Sub(call.StartedAt).Seconds())
		if duration < 0 {
			duration = 0
		}
		database.DB.Model(&call).Updates(map[string]interface{}{
			"status":           "ended",
			"ended_at":         now,
			"duration_seconds": duration,
		})
	}

	return s.loadCall(callID)
}

func (s *CallService) GetCallHistory(userID string, page, limit int, callType, status, dateFrom, dateTo string) (*CallListResponse, error) {
	query := database.DB.Model(&models.Call{}).
		Joins("JOIN call_participants ON call_participants.call_id = calls.id").
		Where("call_participants.user_id = ?", userID).
		Preload("Participants.User").
		Preload("Initiator")

	if callType != "" {
		query = query.Where("calls.type = ?", callType)
	}
	if status != "" {
		query = query.Where("calls.status = ?", status)
	}
	if dateFrom != "" {
		query = query.Where("calls.started_at >= ?", dateFrom)
	}
	if dateTo != "" {
		query = query.Where("calls.started_at <= ?", dateTo)
	}

	var total int64
	query.Count(&total)

	var calls []models.Call
	offset := (page - 1) * limit
	query.Order("calls.created_at DESC").Offset(offset).Limit(limit).Find(&calls)

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &CallListResponse{Calls: calls, Total: total, Page: page, Limit: limit, TotalPages: pages}, nil
}

func (s *CallService) AdminGetCallHistory(page, limit int, callType, status, dateFrom, dateTo string) (*CallListResponse, error) {
	query := database.DB.Model(&models.Call{}).
		Preload("Participants.User").
		Preload("Initiator")

	if callType != "" {
		query = query.Where("type = ?", callType)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if dateFrom != "" {
		query = query.Where("created_at >= ?", dateFrom)
	}
	if dateTo != "" {
		query = query.Where("created_at <= ?", dateTo)
	}

	var total int64
	query.Count(&total)

	var calls []models.Call
	offset := (page - 1) * limit
	query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&calls)

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &CallListResponse{Calls: calls, Total: total, Page: page, Limit: limit, TotalPages: pages}, nil
}

func (s *CallService) InviteToCall(callID, inviterID, targetUserID string) (*models.Call, error) {
	var call models.Call
	if err := database.DB.First(&call, "id = ?", callID).Error; err != nil {
		return nil, errors.New("call not found")
	}
	if call.Status == "ended" || call.Status == "missed" {
		return nil, errors.New("call is already finished")
	}

	// handle existing participant (previously left/missed → allow re-invite)
	var existing models.CallParticipant
	if database.DB.Where("call_id = ? AND user_id = ?", callID, targetUserID).First(&existing).Error == nil {
		if existing.Status == "joined" || existing.Status == "invited" {
			return s.loadCall(callID) // already active, return as-is
		}
		// reset so they can rejoin
		database.DB.Model(&existing).Updates(map[string]interface{}{
			"status":    "invited",
			"joined_at": nil,
			"left_at":   nil,
		})
	}

	// load conversation to check if direct
	var conv models.Conversation
	if err := database.DB.Preload("Members").First(&conv, "id = ?", call.ConversationID).Error; err != nil {
		return nil, errors.New("conversation not found")
	}

	tx := database.DB.Begin()

	if conv.Type == "direct" {
		// upgrade to group conversation
		memberIDs := map[string]bool{}
		for _, m := range conv.Members {
			memberIDs[m.UserID] = true
		}
		memberIDs[targetUserID] = true

		groupName := "Group Call"
		newConv := &models.Conversation{
			Type:        "group",
			Name:        &groupName,
			CreatedByID: inviterID,
		}
		if err := tx.Create(newConv).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
		for uid := range memberIDs {
			role := "member"
			if uid == inviterID {
				role = "admin"
			}
			tx.Create(&models.ConversationMember{
				ConversationID: newConv.ID,
				UserID:         uid,
				Role:           role,
			})
		}
		// point the call to the new group conversation
		tx.Model(&call).Update("conversation_id", newConv.ID)
	} else {
		// group call — add target to conversation if not already a member
		isMember := false
		for _, m := range conv.Members {
			if m.UserID == targetUserID {
				isMember = true
				break
			}
		}
		if !isMember {
			tx.Create(&models.ConversationMember{
				ConversationID: conv.ID,
				UserID:         targetUserID,
				Role:           "member",
			})
		}
	}

	// add call participant if not already reset above
	if existing.ID == "" {
		tx.Create(&models.CallParticipant{
			CallID: callID,
			UserID: targetUserID,
			Status: "invited",
		})
	}

	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	return s.loadCall(callID)
}
