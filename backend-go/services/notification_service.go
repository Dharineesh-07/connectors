package services

import (
	"encoding/json"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	ws "github.com/orgchat/backend/websocket"
)

type NotificationService struct {
	WS *ws.Manager
}

func (s *NotificationService) CreateAndPush(userID, notifType, title, content string, data interface{}) (*models.Notification, error) {
	c := &content
	notif := &models.Notification{
		UserID:  userID,
		Type:    notifType,
		Title:   title,
		Content: c,
	}
	if data != nil {
		b, err := json.Marshal(data)
		if err == nil {
			str := string(b)
			notif.Data = &str
		}
	}
	if err := database.DB.Create(notif).Error; err != nil {
		return nil, err
	}
	s.WS.SendToUser(userID, "notification:new", notif)
	s.WS.SendToUser(userID, "notification:push", map[string]interface{}{
		"title":   title,
		"content": content,
		"data":    data,
	})
	return notif, nil
}
