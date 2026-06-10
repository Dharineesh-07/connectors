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

// authenticate extracts and validates the Bearer token, loads the user, and
// sets it on the context. Returns false (with an abort response) on failure.
func authenticate(c *gin.Context) (*models.User, bool) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "missing token"})
		return nil, false
	}
	tokenStr := strings.TrimPrefix(header, "Bearer ")
	claims, err := utils.DecodeToken(tokenStr)
	if err != nil || claims.Type != "access" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "invalid or expired token"})
		return nil, false
	}
	var user models.User
	if err := database.DB.Where("id = ? AND is_active = ?", claims.Sub, true).First(&user).Error; err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "user not found or inactive"})
		return nil, false
	}
	return &user, true
}

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := authenticate(c)
		if !ok {
			return
		}
		c.Set(UserKey, user)
		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := authenticate(c)
		if !ok {
			return
		}
		if user.Role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "admin access required"})
			return
		}
		c.Set(UserKey, user)
		c.Next()
	}
}

func CurrentUser(c *gin.Context) *models.User {
	return c.MustGet(UserKey).(*models.User)
}
