package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
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
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"call_id":          resp.Call.ID,
		"turn_credentials": resp.TURNCredentials,
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
	for _, p := range resp.Call.Participants {
		if p.UserID != user.ID && p.Status == "joined" {
			h.WS.SendToUser(p.UserID, "call:participant_joined", gin.H{
				"call_id": callID,
				"user_id": user.ID,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"call_id":          resp.Call.ID,
		"turn_credentials": resp.TURNCredentials,
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
		for _, p := range call.Participants {
			h.WS.SendToUser(p.UserID, "call:ended", gin.H{
				"call_id":          callID,
				"ended_by":         user.ID,
				"duration_seconds": call.DurationSeconds,
				"timestamp":        ts,
			})
		}
	} else {
		for _, p := range call.Participants {
			if p.UserID != user.ID {
				h.WS.SendToUser(p.UserID, "call:participant_left", gin.H{
					"call_id":   callID,
					"user_id":   user.ID,
					"timestamp": ts,
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
		"call_id":         callID,
		"caller":          callerInfo,
		"type":            call.Type,
		"conversation_id": call.ConversationID,
		"is_invite":       true,
		"timestamp":       ts,
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

func callConvMemberIDs(call *models.Call) []string {
	ids := make([]string, 0, len(call.Conversation.Members))
	for _, m := range call.Conversation.Members {
		ids = append(ids, m.UserID)
	}
	return ids
}
