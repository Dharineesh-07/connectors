package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	ws "github.com/orgchat/backend/websocket"
)

type PollsHandler struct {
	WS *ws.Manager
}

// CreatePoll POST /api/conversations/:conversation_id/polls
func (h *PollsHandler) CreatePoll(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	var req struct {
		Question   string   `json:"question" binding:"required"`
		Options    []string `json:"options" binding:"required"`
		IsMultiple bool     `json:"is_multiple"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	if len(req.Options) < 2 || len(req.Options) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "polls require 2–10 options"})
		return
	}

	var member models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", convID, user.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	// Create the message + poll atomically so neither is orphaned on failure.
	msgContent := "📊 " + req.Question
	msg := models.Message{
		ConversationID: convID,
		SenderID:       user.ID,
		Type:           "poll",
		Content:        &msgContent,
	}

	tx := database.DB.Begin()
	if err := tx.Create(&msg).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	poll := models.Poll{
		ConversationID: convID,
		MessageID:      msg.ID,
		CreatedByID:    user.ID,
		Question:       req.Question,
		IsMultiple:     req.IsMultiple,
	}
	if err := tx.Create(&poll).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	for i, opt := range req.Options {
		o := models.PollOption{PollID: poll.ID, Text: opt, SortOrder: i}
		if err := tx.Create(&o).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		poll.Options = append(poll.Options, o)
	}

	// Link poll back to message
	if err := tx.Model(&msg).Update("poll_id", poll.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	database.DB.Preload("Sender").First(&msg, "id = ?", msg.ID)
	msg.Poll = &poll

	var members []models.ConversationMember
	if err := database.DB.Where("conversation_id = ?", convID).Find(&members).Error; err != nil {
		log.Printf("polls: failed to fetch members for conv %s: %v", convID, err)
	}
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "message:new", msg)
	}

	c.JSON(http.StatusCreated, msg)
}

// GetPoll GET /api/polls/:poll_id
func (h *PollsHandler) GetPoll(c *gin.Context) {
	pollID := c.Param("poll_id")
	user := middleware.CurrentUser(c)

	var poll models.Poll
	if err := database.DB.Preload("Options.Votes.User").Preload("CreatedBy").First(&poll, "id = ?", pollID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "poll not found"})
		return
	}

	var member models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", poll.ConversationID, user.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	c.JSON(http.StatusOK, poll)
}

// Vote POST /api/polls/:poll_id/vote
func (h *PollsHandler) Vote(c *gin.Context) {
	pollID := c.Param("poll_id")
	user := middleware.CurrentUser(c)

	var req struct {
		OptionIDs []string `json:"option_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	var poll models.Poll
	if err := database.DB.Preload("Options").First(&poll, "id = ?", pollID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "poll not found"})
		return
	}
	if poll.IsClosed {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "poll is closed"})
		return
	}

	var member models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", poll.ConversationID, user.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	if !poll.IsMultiple && len(req.OptionIDs) != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "single-choice poll requires exactly 1 option"})
		return
	}

	valid := map[string]bool{}
	for _, o := range poll.Options {
		valid[o.ID] = true
	}
	for _, oid := range req.OptionIDs {
		if !valid[oid] {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid option id: " + oid})
			return
		}
	}

	// Replace existing votes atomically — delete then insert in one transaction
	// so the user cannot lose all votes if the insert fails.
	voteTx := database.DB.Begin()
	if err := voteTx.Where("poll_id = ? AND user_id = ?", pollID, user.ID).Delete(&models.PollVote{}).Error; err != nil {
		voteTx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to update vote"})
		return
	}
	for _, oid := range req.OptionIDs {
		if err := voteTx.Create(&models.PollVote{PollID: pollID, OptionID: oid, UserID: user.ID}).Error; err != nil {
			voteTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to record vote"})
			return
		}
	}
	if err := voteTx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to commit vote"})
		return
	}

	// Reload with full vote data and broadcast
	database.DB.Preload("Options.Votes.User").Preload("CreatedBy").First(&poll, "id = ?", pollID)

	var members []models.ConversationMember
	if err := database.DB.Where("conversation_id = ?", poll.ConversationID).Find(&members).Error; err != nil {
		log.Printf("polls: failed to fetch members for conv %s: %v", poll.ConversationID, err)
	}
	payload := gin.H{
		"poll_id":         pollID,
		"conversation_id": poll.ConversationID,
		"message_id":      poll.MessageID,
		"poll":            poll,
	}
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "poll:voted", payload)
	}

	c.JSON(http.StatusOK, poll)
}

// ClosePoll PATCH /api/polls/:poll_id/close
func (h *PollsHandler) ClosePoll(c *gin.Context) {
	pollID := c.Param("poll_id")
	user := middleware.CurrentUser(c)

	var poll models.Poll
	if err := database.DB.First(&poll, "id = ?", pollID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "poll not found"})
		return
	}
	if poll.CreatedByID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only the creator can close this poll"})
		return
	}

	if err := database.DB.Model(&poll).Update("is_closed", true).Error; err != nil {
		log.Printf("polls: failed to close poll %s: %v", pollID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to close poll"})
		return
	}

	var members []models.ConversationMember
	if err := database.DB.Where("conversation_id = ?", poll.ConversationID).Find(&members).Error; err != nil {
		log.Printf("polls: failed to fetch members for conv %s: %v", poll.ConversationID, err)
	}
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "poll:closed", gin.H{
			"poll_id":         pollID,
			"conversation_id": poll.ConversationID,
			"message_id":      poll.MessageID,
		})
	}

	c.JSON(http.StatusOK, gin.H{"poll_id": pollID, "is_closed": true})
}
