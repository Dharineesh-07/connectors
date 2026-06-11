package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/services"
	ws "github.com/orgchat/backend/websocket"
)

type AdminHandler struct {
	UserService         *services.UserService
	NotifService        *services.NotificationService
	CallService         *services.CallService
	WS                  *ws.Manager
}

func (h *AdminHandler) CreateUser(c *gin.Context) {
	var req struct {
		Email      string  `json:"email" binding:"required"`
		FullName   string  `json:"full_name" binding:"required"`
		Department *string `json:"department"`
		Role       *string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	admin := middleware.CurrentUser(c)
	user, err := h.UserService.CreateUser(admin.ID, req.Email, req.FullName, req.Department, req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func clampPage(raw, defaultLimit int) (page, limit int) {
	page = raw
	limit = defaultLimit
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	return
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	pageRaw, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limitRaw, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	page, limit := clampPage(pageRaw, limitRaw)
	search := c.Query("search")
	department := c.Query("department")
	role := c.Query("role")

	var isActive *bool
	if v := c.Query("is_active"); v != "" {
		b := v == "true"
		isActive = &b
	}

	result, err := h.UserService.ListUsers(page, limit, search, department, isActive, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("user_id")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	admin := middleware.CurrentUser(c)
	updated, err := h.UserService.UpdateUser(admin.ID, userID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *AdminHandler) DeactivateUser(c *gin.Context) {
	userID := c.Param("user_id")
	admin := middleware.CurrentUser(c)
	if err := h.UserService.DeactivateUser(admin.ID, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user deactivated"})
}

func (h *AdminHandler) ResetUserPassword(c *gin.Context) {
	userID := c.Param("user_id")
	var req struct {
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	admin := middleware.CurrentUser(c)
	if err := h.UserService.ResetUserPassword(admin.ID, userID, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AdminHandler) GetAuditLogs(c *gin.Context) {
	pageRaw, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limitRaw, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	page, limit := clampPage(pageRaw, limitRaw)
	adminID := c.Query("admin_id")
	action := c.Query("action")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	result, err := h.UserService.ListAuditLogs(page, limit, adminID, action, dateFrom, dateTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) GetStats(c *gin.Context) {
	stats, err := h.UserService.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) Broadcast(c *gin.Context) {
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	admin := middleware.CurrentUser(c)

	const batchSize = 500
	sent := 0
	for offset := 0; ; offset += batchSize {
		users, err := h.UserService.DirectoryUsersPage("", batchSize, offset)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to fetch recipients"})
			return
		}
		for _, u := range users {
			if _, err := h.NotifService.CreateAndPush(u.ID, "broadcast", "Announcement", req.Content, nil); err == nil {
				sent++
			}
		}
		if len(users) < batchSize {
			break
		}
	}
	h.UserService.LogAdminAction(nil, admin.ID, "broadcast", nil, map[string]interface{}{
		"content":         req.Content,
		"recipient_count": sent,
	})
	h.WS.Broadcast("notification:broadcast", gin.H{"content": req.Content, "from": admin.FullName})
	c.JSON(http.StatusOK, gin.H{"recipient_count": sent})
}

func (h *AdminHandler) GetCallHistory(c *gin.Context) {
	pageRaw, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limitRaw, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	page, limit := clampPage(pageRaw, limitRaw)
	result, err := h.CallService.AdminGetCallHistory(page, limit,
		c.Query("type"), c.Query("status"), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
