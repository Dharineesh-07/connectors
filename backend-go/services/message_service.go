package services

import (
	"errors"
	"strings"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	ws "github.com/orgchat/backend/websocket"
	"gorm.io/gorm"
)

type MessageService struct {
	WS *ws.Manager
}

type ConversationListItem struct {
	models.Conversation
	LastMessage  *models.Message `json:"last_message"`
	UnreadCount  int64           `json:"unread_count"`
	MemberCount  int             `json:"member_count"`
}

type MessageListResponse struct {
	Messages   []models.Message `json:"messages"`
	NextCursor *string          `json:"next_cursor"`
	HasMore    bool             `json:"has_more"`
}

type AttachmentsResponse struct {
	Media []models.Message `json:"media"`
	Files []models.Message `json:"files"`
	Links []models.Message `json:"links"`
}

func (s *MessageService) requireMember(convID, userID string) error {
	var member models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&member).Error; err != nil {
		return errors.New("not a member of this conversation")
	}
	return nil
}

func (s *MessageService) getMemberRole(convID, userID string) string {
	var member models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&member)
	return member.Role
}

func (s *MessageService) GetUserConversations(userID string) ([]ConversationListItem, error) {
	// find all conversation IDs for the user
	var memberRows []models.ConversationMember
	database.DB.Where("user_id = ?", userID).Find(&memberRows)

	var result []ConversationListItem
	for _, m := range memberRows {
		var conv models.Conversation
		if err := database.DB.Preload("Members.User").First(&conv, "id = ?", m.ConversationID).Error; err != nil {
			continue
		}

		item := ConversationListItem{
			Conversation: conv,
			MemberCount:  len(conv.Members),
		}

		// last message
		var lastMsg models.Message
		if err := database.DB.Where("conversation_id = ? AND is_deleted = ?", conv.ID, false).
			Order("created_at DESC").
			Preload("Sender").
			First(&lastMsg).Error; err == nil {
			item.LastMessage = &lastMsg
		}

		// unread count: messages not read by this user
		database.DB.Model(&models.Message{}).
			Where("conversation_id = ? AND sender_id != ? AND id NOT IN (?)",
				conv.ID, userID,
				database.DB.Model(&models.MessageReceipt{}).
					Select("message_id").
					Where("user_id = ? AND status = ?", userID, "read"),
			).Count(&item.UnreadCount)

		result = append(result, item)
	}
	return result, nil
}

func (s *MessageService) GetConversation(convID, userID string) (*models.Conversation, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var conv models.Conversation
	if err := database.DB.Preload("Members.User").First(&conv, "id = ?", convID).Error; err != nil {
		return nil, errors.New("conversation not found")
	}
	return &conv, nil
}

func (s *MessageService) CreateConversation(creatorID string, convType string, userIDs []string, name, avatarURL *string) (*models.Conversation, error) {
	if convType == "direct" {
		return s.getOrCreateDM(creatorID, userIDs)
	}
	return s.createGroup(creatorID, userIDs, name, avatarURL)
}

func (s *MessageService) getOrCreateDM(creatorID string, userIDs []string) (*models.Conversation, error) {
	otherID := creatorID
	for _, id := range userIDs {
		if id != creatorID {
			otherID = id
			break
		}
	}

	// find existing DM between exactly these two users
	var convIDs []string
	database.DB.Model(&models.ConversationMember{}).
		Select("conversation_id").
		Where("user_id = ?", creatorID).
		Find(&convIDs)

	for _, cid := range convIDs {
		var conv models.Conversation
		if err := database.DB.Where("id = ? AND type = ?", cid, "direct").First(&conv).Error; err != nil {
			continue
		}
		var count int64
		database.DB.Model(&models.ConversationMember{}).
			Where("conversation_id = ?", cid).Count(&count)
		if count == 2 {
			var other models.ConversationMember
			if database.DB.Where("conversation_id = ? AND user_id = ?", cid, otherID).First(&other).Error == nil {
				database.DB.Preload("Members.User").First(&conv, "id = ?", cid)
				return &conv, nil
			}
		}
	}

	// create new DM
	conv := &models.Conversation{Type: "direct", CreatedByID: creatorID}
	tx := database.DB.Begin()
	tx.Create(conv)
	tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: creatorID, Role: "admin"})
	if otherID != creatorID {
		tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: otherID, Role: "member"})
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	database.DB.Preload("Members.User").First(conv, "id = ?", conv.ID)
	return conv, nil
}

func (s *MessageService) createGroup(creatorID string, userIDs []string, name, avatarURL *string) (*models.Conversation, error) {
	if name == nil || *name == "" {
		return nil, errors.New("group name is required")
	}
	// collect unique members (exclude creator, they are added separately)
	seen := map[string]bool{creatorID: true}
	var members []string
	for _, id := range userIDs {
		if !seen[id] {
			seen[id] = true
			members = append(members, id)
		}
	}
	if len(members) < 1 {
		return nil, errors.New("group requires at least 2 members")
	}

	conv := &models.Conversation{Type: "group", Name: name, AvatarURL: avatarURL, CreatedByID: creatorID}
	tx := database.DB.Begin()
	tx.Create(conv)
	tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: creatorID, Role: "admin"})
	for _, uid := range members {
		tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: uid, Role: "member"})
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	database.DB.Preload("Members.User").First(conv, "id = ?", conv.ID)
	return conv, nil
}

