package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
)

type GoogleCalendarHandler struct {
	Service *services.GoogleCalendarService
}

// Authorize returns the Google OAuth2 URL for the current user.
func (h *GoogleCalendarHandler) Authorize(c *gin.Context) {
	user := middleware.CurrentUser(c)
	if config.App.GoogleClientID == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Google Calendar integration not configured"})
		return
	}
	authURL := h.Service.GetAuthURL(user.ID)
	c.JSON(http.StatusOK, gin.H{"auth_url": authURL})
}

// Callback handles the redirect from Google after user authorization.
// This is a browser redirect — no JWT, userID comes from the state param.
func (h *GoogleCalendarHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	frontendBase := config.App.FrontendURL + "/calendar"

	if code == "" || state == "" {
		c.Redirect(http.StatusFound, frontendBase+"?google_error=invalid")
		return
	}

	userID, err := h.Service.DecodeState(state)
	if err != nil || userID == "" {
		c.Redirect(http.StatusFound, frontendBase+"?google_error=invalid_state")
		return
	}

	token, err := h.Service.ExchangeCode(c.Request.Context(), code)
	if err != nil {
		c.Redirect(http.StatusFound, frontendBase+"?google_error=exchange_failed")
		return
	}

	updates := map[string]interface{}{
		"google_access_token": token.AccessToken,
		"google_token_expiry": token.Expiry,
	}
	if token.RefreshToken != "" {
		updates["google_refresh_token"] = token.RefreshToken
	}

	database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates)

	c.Redirect(http.StatusFound, frontendBase+"?google_connected=true")
}

// Status reports whether the current user has connected Google Calendar.
func (h *GoogleCalendarHandler) Status(c *gin.Context) {
	user := middleware.CurrentUser(c)
	var u models.User
	database.DB.Select("google_refresh_token").Where("id = ?", user.ID).First(&u)
	connected := u.GoogleRefreshToken != nil && *u.GoogleRefreshToken != ""
	c.JSON(http.StatusOK, gin.H{"connected": connected})
}

// Events fetches the user's Google Calendar events for a given time range.
func (h *GoogleCalendarHandler) Events(c *gin.Context) {
	user := middleware.CurrentUser(c)
	var u models.User
	database.DB.Where("id = ?", user.ID).First(&u)

	if u.GoogleRefreshToken == nil || *u.GoogleRefreshToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Google Calendar not connected"})
		return
	}

	var start, end time.Time
	if s := c.Query("start"); s != "" {
		start, _ = time.Parse(time.RFC3339, s)
	} else {
		start = time.Now().AddDate(0, -1, 0)
	}
	if e := c.Query("end"); e != "" {
		end, _ = time.Parse(time.RFC3339, e)
	} else {
		end = time.Now().AddDate(0, 2, 0)
	}

	accessToken := ""
	if u.GoogleAccessToken != nil {
		accessToken = *u.GoogleAccessToken
	}
	var expiry time.Time
	if u.GoogleTokenExpiry != nil {
		expiry = *u.GoogleTokenExpiry
	}

	events, err := h.Service.FetchEvents(
		c.Request.Context(),
		accessToken,
		*u.GoogleRefreshToken,
		expiry,
		start,
		end,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to fetch Google Calendar events"})
		return
	}

	c.JSON(http.StatusOK, events)
}

// Disconnect clears the stored Google tokens for the current user.
func (h *GoogleCalendarHandler) Disconnect(c *gin.Context) {
	user := middleware.CurrentUser(c)
	database.DB.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
		"google_access_token":  nil,
		"google_refresh_token": nil,
		"google_token_expiry":  nil,
	})
	c.JSON(http.StatusOK, gin.H{"message": "Disconnected from Google Calendar"})
}
