package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/store"
	"github.com/orgchat/backend/utils"
)

const UserKey = "current_user"
const userCacheTTL = 2 * time.Minute

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
	user := loadUser(claims.Sub)
	if user == nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "user not found or inactive"})
		return nil, false
	}
	return user, true
}

// loadUser fetches the active user by ID, using Redis as a read-through cache
// to avoid a DB hit on every authenticated request.
func loadUser(userID string) *models.User {
	ctx := context.Background()
	cacheKey := "auth:user:" + userID

	if store.RDB != nil {
		if data, err := store.RDB.Get(ctx, cacheKey).Bytes(); err == nil {
			var user models.User
			if json.Unmarshal(data, &user) == nil {
				return &user
			}
		}
	}

	var user models.User
	if err := database.DB.Where("id = ? AND is_active = ?", userID, true).First(&user).Error; err != nil {
		return nil
	}

	if store.RDB != nil {
		if data, err := json.Marshal(user); err == nil {
			store.RDB.Set(ctx, cacheKey, data, userCacheTTL)
		}
	}
	return &user
}

// InvalidateUserCache removes the cached user record so the next auth check
// reads fresh data (call after deactivation or role changes).
func InvalidateUserCache(userID string) {
	if store.RDB != nil {
		store.RDB.Del(context.Background(), "auth:user:"+userID)
	}
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
