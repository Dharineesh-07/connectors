package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	ws "github.com/orgchat/backend/websocket"
)

type CallsHandler struct {
	Service *services.CallService
	WS      *ws.Manager
}

func (h *CallsHandler) InitiateCall(c *gin.Context) {
	var req struct {
		ConversationID string `json:"conversation_id" binding:"required"`
		Type           string `json:"type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	resp, err := h.Service.InitiateCall(req.ConversationID, user.ID, req.Type)
	if err != nil {
		msg := err.Error()
		// Structured "active_call:<id>:<message>" error — surface the existing call ID.
		if strings.HasPrefix(msg, "active_call:") {
			parts := strings.SplitN(msg, ":", 3)
			if len(parts) == 3 {
				c.JSON(http.StatusConflict, gin.H{"detail": parts[2], "active_call_id": parts[1]})
				return
			}
		}
		c.JSON(http.StatusBadRequest, gin.H{"detail": msg})
		return
	}

	callID := resp.Call.ID
	convType := resp.Call.Conversation.Type

	// Mark caller as busy so presence reflects the call.
	database.DB.Model(user).Update("status", "busy")
	h.WS.BroadcastPresenceChange(user.ID, true, "busy")

	// Notify every other conversation member — done here (not via the WS
	// call:initiate event) so the notification is always delivered even when
	// the caller's WebSocket is mid-reconnect.
	ts := time.Now().UTC().Format(time.RFC3339)
	callerInfo := gin.H{
		"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL,
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", req.ConversationID, user.ID).Find(&members)
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "call:incoming", gin.H{
			"call_id":           callID,
			"caller":            callerInfo,
			"type":              resp.Call.Type,
			"room":              services.CallRoom(callID),
			"conversation_id":   req.ConversationID,
			"conversation_type": resp.Call.Conversation.Type,
			"timestamp":         ts,
		})
	}

	// 30-second no-answer timeout.
	initiatorID := user.ID
	timer := time.AfterFunc(30*time.Second, func() {
		var call models.Call
		if database.DB.First(&call, "id = ?", callID).Error != nil {
			return
		}
		if call.Status != "initiated" {
			return
		}
		now := time.Now()
		nowStr := now.UTC().Format(time.RFC3339)

		if convType == "group" {
			// Group call: the initiator is already joined, so keep the call alive.
			// Transition to "ongoing" so others can still join.
			database.DB.Model(&call).Update("status", "ongoing")

			// Send a missed-ring event to every member who hasn't joined yet so
			// they see a popup with a "Join Now" option.
			for _, m := range members {
				h.WS.SendToUser(m.UserID, "call:missed_ring", gin.H{
					"call_id":           callID,
					"caller":            callerInfo,
					"type":              call.Type,
					"room":              services.CallRoom(callID),
					"conversation_id":   req.ConversationID,
					"conversation_type": convType,
					"is_ongoing":        true,
					"timestamp":         nowStr,
				})
			}
			// Let the initiator know nobody answered yet (they stay in the call).
			h.WS.SendToUser(initiatorID, "call:timeout", gin.H{
				"call_id":    callID,
				"message":    "No one answered yet",
				"is_ongoing": true,
				"timestamp":  nowStr,
			})
		} else {
			// Direct call: mark as missed and end.
			database.DB.Model(&call).Updates(map[string]interface{}{
				"status": "missed", "ended_at": now,
			})
			database.DB.Model(&models.User{}).Where("id = ?", initiatorID).Update("status", "online")
			h.WS.BroadcastPresenceChange(initiatorID, true, "online")
			database.DB.Model(&models.CallParticipant{}).
				Where("call_id = ? AND status IN ?", callID, []string{"invited", "missed"}).
				Update("status", "missed")

			h.WS.SendToUser(initiatorID, "call:timeout", gin.H{
				"call_id": callID, "message": "No answer", "is_ongoing": false, "timestamp": nowStr,
			})
			for _, m := range members {
				h.WS.SendToUser(m.UserID, "call:timeout", gin.H{
					"call_id": callID, "is_ongoing": false, "timestamp": nowStr,
				})
			}
		}
	})
	h.WS.SetCallTimer(callID, timer)

	c.JSON(http.StatusCreated, gin.H{
		"call_id":           callID,
		"room":              resp.Room,
		"conversation_type": resp.Call.Conversation.Type,
	})
}

func (h *CallsHandler) JoinCall(c *gin.Context) {
	callID := c.Param("call_id")
	user := middleware.CurrentUser(c)
	resp, err := h.Service.JoinCall(callID, user.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	// Cancel the unanswered-call timeout — the participant has joined; media is
	// now negotiated peer↔SFU over the WebSocket.
	h.WS.CancelCallTimer(callID)

	// Mark joiner as busy.
	database.DB.Model(user).Update("status", "busy")
	h.WS.BroadcastPresenceChange(user.ID, true, "busy")

	// Notify other joined participants so their UI transitions to active.
	ts := time.Now().UTC().Format(time.RFC3339)
	joinerInfo := gin.H{"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL}
	for _, p := range resp.Call.Participants {
		if p.UserID != user.ID && p.Status == "joined" {
			h.WS.SendToUser(p.UserID, "call:participant_joined", gin.H{
				"call_id":   callID,
				"user_id":   user.ID,
				"user":      joinerInfo,
				"timestamp": ts,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"call_id":           resp.Call.ID,
		"room":              resp.Room,
		"conversation_type": resp.Call.Conversation.Type,
	})
}

func (h *CallsHandler) LeaveCall(c *gin.Context) {
	callID := c.Param("call_id")
	user := middleware.CurrentUser(c)

	call, err := h.Service.LeaveCall(callID, user.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	if call.Status == "ended" {
		// Stop the pending no-answer ring timer so it neither fires nor leaks.
		h.WS.CancelCallTimer(callID)
		for _, p := range call.Participants {
			database.DB.Model(&models.User{}).Where("id = ?", p.UserID).Update("status", "online")
			h.WS.BroadcastPresenceChange(p.UserID, true, "online")
			h.WS.SendToUser(p.UserID, "call:ended", gin.H{
				"call_id":          callID,
				"ended_by":         user.ID,
				"duration_seconds": call.DurationSeconds,
				"timestamp":        ts,
			})
		}
	} else {
		database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("status", "online")
		h.WS.BroadcastPresenceChange(user.ID, true, "online")
		leaverInfo := gin.H{"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL}
		for _, p := range call.Participants {
			if p.UserID != user.ID {
				h.WS.SendToUser(p.UserID, "call:participant_left", gin.H{
					"call_id":   callID,
					"user_id":   user.ID,
					"user":      leaverInfo,
					"timestamp": ts,
				})
				// call.InitiatedBy reflects any host reassignment done in the
				// service — push it so the new host's UI gains host controls.
				h.WS.SendToUser(p.UserID, "call:updated", gin.H{
					"call_id":         callID,
					"conversation_id": call.ConversationID,
					"initiated_by":    call.InitiatedBy,
					"timestamp":       ts,
				})
			}
		}
	}
	c.Status(http.StatusNoContent)
}

func (h *CallsHandler) GetHistory(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	user := middleware.CurrentUser(c)
	result, err := h.Service.GetCallHistory(user.ID, page, limit,
		c.Query("type"), c.Query("status"), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *CallsHandler) InviteToCall(c *gin.Context) {
	callID := c.Param("call_id")
	var req struct {
		UserID string `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)

	call, err := h.Service.InviteToCall(callID, user.ID, req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	callerInfo := gin.H{
		"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL,
	}

	// broadcast updated conversation + call to all members (covers both upgrade and normal invite)
	memberIDs := callConvMemberIDs(call)
	h.WS.SendToUsers(memberIDs, "conversation:new", call.Conversation)
	h.WS.SendToUsers(memberIDs, "call:updated", gin.H{
		"call_id":         callID,
		"conversation_id": call.ConversationID,
		"timestamp":       ts,
	})

	// notify invited user
	h.WS.SendToUser(req.UserID, "call:incoming", gin.H{
		"call_id":           callID,
		"caller":            callerInfo,
		"type":              call.Type,
		"conversation_id":   call.ConversationID,
		"conversation_type": call.Conversation.Type,
		"room":              services.CallRoom(callID),
		"is_invite":         true,
		"timestamp":         ts,
	})

	// notify existing participants
	for _, p := range call.Participants {
		if p.UserID != req.UserID {
			h.WS.SendToUser(p.UserID, "call:participant_invited", gin.H{
				"call_id":   callID,
				"user_id":   req.UserID,
				"timestamp": ts,
			})
		}
	}
	c.JSON(http.StatusOK, call)
}

func (h *CallsHandler) GetWaitingRoom(c *gin.Context) {
	callID := c.Param("call_id")
	user := middleware.CurrentUser(c)

	var call models.Call
	if err := database.DB.First(&call, "id = ?", callID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "call not found"})
		return
	}
	if call.InitiatedBy != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only the host can view the waiting room"})
		return
	}

	var waiting []models.CallParticipant
	database.DB.Where("call_id = ? AND status = ?", callID, "waiting").
		Preload("User").
		Find(&waiting)
	c.JSON(http.StatusOK, waiting)
}

