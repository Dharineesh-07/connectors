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

type AnnouncementsHandler struct {
	WS *ws.Manager
}

func (h *AnnouncementsHandler) List(c *gin.Context) {
	var announcements []models.Announcement
	if err := database.DB.Preload("Author").Order("is_pinned DESC, created_at DESC").Limit(100).Find(&announcements).Error; err != nil {
		log.Printf("announcements: failed to list: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to fetch announcements"})
		return
	}
	c.JSON(http.StatusOK, announcements)
}

func (h *AnnouncementsHandler) TogglePin(c *gin.Context) {
	annID := c.Param("announcement_id")

	var ann models.Announcement
	if err := database.DB.First(&ann, "id = ?", annID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "announcement not found"})
		return
	}

	if err := database.DB.Model(&ann).Update("is_pinned", !ann.IsPinned).Error; err != nil {
		log.Printf("announcements: failed to toggle pin %s: %v", annID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to update announcement"})
		return
	}
	database.DB.Preload("Author").First(&ann, "id = ?", annID)

	h.WS.Broadcast("announcement:updated", ann)
	c.JSON(http.StatusOK, ann)
}

func (h *AnnouncementsHandler) Create(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)

	ann := &models.Announcement{
		AuthorID: user.ID,
		Content:  req.Content,
	}
	if err := database.DB.Create(ann).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	database.DB.Preload("Author").First(ann, "id = ?", ann.ID)

	h.WS.Broadcast("announcement:new", ann)
	c.JSON(http.StatusCreated, ann)
}

func (h *AnnouncementsHandler) Delete(c *gin.Context) {
	annID := c.Param("announcement_id")
	user := middleware.CurrentUser(c)

	var ann models.Announcement
	if err := database.DB.First(&ann, "id = ?", annID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "announcement not found"})
		return
	}

	if ann.AuthorID != user.ID && user.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not allowed"})
		return
	}

	if err := database.DB.Delete(&ann).Error; err != nil {
		log.Printf("announcements: failed to delete %s: %v", annID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to delete announcement"})
		return
	}
	h.WS.Broadcast("announcement:deleted", gin.H{"id": annID})
	c.Status(http.StatusNoContent)
}
