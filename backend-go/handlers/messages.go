package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/utils"
	ws "github.com/orgchat/backend/websocket"
)

type MessagesHandler struct {
	Service *services.MessageService
	WS      *ws.Manager
}

func (h *MessagesHandler) GetMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	limit := 50
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l >= 1 && l <= 100 {
		limit = l
	}
	var beforeID *string
	if b := c.Query("before_id"); b != "" {
		beforeID = &b
	}
	result, err := h.Service.GetMessages(convID, user.ID, beforeID, limit)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *MessagesHandler) SendMessage(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	var req struct {
		Type      string  `json:"type"`
		Content   *string `json:"content"`
		ReplyToID *string `json:"reply_to_id"`
		FileURL   *string `json:"file_url"`
		FileName  *string `json:"file_name"`
		FileSize  *int64  `json:"file_size"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	if req.Type == "" {
		req.Type = "text"
	}

	msg, err := h.Service.CreateMessage(convID, user.ID, req.Type, req.Content, req.FileURL, req.FileName, req.FileSize, req.ReplyToID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	// notify all conversation members
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:new", msg)
		}
	}
	c.JSON(http.StatusCreated, msg)
}

func (h *MessagesHandler) EditMessage(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	msg, err := h.Service.EditMessage(msgID, user.ID, req.Content)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	// broadcast edit to conversation
	conv, _ := h.Service.GetConversation(msg.ConversationID, user.ID)
	if conv != nil {
		payload := gin.H{
			"message_id":      msg.ID,
			"content":         msg.Content,
			"conversation_id": msg.ConversationID,
		}
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:edited", payload)
		}
	}
	c.JSON(http.StatusOK, msg)
}

func (h *MessagesHandler) DeleteMessage(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	msg, err := h.Service.DeleteMessage(msgID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(msg.ConversationID, user.ID)
	if conv != nil {
		payload := gin.H{
			"message_id":      msg.ID,
			"conversation_id": msg.ConversationID,
		}
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:deleted", payload)
		}
	}
	c.JSON(http.StatusOK, msg)
}

func (h *MessagesHandler) MarkRead(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.MarkAsRead(msgID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *MessagesHandler) MarkConversationRead(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	infos, err := h.Service.MarkConversationAsRead(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	// notify senders
	for _, info := range infos {
		h.WS.SendToUser(info.SenderID, "message:read_receipt", gin.H{
			"message_id": info.MessageID,
			"user_id":    user.ID,
			"status":     "read",
			"timestamp":  info.Timestamp,
		})
	}
	c.Status(http.StatusNoContent)
}

func (h *MessagesHandler) UploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "file is required"})
		return
	}
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	result, err := utils.ValidateAndUpload(file, mimeType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *MessagesHandler) SearchMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": "query parameter 'q' is required"})
		return
	}
	user := middleware.CurrentUser(c)
	msgs, err := h.Service.SearchMessages(convID, user.ID, q)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

func (h *MessagesHandler) GetAttachments(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	attachments, err := h.Service.GetAttachments(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, attachments)
}