func (h *CallsHandler) AdmitParticipant(c *gin.Context) {
	callID := c.Param("call_id")
	userID := c.Param("user_id")
	host := middleware.CurrentUser(c)

	var call models.Call
	if err := database.DB.First(&call, "id = ?", callID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "call not found"})
		return
	}
	if call.InitiatedBy != host.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only the host can admit participants"})
		return
	}

	resp, err := h.Service.AdmitFromWaiting(callID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	// Mark admitted user as busy now that they've actually joined the call.
	var admittedUser models.User
	if database.DB.First(&admittedUser, "id = ?", userID).Error == nil {
		database.DB.Model(&admittedUser).Update("status", "busy")
		h.WS.BroadcastPresenceChange(userID, true, "busy")
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	hostInfo := gin.H{"id": host.ID, "full_name": host.FullName, "avatar_url": host.AvatarURL}
	h.WS.SendToUser(userID, "call:admitted", gin.H{
		"call_id":   callID,
		"room":      resp.Room,
		"host":      hostInfo,
		"timestamp": ts,
	})

	// Notify existing joined participants
	for _, p := range resp.Call.Participants {
		if p.UserID != userID && p.Status == "joined" {
			h.WS.SendToUser(p.UserID, "call:participant_joined", gin.H{
				"call_id":   callID,
				"user_id":   userID,
				"timestamp": ts,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"admitted": true})
}

func (h *CallsHandler) RejectWaiting(c *gin.Context) {
	callID := c.Param("call_id")
	userID := c.Param("user_id")
	host := middleware.CurrentUser(c)

	var call models.Call
	if err := database.DB.First(&call, "id = ?", callID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "call not found"})
		return
	}
	if call.InitiatedBy != host.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only the host can reject participants"})
		return
	}

	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND user_id = ? AND status = ?", callID, userID, "waiting").
		Update("status", "rejected")

	h.WS.SendToUser(userID, "call:rejected_from_waiting", gin.H{
		"call_id":   callID,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	c.Status(http.StatusNoContent)
}

// ICEServers returns the STUN/TURN servers (with freshly-minted, time-limited
// TURN credentials) the browser should use to reach the SFU.
func (h *CallsHandler) ICEServers(c *gin.Context) {
	user := middleware.CurrentUser(c)
	c.JSON(http.StatusOK, gin.H{"ice_servers": config.App.ICEServers(user.ID)})
}

func callConvMemberIDs(call *models.Call) []string {
	ids := make([]string, 0, len(call.Conversation.Members))
	for _, m := range call.Conversation.Members {
		ids = append(ids, m.UserID)
	}
	return ids
}