func (s *MessageService) UpdateConversation(convID, userID string, updates map[string]interface{}) (*models.Conversation, error) {
	if s.getMemberRole(convID, userID) != "admin" {
		return nil, errors.New("only admins can update the conversation")
	}
	allowed := []string{"name", "avatar_url"}
	filtered := make(map[string]interface{})
	for _, k := range allowed {
		if v, ok := updates[k]; ok {
			filtered[k] = v
		}
	}
	database.DB.Model(&models.Conversation{}).Where("id = ?", convID).Updates(filtered)
	var conv models.Conversation
	database.DB.Preload("Members.User").First(&conv, "id = ?", convID)
	return &conv, nil
}

func (s *MessageService) AddMembers(convID, adminID string, userIDs []string) error {
	if s.getMemberRole(convID, adminID) != "admin" {
		return errors.New("only admins can add members")
	}
	tx := database.DB.Begin()
	for _, uid := range userIDs {
		var existing models.ConversationMember
		if tx.Where("conversation_id = ? AND user_id = ?", convID, uid).First(&existing).Error == nil {
			continue // already member
		}
		tx.Create(&models.ConversationMember{ConversationID: convID, UserID: uid, Role: "member"})
	}
	return tx.Commit().Error
}

func (s *MessageService) JoinConversation(convID, userID string) error {
	var existing models.ConversationMember
	if database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&existing).Error == nil {
		return nil
	}
	return database.DB.Create(&models.ConversationMember{ConversationID: convID, UserID: userID, Role: "member"}).Error
}

func (s *MessageService) RemoveMember(convID, requesterID, targetUserID string) error {
	role := s.getMemberRole(convID, requesterID)
	if requesterID != targetUserID && role != "admin" {
		return errors.New("only admins can remove other members")
	}
	return database.DB.Where("conversation_id = ? AND user_id = ?", convID, targetUserID).Delete(&models.ConversationMember{}).Error
}

func (s *MessageService) GetMessages(convID, userID string, beforeID *string, limit int) (*MessageListResponse, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}

	query := database.DB.Where("conversation_id = ?", convID).
		Preload("Sender").
		Preload("Receipts").
		Order("created_at DESC").
		Limit(limit + 1)

	if beforeID != nil && *beforeID != "" {
		var ref models.Message
		if err := database.DB.First(&ref, "id = ?", *beforeID).Error; err == nil {
			query = query.Where("created_at < ?", ref.CreatedAt)
		}
	}

	var messages []models.Message
	query.Find(&messages)

	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}

	var nextCursor *string
	if hasMore && len(messages) > 0 {
		id := messages[len(messages)-1].ID
		nextCursor = &id
	}

	// reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	// mark messages as delivered
	s.markDelivered(convID, userID)

	return &MessageListResponse{Messages: messages, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (s *MessageService) markDelivered(convID, userID string) {
	var msgIDs []string
	database.DB.Model(&models.Message{}).
		Select("id").
		Where("conversation_id = ? AND sender_id != ?", convID, userID).
		Where("id NOT IN (?)",
			database.DB.Model(&models.MessageReceipt{}).
				Select("message_id").
				Where("user_id = ?", userID),
		).Find(&msgIDs)

	now := time.Now()
	for _, id := range msgIDs {
		receipt := &models.MessageReceipt{
			MessageID: id,
			UserID:    userID,
			Status:    "delivered",
			Timestamp: now,
		}
		database.DB.Where(models.MessageReceipt{MessageID: id, UserID: userID}).
			FirstOrCreate(receipt)
	}
}

func (s *MessageService) MarkAllDelivered(userID string) {
	var memberRows []models.ConversationMember
	database.DB.Where("user_id = ?", userID).Find(&memberRows)
	for _, m := range memberRows {
		s.markDelivered(m.ConversationID, userID)
	}
}

func (s *MessageService) CreateMessage(convID, senderID, msgType string, content, fileURL, fileName *string, fileSize *int64, replyToID *string) (*models.Message, error) {
	if err := s.requireMember(convID, senderID); err != nil {
		return nil, err
	}

	msg := &models.Message{
		ConversationID: convID,
		SenderID:       senderID,
		Type:           msgType,
		Content:        content,
		FileURL:        fileURL,
		FileName:       fileName,
		FileSize:       fileSize,
		ReplyToID:      replyToID,
	}

	if err := database.DB.Create(msg).Error; err != nil {
		return nil, err
	}

	// add delivered receipt for online members
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", convID, senderID).Find(&members)
	now := time.Now()
	for _, m := range members {
		if s.WS.IsOnline(m.UserID) {
			database.DB.Where(models.MessageReceipt{MessageID: msg.ID, UserID: m.UserID}).
				FirstOrCreate(&models.MessageReceipt{MessageID: msg.ID, UserID: m.UserID, Status: "delivered", Timestamp: now})
		}
	}

	database.DB.Preload("Sender").Preload("Receipts").First(msg, "id = ?", msg.ID)
	return msg, nil
}

func (s *MessageService) EditMessage(msgID, senderID, newContent string) (*models.Message, error) {
	var msg models.Message
	if err := database.DB.First(&msg, "id = ?", msgID).Error; err != nil {
		return nil, errors.New("message not found")
	}
	if msg.SenderID != senderID {
		return nil, errors.New("cannot edit someone else's message")
	}
	if msg.IsDeleted {
		return nil, errors.New("cannot edit a deleted message")
	}
	if msg.Type != "text" {
		return nil, errors.New("only text messages can be edited")
	}
	database.DB.Model(&msg).Updates(map[string]interface{}{"content": newContent, "is_edited": true})
	database.DB.Preload("Sender").Preload("Receipts").First(&msg, "id = ?", msgID)
	return &msg, nil
}

func (s *MessageService) DeleteMessage(msgID, requesterID string) (*models.Message, error) {
	var msg models.Message
	if err := database.DB.First(&msg, "id = ?", msgID).Error; err != nil {
		return nil, errors.New("message not found")
	}
	role := s.getMemberRole(msg.ConversationID, requesterID)
	if msg.SenderID != requesterID && role != "admin" {
		return nil, errors.New("permission denied")
	}
	deletedContent := "This message was deleted"
	database.DB.Model(&msg).Updates(map[string]interface{}{"is_deleted": true, "content": deletedContent})
	database.DB.Preload("Sender").First(&msg, "id = ?", msgID)
	return &msg, nil
}

func (s *MessageService) MarkAsRead(msgID, userID string) error {
	var msg models.Message
	if err := database.DB.First(&msg, "id = ?", msgID).Error; err != nil {
		return errors.New("message not found")
	}
	now := time.Now()
	var receipt models.MessageReceipt
	result := database.DB.Where("message_id = ? AND user_id = ?", msgID, userID).First(&receipt)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		receipt = models.MessageReceipt{MessageID: msgID, UserID: userID, Status: "read", Timestamp: now}
		return database.DB.Create(&receipt).Error
	}
	return database.DB.Model(&receipt).Updates(map[string]interface{}{"status": "read", "timestamp": now}).Error
}

