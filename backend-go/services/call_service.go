package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
)

type CallService struct{}

// CallResponse carries the call plus the SFU room name the client should join.
// Media flows through the WebRTC SFU (see package sfu); there is no token to
// mint — the WebSocket connection is already authenticated.
type CallResponse struct {
	Call *models.Call `json:"call"`
	Room string       `json:"room,omitempty"`
}

type CallListResponse struct {
	Calls      []models.Call `json:"calls"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	Limit      int           `json:"limit"`
	TotalPages int           `json:"total_pages"`
}

// CallRoom is the SFU room name for a call. Exported so the meetings handler
// (and callers building call:incoming events) share the exact same value.
func CallRoom(callID string) string {
	return "call-" + callID
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

	var existingCall models.Call
	if database.DB.Where("conversation_id = ? AND status IN ?", convID, []string{"initiated", "ongoing"}).
		First(&existingCall).Error == nil {
		// Auto-expire stale calls.
		// "initiated" calls are resolved within 30 s by the ring timer; anything
		// older than 45 s is a leftover from a crashed/restarted server.
		// Any active call (including "ongoing") older than 4 h is also stale.
		stale := false
		if existingCall.Status == "initiated" && time.Since(existingCall.StartedAt) > 45*time.Second {
			stale = true
		} else if time.Since(existingCall.StartedAt) > 4*time.Hour {
			stale = true
		}

		if stale {
			now := time.Now()
			duration := int(now.Sub(existingCall.StartedAt).Seconds())
			database.DB.Model(&existingCall).Updates(map[string]interface{}{
				"status":           "ended",
				"ended_at":         now,
				"duration_seconds": duration,
			})
		} else {
			return nil, fmt.Errorf("active_call:%s:a call is already active in this conversation", existingCall.ID)
		}
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
			p.Status = "invited"
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
	return &CallResponse{Call: loaded, Room: CallRoom(loaded.ID)}, nil
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

	// Check if group call has waiting room enabled (non-host goes to waiting)
	if check.InitiatedBy != userID {
		var conv models.Conversation
		if database.DB.First(&conv, "id = ?", check.ConversationID).Error == nil {
			if conv.Type == "group" && conv.WaitingRoomEnabled {
				var p models.CallParticipant
				result := database.DB.Where("call_id = ? AND user_id = ?", callID, userID).First(&p)
				if result.Error != nil {
					database.DB.Create(&models.CallParticipant{CallID: callID, UserID: userID, Status: "waiting"})
				} else if p.Status != "joined" {
					database.DB.Model(&p).Update("status", "waiting")
				}
				loaded, err := s.loadCall(callID)
				if err != nil {
					return nil, err
				}
				// Empty Room signals the client it's in the waiting room (not yet admitted).
				return &CallResponse{Call: loaded, Room: ""}, nil
			}
		}
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
	return &CallResponse{Call: loaded, Room: CallRoom(callID)}, nil
}

func (s *CallService) AdmitFromWaiting(callID, userID string) (*CallResponse, error) {
	var check models.Call
	if err := database.DB.First(&check, "id = ?", callID).Error; err != nil {
		return nil, errors.New("call not found")
	}
	if check.Status == "ended" {
		return nil, errors.New("call has already ended")
	}

	now := time.Now()
	var p models.CallParticipant
	result := database.DB.Where("call_id = ? AND user_id = ?", callID, userID).First(&p)
	if result.Error != nil {
		return nil, errors.New("participant not found in waiting room")
	}
	database.DB.Model(&p).Updates(map[string]interface{}{"status": "joined", "joined_at": now, "left_at": nil})

	loaded, err := s.loadCall(callID)
	if err != nil {
		return nil, err
	}
	return &CallResponse{Call: loaded, Room: CallRoom(callID)}, nil
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
		if p.Status == "invited" || p.Status == "waiting" {
			newStatus = "missed"
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
	} else if call.InitiatedBy == userID {
		// The host left but the call continues. Promote the earliest-joined
		// remaining participant to host so host-only actions (waiting-room
		// admit/reject) keep working instead of being permanently locked out.
		var newHost models.CallParticipant
		if database.DB.Where("call_id = ? AND status = ? AND user_id != ?", callID, "joined", userID).
			Order("joined_at asc").First(&newHost).Error == nil {
			database.DB.Model(&call).Update("initiated_by", newHost.UserID)
		}
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
