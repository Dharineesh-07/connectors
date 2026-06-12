package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/handlers"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/utils"
	"github.com/orgchat/backend/sfu"
	"github.com/orgchat/backend/store"
	ws "github.com/orgchat/backend/websocket"
)

func main() {
	config.Load()
	database.Connect()
	store.Connect()

	services.SetAuthDomain(config.App.CompanyEmailDomain)

	wsManager := ws.NewManager()

	// WebRTC SFU — forwards call/meeting media between participants.
	sfuInstance, err := sfu.New()
	if err != nil {
		log.Fatalf("failed to start SFU: %v", err)
	}

	// services
	authSvc := &services.AuthService{}
	userSvc := &services.UserService{}
	msgSvc := &services.MessageService{WS: wsManager}
	callSvc := &services.CallService{}
	notifSvc := &services.NotificationService{WS: wsManager}

	// handlers
	authH := &handlers.AuthHandler{Service: authSvc}
	usersH := &handlers.UsersHandler{Service: userSvc}
	adminH := &handlers.AdminHandler{
		UserService:  userSvc,
		NotifService: notifSvc,
		CallService:  callSvc,
		WS:           wsManager,
	}
	convsH := &handlers.ConversationsHandler{Service: msgSvc, WS: wsManager}
	msgsH := &handlers.MessagesHandler{Service: msgSvc, WS: wsManager}
	callsH := &handlers.CallsHandler{Service: callSvc, WS: wsManager}
	remindersH := &handlers.RemindersHandler{}
	announcementsH := &handlers.AnnouncementsHandler{WS: wsManager}
	meetingsH := &handlers.MeetingsHandler{CallService: callSvc, WS: wsManager}
	gcalSvc := &services.GoogleCalendarService{}
	gcalH := &handlers.GoogleCalendarHandler{Service: gcalSvc}
	tasksH := &handlers.TasksHandler{WS: wsManager}
	whiteboardH := &handlers.WhiteboardHandler{}
	pollsH := &handlers.PollsHandler{WS: wsManager}
	wsH := &handlers.WSHandler{
		WS:          wsManager,
		MsgService:  msgSvc,
		CallService: callSvc,
		NotifSvc:    notifSvc,
		SFU:         sfuInstance,
	}
	// When SFU room membership changes, broadcast a labelled participant roster.
	sfuInstance.SetRosterCallback(wsH.BuildRoster)

	r := gin.New()
	r.Use(gin.Recovery())
	// Skip the OAuth callback path so the one-time authorization code is never
	// written into application logs.
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/api/google/calendar/callback"},
	}))

	// Security headers
	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: https:; "+
				"connect-src 'self' ws: wss:; "+
				"media-src 'self' blob:; "+
				"worker-src 'self' blob:; "+
				"frame-ancestors 'none'")
		c.Next()
	})

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     config.App.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// static uploads — authentication required; force download to prevent inline rendering
	r.GET("/uploads/*filepath", middleware.AuthRequired(), func(c *gin.Context) {
		uploadsDir := filepath.Clean(config.App.UploadsDir) + string(os.PathSeparator)
		fp := filepath.Clean(filepath.Join(config.App.UploadsDir, filepath.FromSlash(c.Param("filepath"))))
		if !strings.HasPrefix(fp, uploadsDir) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		c.Header("Content-Disposition", "attachment")
		c.Header("X-Content-Type-Options", "nosniff")
		c.File(fp)
	})

	// health
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// WebSocket
	r.GET("/ws/connect", wsH.Connect)

	// auth routes (rate-limited login)
	auth := r.Group("/api/auth")
	auth.POST("/login", middleware.LoginRateLimiter(), authH.Login)
	auth.POST("/refresh", authH.Refresh)
	auth.POST("/forgot-password", middleware.LoginRateLimiter(), authH.ForgotPassword)
	auth.POST("/reset-password", middleware.LoginRateLimiter(), authH.ResetPassword)
	auth.Use(middleware.AuthRequired())
	auth.POST("/logout", authH.Logout)
	auth.POST("/change-password", authH.ChangePassword)
	auth.GET("/me", authH.Me)

	// user routes
	users := r.Group("/api/users", middleware.AuthRequired())
	users.GET("", usersH.ListDirectory)
	users.POST("/fcm-token", usersH.StoreFCMToken)
	users.PUT("/me", usersH.UpdateMe)

	// admin routes
	admin := r.Group("/api/admin", middleware.AdminRequired())
	admin.POST("/users", adminH.CreateUser)
	admin.GET("/users", adminH.ListUsers)
	admin.PUT("/users/:user_id", adminH.UpdateUser)
	admin.DELETE("/users/:user_id", adminH.DeactivateUser)
	admin.POST("/users/:user_id/reset-password", adminH.ResetUserPassword)
	admin.GET("/audit-logs", adminH.GetAuditLogs)
	admin.GET("/stats", adminH.GetStats)
	admin.POST("/broadcast", adminH.Broadcast)
	admin.GET("/call-history", adminH.GetCallHistory)

	// conversation routes
	convs := r.Group("/api/conversations", middleware.AuthRequired())
	convs.GET("", convsH.List)
	convs.POST("", convsH.Create)
	convs.GET("/:conversation_id", convsH.Get)
	convs.PUT("/:conversation_id", convsH.Update)
	convs.POST("/:conversation_id/members", convsH.AddMembers)
	convs.POST("/:conversation_id/join", convsH.Join)
	convs.DELETE("/:conversation_id/members/:user_id", convsH.RemoveMember)
	convs.PATCH("/:conversation_id/archive", convsH.Archive)
	convs.DELETE("/:conversation_id/archive", convsH.Unarchive)
	convs.DELETE("/:conversation_id/messages", convsH.ClearMessages)
	convs.DELETE("/:conversation_id", convsH.Delete)

	// message routes
	msgs := r.Group("/api", middleware.AuthRequired())
	msgs.GET("/conversations/:conversation_id/messages", msgsH.GetMessages)
	msgs.POST("/conversations/:conversation_id/messages", msgsH.SendMessage)
	msgs.PUT("/messages/:message_id", msgsH.EditMessage)
	msgs.DELETE("/messages/:message_id", msgsH.DeleteMessage)
	msgs.POST("/messages/:message_id/read", msgsH.MarkRead)
	msgs.POST("/conversations/:conversation_id/messages/read", msgsH.MarkConversationRead)
	msgs.POST("/messages/upload", msgsH.UploadFile)
	msgs.GET("/conversations/:conversation_id/search", msgsH.SearchMessages)
	msgs.GET("/conversations/:conversation_id/attachments", msgsH.GetAttachments)
	msgs.GET("/messages/:message_id/thread", msgsH.GetThreadReplies)
	// reactions
	msgs.POST("/messages/:message_id/react", msgsH.ReactToMessage)
	// pinning
	msgs.GET("/conversations/:conversation_id/pinned", msgsH.GetPinnedMessages)
	msgs.POST("/conversations/:conversation_id/messages/:message_id/pin", msgsH.PinMessage)
	msgs.DELETE("/conversations/:conversation_id/messages/:message_id/pin", msgsH.UnpinMessage)
	// scheduled messages
	msgs.POST("/conversations/:conversation_id/messages/schedule", msgsH.ScheduleMessage)
	msgs.GET("/conversations/:conversation_id/scheduled", msgsH.GetScheduledMessages)
	msgs.DELETE("/scheduled-messages/:scheduled_id", msgsH.DeleteScheduledMessage)
	// link preview
	msgs.GET("/link-preview", msgsH.GetLinkPreview)

	// call routes
	calls := r.Group("/api/calls", middleware.AuthRequired())
	calls.GET("/ice-servers", callsH.ICEServers)
	calls.POST("/initiate", callsH.InitiateCall)
	calls.POST("/:call_id/join", callsH.JoinCall)
	calls.POST("/:call_id/leave", callsH.LeaveCall)
	calls.GET("/history", callsH.GetHistory)
	calls.POST("/:call_id/invite", callsH.InviteToCall)
	calls.GET("/:call_id/waiting", callsH.GetWaitingRoom)
	calls.POST("/:call_id/waiting/:user_id/admit", callsH.AdmitParticipant)
	calls.DELETE("/:call_id/waiting/:user_id", callsH.RejectWaiting)

	// meeting routes
	meetings := r.Group("/api/meetings", middleware.AuthRequired())
	meetings.GET("", meetingsH.List)
	meetings.POST("", meetingsH.Create)
	meetings.DELETE("/:meeting_id", meetingsH.Delete)
	meetings.POST("/:meeting_id/join", meetingsH.Join)

	// task routes
	tasks := r.Group("/api/tasks", middleware.AuthRequired())
	tasks.GET("", tasksH.List)
	tasks.POST("", tasksH.Create)
	tasks.PATCH("/:task_id", tasksH.Update)
	tasks.DELETE("/:task_id", tasksH.Delete)

	// reminder routes
	reminders := r.Group("/api/reminders", middleware.AuthRequired())
	reminders.POST("", remindersH.Create)
	reminders.GET("", remindersH.List)
	reminders.PATCH("/:reminder_id", remindersH.Update)
	reminders.DELETE("/:reminder_id", remindersH.Delete)

	// announcement routes
	announcements := r.Group("/api/announcements", middleware.AuthRequired())
	announcements.GET("", announcementsH.List)
	announcements.POST("", announcementsH.Create)
	announcements.PATCH("/:announcement_id/pin", announcementsH.TogglePin)
	announcements.DELETE("/:announcement_id", announcementsH.Delete)

	// poll routes
	convs.POST("/:conversation_id/polls", pollsH.CreatePoll)
	polls := r.Group("/api/polls", middleware.AuthRequired())
	polls.GET("/:poll_id", pollsH.GetPoll)
	polls.POST("/:poll_id/vote", pollsH.Vote)
	polls.PATCH("/:poll_id/close", pollsH.ClosePoll)

	// Google Calendar OAuth routes
	// Callback is public — browser redirect from Google carries no JWT
	r.GET("/api/google/calendar/callback", gcalH.Callback)
	gcal := r.Group("/api/google/calendar", middleware.AuthRequired())
	gcal.GET("/auth", gcalH.Authorize)
	gcal.GET("/status", gcalH.Status)
	gcal.GET("/events", gcalH.Events)
	gcal.DELETE("/disconnect", gcalH.Disconnect)

	// whiteboard draft routes
	convs.GET("/:conversation_id/whiteboard", whiteboardH.GetDraft)
	convs.PUT("/:conversation_id/whiteboard", whiteboardH.SaveDraft)
	convs.PATCH("/:conversation_id/whiteboard/name", whiteboardH.RenameDraft)
	convs.POST("/:conversation_id/whiteboard/publish", whiteboardH.PublishDraft)
	convs.DELETE("/:conversation_id/whiteboard", whiteboardH.DeleteDraft)
	wb := r.Group("/api/whiteboard", middleware.AuthRequired())
	wb.GET("/my-drafts", whiteboardH.ListDrafts)

	// E2EE toggle on a DM conversation
	convs.PATCH("/:conversation_id/e2ee", convsH.ToggleE2EE)

	// public-key endpoints
	users.PUT("/me/public-key", usersH.SetPublicKey)
	users.GET("/:user_id/public-key", usersH.GetPublicKey)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// background task: check reminders every 30s
	go checkReminders(ctx, notifSvc)
	go expireFiles(ctx)
	// background task: send scheduled messages every 30s
	go processScheduledMessages(ctx, msgSvc, wsManager)

	srv := &http.Server{Addr: ":8000", Handler: r}
	go func() {
		log.Println("OrgChat API running on :8000")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	stop()
	log.Println("Shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}

func processScheduledMessages(ctx context.Context, msgSvc *services.MessageService, wsManager *ws.Manager) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sent := msgSvc.ProcessScheduledMessages()
			if len(sent) == 0 {
				continue
			}
			// Collect unique conversation IDs to fetch all members in one query
			convIDSet := make(map[string]bool, len(sent))
			for _, msg := range sent {
				convIDSet[msg.ConversationID] = true
			}
			convIDs := make([]string, 0, len(convIDSet))
			for id := range convIDSet {
				convIDs = append(convIDs, id)
			}
			var allMembers []models.ConversationMember
			database.DB.Where("conversation_id IN ?", convIDs).Find(&allMembers)
			membersByConv := make(map[string][]models.ConversationMember, len(convIDs))
			for _, m := range allMembers {
				membersByConv[m.ConversationID] = append(membersByConv[m.ConversationID], m)
			}
			for _, msg := range sent {
				for _, m := range membersByConv[msg.ConversationID] {
					wsManager.SendToUser(m.UserID, "message:new", msg)
				}
				log.Printf("[SCHEDULED] sent message %s in conv %s", msg.ID, msg.ConversationID)
			}
		}
	}
}

