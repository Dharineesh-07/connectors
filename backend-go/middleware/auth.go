package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/utils"
)

const UserKey = "current_user"

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := utils.DecodeToken(tokenStr)
		if err != nil || claims.Type != "access" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "invalid or expired token"})
			return
		}

		var user models.User
		if err := database.DB.Where("id = ? AND is_active = ?", claims.Sub, true).First(&user).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "user not found or inactive"})
			return
		}
		c.Set(UserKey, &user)
		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		AuthRequired()(c)
		if c.IsAborted() {
			return
		}
		user := c.MustGet(UserKey).(*models.User)
		if user.Role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "admin access required"})
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) *models.User {
	return c.MustGet(UserKey).(*models.User)
}
