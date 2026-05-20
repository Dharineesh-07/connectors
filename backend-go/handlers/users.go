package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/middleware"
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
	store.RDB.Set(context.Background(), fmt.Sprintf("fcm:%s", user.ID), req.Token, 0)
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