func expireFiles(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			var expired []models.Message
			database.DB.Where("file_expired = ? AND file_expires_at IS NOT NULL AND file_expires_at <= ? AND file_url IS NOT NULL", false, time.Now()).
				Find(&expired)
			for _, msg := range expired {
				if msg.FileURL != nil {
					if err := utils.DeleteFile(*msg.FileURL); err != nil {
						log.Printf("[FILE_EXPIRY] failed to delete file for message %s: %v", msg.ID, err)
					}
				}
				database.DB.Model(&msg).Updates(map[string]any{
					"file_expired": true,
					"file_url":     nil,
				})
				log.Printf("[FILE_EXPIRY] expired file in message %s", msg.ID)
			}
		}
	}
}

func checkReminders(ctx context.Context, notifSvc *services.NotificationService) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			var reminders []models.Reminder
			database.DB.Where("is_completed = ? AND notified = ? AND due_date <= ?", false, false, now).Find(&reminders)
			var notifiedIDs []string
			for _, r := range reminders {
				notifSvc.CreateAndPush(r.UserID, "reminder", "Reminder", r.Title, map[string]string{"reminder_id": r.ID})
				notifiedIDs = append(notifiedIDs, r.ID)
				log.Printf("[REMINDER] sent to user %s: %s", r.UserID, r.Title)
			}
			if len(notifiedIDs) > 0 {
				database.DB.Model(&models.Reminder{}).Where("id IN ?", notifiedIDs).Update("notified", true)
			}
			database.DB.Where("expires_at < ?", now).Delete(&models.PasswordResetOTP{})
		}
	}
}
