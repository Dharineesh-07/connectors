package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	ws "github.com/orgchat/backend/websocket"
)

type TasksHandler struct {
	WS *ws.Manager
}

func (h *TasksHandler) Create(c *gin.Context) {
	var req struct {
		Title          string     `json:"title" binding:"required"`
		Description    *string    `json:"description"`
		ConversationID *string    `json:"conversation_id"`
		MessageID      *string    `json:"message_id"`
		AssignedToID   *string    `json:"assigned_to"`
		DueDate        *time.Time `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)

	task := &models.Task{
		Title:          req.Title,
		Description:    req.Description,
		ConversationID: req.ConversationID,
		MessageID:      req.MessageID,
		CreatedByID:    user.ID,
		AssignedToID:   req.AssignedToID,
		DueDate:        req.DueDate,
	}
	if err := database.DB.Create(task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	database.DB.Preload("CreatedBy").Preload("AssignedTo").Preload("Conversation").First(task, "id = ?", task.ID)

	if req.AssignedToID != nil && *req.AssignedToID != user.ID {
		h.WS.SendToUser(*req.AssignedToID, "task:assigned", gin.H{
			"task_id":    task.ID,
			"title":      task.Title,
			"created_by": gin.H{"id": user.ID, "full_name": user.FullName},
		})
	}
	c.JSON(http.StatusCreated, task)
}

func (h *TasksHandler) List(c *gin.Context) {
	user := middleware.CurrentUser(c)
	status := c.Query("status")
	convID := c.Query("conversation_id")

	query := database.DB.Where("created_by = ? OR assigned_to = ?", user.ID, user.ID).
		Preload("CreatedBy").
		Preload("AssignedTo").
		Preload("Conversation").
		Preload("Message.Sender").
		Order("created_at DESC")

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if convID != "" {
		query = query.Where("conversation_id = ?", convID)
	}

	tasks := make([]models.Task, 0)
	query.Find(&tasks)
	c.JSON(http.StatusOK, tasks)
}

func (h *TasksHandler) Update(c *gin.Context) {
	taskID := c.Param("task_id")
	user := middleware.CurrentUser(c)

	var task models.Task
	if err := database.DB.First(&task, "id = ?", taskID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "task not found"})
		return
	}
	if task.CreatedByID != user.ID && (task.AssignedToID == nil || *task.AssignedToID != user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "permission denied"})
		return
	}

	var req struct {
		Title        *string    `json:"title"`
		Description  *string    `json:"description"`
		Status       *string    `json:"status"`
		AssignedToID *string    `json:"assigned_to"`
		DueDate      *time.Time `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.AssignedToID != nil {
		updates["assigned_to"] = *req.AssignedToID
	}
	if req.DueDate != nil {
		updates["due_date"] = *req.DueDate
	}

	database.DB.Model(&task).Updates(updates)
	database.DB.Preload("CreatedBy").Preload("AssignedTo").Preload("Conversation").First(&task, "id = ?", taskID)
	c.JSON(http.StatusOK, task)
}

func (h *TasksHandler) Delete(c *gin.Context) {
	taskID := c.Param("task_id")
	user := middleware.CurrentUser(c)

	var task models.Task
	if err := database.DB.First(&task, "id = ?", taskID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "task not found"})
		return
	}
	if task.CreatedByID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only creator can delete a task"})
		return
	}
	database.DB.Delete(&task)
	c.Status(http.StatusNoContent)
}
