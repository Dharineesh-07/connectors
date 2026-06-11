package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	ws "github.com/orgchat/backend/websocket"
)

type MeetingsHandler struct {
	CallService *services.CallService
	WS          *ws.Manager
}

func (h *MeetingsHandler) Create(c *gin.Context) {
	var req struct {
		Title          string     `json:"title" binding:"required"`
		Description    *string    `json:"description"`
		ConversationID *string    `json:"conversation_id"`
		StartTime      time.Time  `json:"start_time" binding:"required"`
		EndTime        *time.Time `json:"end_time"`
		AttendeeIDs    []string   `json:"attendee_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	user := middleware.CurrentUser(c)

	meeting := &models.ScheduledMeeting{
		Title:          req.Title,
		Description:    req.Description,
		ConversationID: req.ConversationID,
		CreatedByID:    user.ID,
		StartTime:      req.StartTime,
		EndTime:        req.EndTime,
	}
	if err := database.DB.Create(meeting).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	// Creator is always an accepted attendee
	database.DB.Create(&models.MeetingAttendee{MeetingID: meeting.ID, UserID: user.ID, Status: "accepted"})

	seen := map[string]bool{user.ID: true}
	for _, uid := range req.AttendeeIDs {
		if seen[uid] {
			continue
		}
		seen[uid] = true
		database.DB.Create(&models.MeetingAttendee{MeetingID: meeting.ID, UserID: uid, Status: "invited"})
		h.WS.SendToUser(uid, "meeting:invited", gin.H{
			"meeting_id": meeting.ID,
			"title":      meeting.Title,
			"start_time": meeting.StartTime,
			"created_by": gin.H{"id": user.ID, "full_name": user.FullName},
		})
	}

	database.DB.Preload("CreatedBy").Preload("Attendees.User").Preload("Conversation").First(meeting, "id = ?", meeting.ID)
	c.JSON(http.StatusCreated, meeting)
}

func (h *MeetingsHandler) List(c *gin.Context) {
	user := middleware.CurrentUser(c)
	var attendeeRows []models.MeetingAttendee
	database.DB.Where("user_id = ?", user.ID).Find(&attendeeRows)

	meetingIDs := make([]string, 0, len(attendeeRows))
	for _, a := range attendeeRows {
		meetingIDs = append(meetingIDs, a.MeetingID)
	}

	meetings := make([]models.ScheduledMeeting, 0)
	if len(meetingIDs) > 0 {
		database.DB.Where("id IN ?", meetingIDs).
			Preload("CreatedBy").
			Preload("Attendees.User").
			Order("start_time ASC").
			Find(&meetings)
	}
	c.JSON(http.StatusOK, meetings)
}

func (h *MeetingsHandler) Delete(c *gin.Context) {
	meetingID := c.Param("meeting_id")
	user := middleware.CurrentUser(c)

	var meeting models.ScheduledMeeting
	if err := database.DB.First(&meeting, "id = ?", meetingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "meeting not found"})
		return
	}
	if meeting.CreatedByID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"detail": "only the organizer can delete this meeting"})
		return
	}

	database.DB.Where("meeting_id = ?", meetingID).Delete(&models.MeetingAttendee{})
	database.DB.Delete(&meeting)
	c.Status(http.StatusNoContent)
}

func (h *MeetingsHandler) Join(c *gin.Context) {
	meetingID := c.Param("meeting_id")
	user := middleware.CurrentUser(c)

	var meeting models.ScheduledMeeting
	if err := database.DB.First(&meeting, "id = ?", meetingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "meeting not found"})
		return
	}
	if meeting.Status == "cancelled" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "this meeting was cancelled"})
		return
	}

	// Only allow joining if the meeting starts within 15 minutes or has already started.
	if meeting.Status == "scheduled" && time.Until(meeting.StartTime) > 15*time.Minute {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "meeting has not started yet"})
		return
	}

	var att models.MeetingAttendee
	if err := database.DB.Where("meeting_id = ? AND user_id = ?", meetingID, user.ID).First(&att).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "you were not invited to this meeting"})
		return
	}
	if err := database.DB.Model(&att).Update("status", "accepted").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to update attendee status"})
		return
	}

	if meeting.Status == "scheduled" {
		database.DB.Model(&meeting).Update("status", "ongoing")
	}

	// Guarantee a non-empty room name for meetings created before the column existed.
	room := meeting.Room
	if room == "" {
		room = "meeting-" + meeting.ID
		database.DB.Model(&meeting).Update("room", room)
		meeting.Room = room
	}

	// Media flows through the WebRTC SFU; attendees just join the room over the
	// authenticated WebSocket — no token to mint.
	c.JSON(http.StatusOK, gin.H{
		"room":    room,
		"meeting": meeting,
	})
}