type ReadReceiptInfo struct {
	MessageID string
	SenderID  string
	Timestamp time.Time
}

func (s *MessageService) MarkConversationAsRead(convID, userID string) ([]ReadReceiptInfo, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	// find unread messages in this conversation not sent by the user
	var msgs []models.Message
	database.DB.Where("conversation_id = ? AND sender_id != ?", convID, userID).
		Where("id NOT IN (?)",
			database.DB.Model(&models.MessageReceipt{}).
				Select("message_id").
				Where("user_id = ? AND status = ?", userID, "read"),
		).Find(&msgs)

	now := time.Now()
	var infos []ReadReceiptInfo
	for _, m := range msgs {
		s.MarkAsRead(m.ID, userID)
		infos = append(infos, ReadReceiptInfo{MessageID: m.ID, SenderID: m.SenderID, Timestamp: now})
	}
	return infos, nil
}

func (s *MessageService) SearchMessages(convID, userID, query string) ([]models.Message, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var msgs []models.Message
	database.DB.Where("conversation_id = ? AND is_deleted = ? AND content LIKE ?", convID, false, "%"+query+"%").
		Preload("Sender").
		Order("created_at DESC").
		Limit(50).
		Find(&msgs)
	return msgs, nil
}

var imageExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
var docExts = map[string]bool{".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true, ".txt": true, ".csv": true}

func (s *MessageService) GetAttachments(convID, userID string) (*AttachmentsResponse, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var msgs []models.Message
	database.DB.Where("conversation_id = ? AND is_deleted = ?", convID, false).
		Where("file_url IS NOT NULL OR file_name IS NOT NULL OR content LIKE ?", "%http%").
		Find(&msgs)

	resp := &AttachmentsResponse{}
	for _, m := range msgs {
		if m.FileURL != nil || m.FileName != nil {
			ext := ""
			if m.FileURL != nil {
				ext = strings.ToLower(getExt(*m.FileURL))
			} else if m.FileName != nil {
				ext = strings.ToLower(getExt(*m.FileName))
			}
			if imageExts[ext] || m.Type == "image" || m.Type == "video" || m.Type == "audio" {
				resp.Media = append(resp.Media, m)
			} else {
				resp.Files = append(resp.Files, m)
			}
		} else if m.Content != nil && strings.Contains(*m.Content, "http") {
			resp.Links = append(resp.Links, m)
		}
	}
	return resp, nil
}

func getExt(path string) string {
	idx := strings.LastIndex(path, ".")
	if idx < 0 {
		return ""
	}
	return path[idx:]
}
