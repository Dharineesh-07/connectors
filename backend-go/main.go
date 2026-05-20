package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/handlers"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/store"
	ws "github.com/orgchat/backend/websocket"
)

func main() {
	config.Load()
	database.Connect()
	store.Connect()

	services.SetAuthDomain(config.App.CompanyEmailDomain)

	wsManager := ws.NewManager()

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
	wsH := &handlers.WSHandler{
		WS:          wsManager,
		MsgService:  msgSvc,
		CallService: callSvc,
		NotifSvc:    notifSvc,
	}

	r := gin.Default()

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     config.App.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// static uploads
	r.Static("/uploads", config.App.UploadsDir)

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
	auth.POST("/forgot-password", authH.ForgotPassword)
	auth.POST("/reset-password", authH.ResetPassword)
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

	// call routes
	calls := r.Group("/api/calls", middleware.AuthRequired())
	calls.POST("/initiate", callsH.InitiateCall)
	calls.POST("/:call_id/join", callsH.JoinCall)
	calls.POST("/:call_id/leave", callsH.LeaveCall)
	calls.GET("/history", callsH.GetHistory)
	calls.POST("/:call_id/invite", callsH.InviteToCall)

	// reminder routes
	reminders := r.Group("/api/reminders", middleware.AuthRequired())
	reminders.POST("", remindersH.Create)
	reminders.GET("", remindersH.List)
	reminders.PATCH("/:reminder_id", remindersH.Update)
	reminders.DELETE("/:reminder_id", remindersH.Delete)

	// background task: check reminders every 30s
	go checkReminders(notifSvc)

	log.Println("OrgChat API running on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatal(err)
	}
}

func checkReminders(notifSvc *services.NotificationService) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		var reminders []models.Reminder
		database.DB.Where("is_completed = ? AND notified = ? AND due_date <= ?", false, false, now).Find(&reminders)
		for _, r := range reminders {
			notifSvc.CreateAndPush(r.UserID, "reminder", "Reminder", r.Title, map[string]string{"reminder_id": r.ID})
			database.DB.Model(&r).Update("notified", true)
			fmt.Printf("[REMINDER] sent to user %s: %s\n", r.UserID, r.Title)
		}
		// cleanup expired OTPs
		database.DB.Where("expires_at < ?", now).Delete(&models.PasswordResetOTP{})
		_ = context.Background()
	}
}
