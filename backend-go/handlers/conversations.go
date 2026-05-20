package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
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
	convs, err := h.Service.GetUserConversations(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, convs)
}

func (h *ConversationsHandler) Create(c *gin.Context) {
	var req struct {
		Type      string   `json:"type" binding:"required"`
		UserIDs   []string `json:"user_ids"`
		Name      *string  `json:"name"`
		AvatarURL *string  `json:"avatar_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	conv, err := h.Service.CreateConversation(user.ID, req.Type, req.UserIDs, req.Name, req.AvatarURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	// notify other members
	for _, m := range conv.Members {
		if m.UserID != user.ID {
			h.WS.SendToUser(m.UserID, "conversation:created", conv)
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

func memberIDs(members []models.ConversationMember) []string {
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids
}
