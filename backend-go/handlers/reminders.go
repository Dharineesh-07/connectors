package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
)

type RemindersHandler struct{}

func (h *RemindersHandler) Create(c *gin.Context) {
	var req struct {
		Title       string  `json:"title" binding:"required"`
		Description *string `json:"description"`
		DueDate     string  `json:"due_date" binding:"required"`
		IsCompleted bool    `json:"is_completed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)

	dueDate, err := time.Parse(time.RFC3339, req.DueDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid due_date format, use RFC3339"})
		return
	}

	reminder := &models.Reminder{
		UserID:      user.ID,
		Title:       req.Title,
		Description: req.Description,
		DueDate:     dueDate,
		IsCompleted: req.IsCompleted,
	}
	if err := database.DB.Create(reminder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, reminder)
}

func (h *RemindersHandler) List(c *gin.Context) {
	user := middleware.CurrentUser(c)
	var reminders []models.Reminder
	database.DB.Where("user_id = ?", user.ID).Order("due_date ASC").Find(&reminders)
	c.JSON(http.StatusOK, reminders)
}

func (h *RemindersHandler) Update(c *gin.Context) {
	reminderID := c.Param("reminder_id")
	user := middleware.CurrentUser(c)

	var reminder models.Reminder
	if err := database.DB.Where("id = ? AND user_id = ?", reminderID, user.ID).First(&reminder).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "reminder not found"})
		return
	}

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	// if due_date changed, reset notified
	if _, ok := req["due_date"]; ok {
		req["notified"] = false
	}

	allowed := []string{"title", "description", "due_date", "is_completed", "notified"}
	filtered := make(map[string]interface{})
	for _, k := range allowed {
		if v, ok := req[k]; ok {
			filtered[k] = v
		}
	}
	database.DB.Model(&reminder).Updates(filtered)
	database.DB.First(&reminder, "id = ?", reminderID)
	c.JSON(http.StatusOK, reminder)
}

func (h *RemindersHandler) Delete(c *gin.Context) {
	reminderID := c.Param("reminder_id")
	user := middleware.CurrentUser(c)
	result := database.DB.Where("id = ? AND user_id = ?", reminderID, user.ID).Delete(&models.Reminder{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"detail": "reminder not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

