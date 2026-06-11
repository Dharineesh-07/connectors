package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/services"
)

type AuthHandler struct {
	Service *services.AuthService
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	resp, err := h.Service.Login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	resp, err := h.Service.RefreshTokens(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if err := h.Service.Logout(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to invalidate session"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)
	if err := h.Service.ChangePassword(user.ID, req.CurrentPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) Me(c *gin.Context) {
	c.JSON(http.StatusOK, middleware.CurrentUser(c))
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	h.Service.RequestPasswordReset(req.Email)
	c.Status(http.StatusNoContent)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Email       string `json:"email" binding:"required"`
		OTP         string `json:"otp" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	if err := h.Service.ResetPassword(req.Email, req.OTP, req.NewPassword); err != nil {
		if errors.Is(err, services.ErrTokenRevocationFailed) {
			// Password was changed; only session invalidation failed (Redis unavailable).
			c.JSON(http.StatusOK, gin.H{"warning": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
