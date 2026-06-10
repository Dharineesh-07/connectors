package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/store"
)

type UsersHandler struct {
	Service *services.UserService
}

func (h *UsersHandler) ListDirectory(c *gin.Context) {
	search := c.Query("search")
	limit := 100
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "100")); err == nil {
		if l >= 1 && l <= 100 {
			limit = l
		}
	}
	users, err := h.Service.DirectoryUsers(search, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

func (h *UsersHandler) StoreFCMToken(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	// FCM tokens live only in Redis; degrade gracefully if it's unavailable
	// rather than panicking on a nil client.
	if store.RDB != nil {
		store.RDB.Set(context.Background(), fmt.Sprintf("fcm:%s", user.ID), req.Token, 0)
	}
	c.Status(http.StatusNoContent)
}

func (h *UsersHandler) UpdateMe(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	updated, err := h.Service.UpdateSelf(user.ID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// SetPublicKey PUT /api/users/me/public-key
func (h *UsersHandler) SetPublicKey(c *gin.Context) {
	var req struct {
		PublicKey string `json:"public_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	if err := database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("public_key", req.PublicKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

// GetPublicKey GET /api/users/:user_id/public-key
func (h *UsersHandler) GetPublicKey(c *gin.Context) {
	targetID := c.Param("user_id")
	var u models.User
	if err := database.DB.Select("id, public_key").First(&u, "id = ?", targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "user not found"})
		return
	}
	if u.PublicKey == nil || *u.PublicKey == "" {
		c.JSON(http.StatusNotFound, gin.H{"detail": "user has no public key registered"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"public_key": *u.PublicKey})
}
