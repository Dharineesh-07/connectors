package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	ws "github.com/orgchat/backend/websocket"
)

type ConversationsHandler struct {
	Service *services.MessageService
	WS      *ws.Manager
}

func (h *ConversationsHandler) List(c *gin.Context) {
	user := middleware.CurrentUser(c)
	archived := c.Query("archived") == "true"
	convs, err := h.Service.GetUserConversations(user.ID, archived)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, convs)
}

func (h *ConversationsHandler) Archive(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.ArchiveConversation(convID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.WS.SendToUser(user.ID, "conversation:archived", gin.H{"conversation_id": convID})
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) Unarchive(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.UnarchiveConversation(convID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.WS.SendToUser(user.ID, "conversation:unarchived", gin.H{"conversation_id": convID})
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) Create(c *gin.Context) {
	var req struct {
		Type      string   `json:"type" binding:"required"`
		UserIDs   []string `json:"user_ids"`
		Name      *string  `json:"name"`
		AvatarURL *string  `json:"avatar_url"`
		IsPrivate bool     `json:"is_private"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	conv, err := h.Service.CreateConversation(user.ID, req.Type, req.UserIDs, req.Name, req.AvatarURL, req.IsPrivate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	// For public groups broadcast to every connected user; for DMs/private groups
	// only notify the specific members.
	if conv.Type == "group" && !conv.IsPrivate {
		h.WS.Broadcast("conversation:created", conv)
	} else {
		for _, m := range conv.Members {
			if m.UserID != user.ID {
				h.WS.SendToUser(m.UserID, "conversation:created", conv)
			}
		}
	}
	c.JSON(http.StatusCreated, conv)
}

func (h *ConversationsHandler) Get(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	conv, err := h.Service.GetConversation(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conv)
}

func (h *ConversationsHandler) Update(c *gin.Context) {
	convID := c.Param("conversation_id")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	conv, err := h.Service.UpdateConversation(convID, user.ID, req)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	h.WS.SendToUsers(memberIDs(conv.Members), "conversation:updated", gin.H{
		"conversation_id": convID,
		"name":            conv.Name,
		"avatar_url":      conv.AvatarURL,
	})
	c.JSON(http.StatusOK, conv)
}

func (h *ConversationsHandler) AddMembers(c *gin.Context) {
	convID := c.Param("conversation_id")
	var req struct {
		UserIDs []string `json:"user_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	if err := h.Service.AddMembers(convID, user.ID, req.UserIDs); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		payload := gin.H{
			"conversation_id": convID,
			"added_by":        user.ID,
			"user_ids":        req.UserIDs,
		}
		h.WS.SendToUsers(memberIDs(conv.Members), "conversation:members_added", payload)
	}
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) Join(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.JoinConversation(convID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		h.WS.SendToUsers(memberIDs(conv.Members), "conversation:member_joined", gin.H{
			"conversation_id": convID,
			"user_id":         user.ID,
		})
	}
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) RemoveMember(c *gin.Context) {
	convID := c.Param("conversation_id")
	targetUserID := c.Param("user_id")
	user := middleware.CurrentUser(c)

	conv, _ := h.Service.GetConversation(convID, user.ID)
	var remainingIDs []string
	if conv != nil {
		for _, m := range conv.Members {
			if m.UserID != targetUserID {
				remainingIDs = append(remainingIDs, m.UserID)
			}
		}
	}

	if err := h.Service.RemoveMember(convID, user.ID, targetUserID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}

	payload := gin.H{"conversation_id": convID, "user_id": targetUserID}
	h.WS.SendToUsers(remainingIDs, "conversation:member_removed", payload)
	h.WS.SendToUser(targetUserID, "conversation:member_removed", payload)
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) ClearMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.ClearConversation(convID, user.ID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	h.WS.SendToUser(user.ID, "conversation:cleared", gin.H{"conversation_id": convID})
	c.Status(http.StatusNoContent)
}

func (h *ConversationsHandler) Delete(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.RemoveMember(convID, user.ID, user.ID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	h.WS.SendToUser(user.ID, "conversation:deleted", gin.H{"conversation_id": convID})
	c.Status(http.StatusNoContent)
}

// ToggleE2EE PATCH /api/conversations/:conversation_id/e2ee
// Enabling E2EE requires both DM members to call this endpoint (mutual consent).
// The first caller puts the conversation into a "pending" state; the second
// activates it. Disabling is always immediate (either party can turn it off).
func (h *ConversationsHandler) ToggleE2EE(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	var conv models.Conversation
	if err := database.DB.Preload("Members").First(&conv, "id = ?", convID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "conversation not found"})
		return
	}
	if conv.Type != "direct" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "E2EE is only available for direct messages"})
		return
	}

	isMember := false
	for _, m := range conv.Members {
		if m.UserID == user.ID {
			isMember = true
			break
		}
	}
	if !isMember {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	if !req.Enabled {
		// Either party can disable immediately.
		database.DB.Model(&conv).Updates(map[string]interface{}{
			"e2ee_enabled":         false,
			"e2ee_requested_by_id": nil,
		})
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "conversation:e2ee_changed", gin.H{
				"conversation_id": convID,
				"e2ee_enabled":    false,
			})
		}
		c.JSON(http.StatusOK, gin.H{"e2ee_enabled": false})
		return
	}

	// Enabling path — mutual consent required.
	if conv.E2EERequestedByID != nil && *conv.E2EERequestedByID != user.ID {
		// The other party already requested — both have agreed; activate.
		database.DB.Model(&conv).Updates(map[string]interface{}{
			"e2ee_enabled":         true,
			"e2ee_requested_by_id": nil,
		})
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "conversation:e2ee_changed", gin.H{
				"conversation_id": convID,
				"e2ee_enabled":    true,
			})
		}
		c.JSON(http.StatusOK, gin.H{"e2ee_enabled": true})
		return
	}

	if conv.E2EERequestedByID != nil && *conv.E2EERequestedByID == user.ID {
		// Same user called again — already pending, nothing to do.
		c.JSON(http.StatusOK, gin.H{"e2ee_enabled": false, "pending": true})
		return
	}

	// First request — mark as pending and notify the other party.
	database.DB.Model(&conv).Update("e2ee_requested_by_id", user.ID)
	for _, m := range conv.Members {
		if m.UserID != user.ID {
			h.WS.SendToUser(m.UserID, "conversation:e2ee_requested", gin.H{
				"conversation_id": convID,
				"requested_by":    user.ID,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"e2ee_enabled": false, "pending": true})
}

func memberIDs(members []models.ConversationMember) []string {
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids
}
