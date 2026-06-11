package services

import (
	"errors"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	ws "github.com/orgchat/backend/websocket"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MessageService struct {
	WS *ws.Manager
}

type ConversationListItem struct {
	models.Conversation
	LastMessage *models.Message `json:"last_message"`
	UnreadCount int64           `json:"unread_count"`
	MemberCount int             `json:"member_count"`
	IsMember    bool            `json:"is_member"`
	ArchivedAt  *time.Time      `json:"archived_at"`
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

func (s *MessageService) getMemberRole(convID, userID string) (string, error) {
	var member models.ConversationMember
	err := database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil // not a member — role is empty, callers check role != "admin"
	}
	return member.Role, err // propagate real DB errors; role="" on error
}

func (s *MessageService) GetUserConversations(userID string, archived bool) ([]ConversationListItem, error) {
	var memberRows []models.ConversationMember
	if archived {
		database.DB.Where("user_id = ? AND archived_at IS NOT NULL", userID).Find(&memberRows)
	} else {
		database.DB.Where("user_id = ? AND archived_at IS NULL", userID).Find(&memberRows)
	}

	memberConvIDs := map[string]bool{}
	var result []ConversationListItem

	for _, m := range memberRows {
		memberConvIDs[m.ConversationID] = true
		var conv models.Conversation
		if err := database.DB.Preload("Members.User").First(&conv, "id = ?", m.ConversationID).Error; err != nil {
			continue
		}

		item := ConversationListItem{
			Conversation: conv,
			MemberCount:  len(conv.Members),
			IsMember:     true,
			ArchivedAt:   m.ArchivedAt,
		}

		var lastMsg models.Message
		if err := database.DB.Where("conversation_id = ? AND is_deleted = ?", conv.ID, false).
			Order("created_at DESC").
			Preload("Sender").
			First(&lastMsg).Error; err == nil {
			item.LastMessage = &lastMsg
		}

		database.DB.Model(&models.Message{}).
			Joins("LEFT JOIN message_receipts ON message_receipts.message_id = messages.id AND message_receipts.user_id = ? AND message_receipts.status = ?", userID, "read").
			Where("messages.conversation_id = ? AND messages.sender_id != ? AND message_receipts.message_id IS NULL", conv.ID, userID).
			Count(&item.UnreadCount)

		result = append(result, item)
	}

	// Non-archived view: also include public groups the user has not yet joined
	if !archived {
		var publicGroups []models.Conversation
		database.DB.Preload("Members.User").
			Where("type = ? AND is_private = ?", "group", false).
			Find(&publicGroups)

		for _, conv := range publicGroups {
			if memberConvIDs[conv.ID] {
				continue
			}
			result = append(result, ConversationListItem{
				Conversation: conv,
				MemberCount:  len(conv.Members),
				IsMember:     false,
			})
		}
	}

	sort.Slice(result, func(i, j int) bool {
		ti := result[i].CreatedAt
		if result[i].LastMessage != nil {
			ti = result[i].LastMessage.CreatedAt
		}
		tj := result[j].CreatedAt
		if result[j].LastMessage != nil {
			tj = result[j].LastMessage.CreatedAt
		}
		return ti.After(tj)
	})

	return result, nil
}

func (s *MessageService) ClearConversation(convID, userID string) error {
	role, err := s.getMemberRole(convID, userID)
	if err != nil {
		return err
	}
	if role != "admin" {
		return errors.New("only conversation admins can clear messages")
	}
	deletedContent := "This message was deleted"
	return database.DB.Model(&models.Message{}).
		Where("conversation_id = ? AND is_deleted = ?", convID, false).
		Updates(map[string]interface{}{"is_deleted": true, "content": deletedContent}).Error
}

func (s *MessageService) ArchiveConversation(convID, userID string) error {
	now := time.Now()
	result := database.DB.Model(&models.ConversationMember{}).
		Where("conversation_id = ? AND user_id = ?", convID, userID).
		Update("archived_at", now)
	if result.RowsAffected == 0 {
		return errors.New("not a member of this conversation")
	}
	return result.Error
}

func (s *MessageService) UnarchiveConversation(convID, userID string) error {
	result := database.DB.Model(&models.ConversationMember{}).
		Where("conversation_id = ? AND user_id = ?", convID, userID).
		Update("archived_at", nil)
	if result.RowsAffected == 0 {
		return errors.New("not a member of this conversation")
	}
	return result.Error
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

func (s *MessageService) CreateConversation(creatorID string, convType string, userIDs []string, name, avatarURL *string, isPrivate bool) (*models.Conversation, error) {
	if convType == "direct" {
		return s.getOrCreateDM(creatorID, userIDs)
	}
	return s.createGroup(creatorID, userIDs, name, avatarURL, isPrivate)
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
	if err := tx.Create(conv).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: creatorID, Role: "admin"}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if otherID != creatorID {
		if err := tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: otherID, Role: "member"}).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	database.DB.Preload("Members.User").First(conv, "id = ?", conv.ID)
	return conv, nil
}

func (s *MessageService) createGroup(creatorID string, userIDs []string, name, avatarURL *string, isPrivate bool) (*models.Conversation, error) {
	if name == nil || *name == "" {
		return nil, errors.New("group name is required")
	}

	// For public groups, add every user in the system automatically
	if !isPrivate {
		var allUsers []models.User
		database.DB.Select("id").Find(&allUsers)
		userIDs = make([]string, 0, len(allUsers))
		for _, u := range allUsers {
			userIDs = append(userIDs, u.ID)
		}
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
	if isPrivate && len(members) < 1 {
		return nil, errors.New("private group requires at least 1 other member")
	}

	conv := &models.Conversation{Type: "group", Name: name, AvatarURL: avatarURL, IsPrivate: isPrivate, CreatedByID: creatorID}
	tx := database.DB.Begin()
	if err := tx.Create(conv).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: creatorID, Role: "admin"}).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	for _, uid := range members {
		if err := tx.Create(&models.ConversationMember{ConversationID: conv.ID, UserID: uid, Role: "member"}).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
	}
	if err := tx.Commit().Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	database.DB.Preload("Members.User").First(conv, "id = ?", conv.ID)
	return conv, nil
}

func (s *MessageService) UpdateConversation(convID, userID string, updates map[string]interface{}) (*models.Conversation, error) {
	role, err := s.getMemberRole(convID, userID)
	if err != nil {
		return nil, err
	}
	if role != "admin" {
		return nil, errors.New("only admins can update the conversation")
	}
	allowed := []string{"name", "avatar_url", "is_private", "mention_permission", "waiting_room_enabled"}
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
	role, err := s.getMemberRole(convID, adminID)
	if err != nil {
		return err
	}
	if role != "admin" {
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
	var conv models.Conversation
	if err := database.DB.First(&conv, "id = ?", convID).Error; err != nil {
		return errors.New("conversation not found")
	}
	if conv.IsPrivate {
		return errors.New("cannot join a private group")
	}
	var existing models.ConversationMember
	if database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&existing).Error == nil {
		return nil
	}
	return database.DB.Create(&models.ConversationMember{ConversationID: convID, UserID: userID, Role: "member"}).Error
}

func (s *MessageService) RemoveMember(convID, requesterID, targetUserID string) error {
	role, err := s.getMemberRole(convID, requesterID)
	if err != nil {
		return err
	}
	if requesterID != targetUserID && role != "admin" {
		return errors.New("only admins can remove other members")
	}
	// Prevent removing the last admin — the group would be orphaned with no one able to manage it.
	targetRole, err := s.getMemberRole(convID, targetUserID)
	if err != nil {
		return err
	}
	if targetRole == "admin" {
		var adminCount int64
		database.DB.Model(&models.ConversationMember{}).
			Where("conversation_id = ? AND role = ?", convID, "admin").
			Count(&adminCount)
		if adminCount <= 1 {
			return errors.New("cannot remove the last admin; promote another member first")
		}
	}
	return database.DB.Where("conversation_id = ? AND user_id = ?", convID, targetUserID).Delete(&models.ConversationMember{}).Error
}

func (s *MessageService) GetMessagesAroundDate(convID, userID string, after time.Time) (*MessageListResponse, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}

	var messages []models.Message
	database.DB.Where("conversation_id = ? AND thread_parent_id IS NULL AND created_at >= ?", convID, after).
		Preload("Sender").
		Preload("Receipts").
		Preload("ReplyTo", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Sender")
		}).
		Preload("ThreadReplies", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Preload("Sender")
		}).
		Order("created_at ASC").
		Limit(51).
		Find(&messages)

	hasMore := len(messages) > 50
	if hasMore {
		messages = messages[:50]
	}

	var nextCursor *string
	if hasMore && len(messages) > 0 {
		id := messages[len(messages)-1].ID
		nextCursor = &id
	}

	return &MessageListResponse{Messages: messages, NextCursor: nextCursor, HasMore: hasMore}, nil
}

func (s *MessageService) GetMessages(convID, userID string, beforeID *string, limit int) (*MessageListResponse, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}

	query := database.DB.Where("conversation_id = ? AND thread_parent_id IS NULL", convID).
		Preload("Sender").
		Preload("Receipts").
		Preload("ReplyTo", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Sender")
		}).
		Preload("ThreadReplies", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at ASC").Preload("Sender")
		}).
		Order("created_at DESC").
		Limit(limit + 1)

	if beforeID != nil && *beforeID != "" {
		var ref models.Message
		if err := database.DB.First(&ref, "id = ?", *beforeID).Error; err == nil {
			// Composite cursor: messages strictly before the anchor, with ties broken
			// by ID so same-second messages are never skipped or duplicated.
			query = query.Where("(created_at < ? OR (created_at = ? AND id < ?))", ref.CreatedAt, ref.CreatedAt, ref.ID)
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

	// mark messages as delivered without blocking the response
	go s.markDelivered(convID, userID)

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

	if len(msgIDs) == 0 {
		return
	}

	now := time.Now()
	receipts := make([]models.MessageReceipt, 0, len(msgIDs))
	for _, id := range msgIDs {
		receipts = append(receipts, models.MessageReceipt{
			MessageID: id,
			UserID:    userID,
			Status:    "delivered",
			Timestamp: now,
		})
	}
	database.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&receipts)
}

func (s *MessageService) MarkAllDelivered(userID string) {
	var memberRows []models.ConversationMember
	database.DB.Where("user_id = ?", userID).Find(&memberRows)
	for _, m := range memberRows {
		s.markDelivered(m.ConversationID, userID)
	}
}

func (s *MessageService) CreateMessage(convID, senderID, msgType string, content, fileURL, fileName *string, fileSize *int64, replyToID *string, threadParentID *string) (*models.Message, error) {
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
		ThreadParentID: threadParentID,
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

	database.DB.Preload("Sender").Preload("Receipts").Preload("ReplyTo", func(db *gorm.DB) *gorm.DB {
		return db.Preload("Sender")
	}).First(msg, "id = ?", msg.ID)

	// Handle @here / @channel broadcast mentions
	if content != nil && threadParentID == nil {
		s.processMentionBroadcast(convID, senderID, *content, msg, members)
	}

	return msg, nil
}

func (s *MessageService) processMentionBroadcast(convID, senderID, content string, msg *models.Message, members []models.ConversationMember) {
	hasChannel := strings.Contains(content, "@channel")
	hasHere := strings.Contains(content, "@here")
	if !hasChannel && !hasHere {
		return
	}

	// Enforce mention permission — admins_only blocks non-admins
	var conv models.Conversation
	if err := database.DB.First(&conv, "id = ?", convID).Error; err != nil {
		return
	}
	if conv.MentionPermission == "admins_only" {
		senderRole, err := s.getMemberRole(convID, senderID)
		if err != nil || senderRole != "admin" {
			return
		}
	}

	payload := map[string]interface{}{
		"message_id":      msg.ID,
		"conversation_id": convID,
		"sender_id":       senderID,
		"mention_type":    "channel",
	}

	for _, m := range members {
		if m.UserID == senderID {
			continue
		}
		if hasHere && !s.WS.IsOnline(m.UserID) {
			continue // @here only pings online members
		}
		if hasChannel {
			payload["mention_type"] = "channel"
		} else {
			payload["mention_type"] = "here"
		}
		s.WS.SendToUser(m.UserID, "message:mention_all", payload)
	}
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
	if time.Since(msg.CreatedAt) > 10*time.Minute {
		return nil, errors.New("message can no longer be edited")
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
	role, err := s.getMemberRole(msg.ConversationID, requesterID)
	if err != nil {
		return nil, err
	}
	if msg.SenderID != requesterID && role != "admin" {
		return nil, errors.New("permission denied")
	}
	// time window applies only to own deletes; admins can always delete
	if msg.SenderID == requesterID && time.Since(msg.CreatedAt) > 30*time.Minute {
		return nil, errors.New("message can no longer be deleted")
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
	// Escape LIKE wildcards so user input is treated as literal text.
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	var msgs []models.Message
	database.DB.Where("conversation_id = ? AND is_deleted = ? AND content LIKE ?", convID, false, "%"+escaped+"%").
		Preload("Sender").
		Order("created_at DESC").
		Limit(50).
		Find(&msgs)
	return msgs, nil
}

var imageExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
var docExts = map[string]bool{".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true, ".txt": true, ".csv": true}

func (s *MessageService) GetAttachments(convID, userID string, page, limit int) (*AttachmentsResponse, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit
	var msgs []models.Message
	database.DB.Where("conversation_id = ? AND is_deleted = ?", convID, false).
		Where("file_url IS NOT NULL OR file_name IS NOT NULL OR content LIKE ?", "%http%").
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
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

func (s *MessageService) GetThreadReplies(messageID, userID string) ([]models.Message, error) {
	var parent models.Message
	if err := database.DB.First(&parent, "id = ?", messageID).Error; err != nil {
		return nil, errors.New("message not found")
	}
	if err := s.requireMember(parent.ConversationID, userID); err != nil {
		return nil, err
	}
	var replies []models.Message
	database.DB.Where("thread_parent_id = ?", messageID).
		Preload("Sender").
		Preload("Receipts").
		Order("created_at ASC").
		Find(&replies)
	return replies, nil
}

func getExt(path string) string {
	idx := strings.LastIndex(path, ".")
	if idx < 0 {
		return ""
	}
	return path[idx:]
}

func (s *MessageService) GetMessageConvID(messageID string) (string, error) {
	var msg models.Message
	if err := database.DB.Select("conversation_id").First(&msg, "id = ?", messageID).Error; err != nil {
		return "", errors.New("message not found")
	}
	return msg.ConversationID, nil
}

// --- Reactions ---

func (s *MessageService) ReactToMessage(messageID, userID, emoji string) ([]models.MessageReaction, error) {
	var msg models.Message
	if err := database.DB.First(&msg, "id = ?", messageID).Error; err != nil {
		return nil, errors.New("message not found")
	}
	if err := s.requireMember(msg.ConversationID, userID); err != nil {
		return nil, err
	}

	var existing models.MessageReaction
	err := database.DB.Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).First(&existing).Error
	if err == nil {
		// already reacted — toggle off
		database.DB.Delete(&existing)
	} else {
		database.DB.Create(&models.MessageReaction{MessageID: messageID, UserID: userID, Emoji: emoji})
	}

	var reactions []models.MessageReaction
	database.DB.Where("message_id = ?", messageID).Preload("User").Find(&reactions)
	return reactions, nil
}

// --- Pinning ---

func (s *MessageService) PinMessage(convID, messageID, userID string) (*models.PinnedMessage, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var msg models.Message
	if err := database.DB.First(&msg, "id = ? AND conversation_id = ?", messageID, convID).Error; err != nil {
		return nil, errors.New("message not found in this conversation")
	}

	var existing models.PinnedMessage
	if database.DB.Where("message_id = ?", messageID).First(&existing).Error == nil {
		return &existing, nil // already pinned
	}

	pin := &models.PinnedMessage{
		ConversationID: convID,
		MessageID:      messageID,
		PinnedByID:     userID,
	}
	if err := database.DB.Create(pin).Error; err != nil {
		return nil, err
	}
	database.DB.Preload("Message.Sender").Preload("PinnedBy").First(pin, "id = ?", pin.ID)
	return pin, nil
}

func (s *MessageService) UnpinMessage(convID, messageID, userID string) error {
	if err := s.requireMember(convID, userID); err != nil {
		return err
	}
	return database.DB.Where("conversation_id = ? AND message_id = ?", convID, messageID).Delete(&models.PinnedMessage{}).Error
}

func (s *MessageService) GetPinnedMessages(convID, userID string) ([]models.PinnedMessage, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var pins []models.PinnedMessage
	database.DB.Where("conversation_id = ?", convID).
		Preload("Message.Sender").
		Preload("PinnedBy").
		Order("pinned_at DESC").
		Find(&pins)
	return pins, nil
}

// --- Scheduled Messages ---

func (s *MessageService) CreateScheduledMessage(convID, senderID, msgType string, content, fileURL, fileName *string, fileSize *int64, scheduledAt time.Time) (*models.ScheduledMessage, error) {
	if err := s.requireMember(convID, senderID); err != nil {
		return nil, err
	}
	if scheduledAt.Before(time.Now().Add(30 * time.Second)) {
		return nil, errors.New("scheduled time must be at least 30 seconds in the future")
	}
	sm := &models.ScheduledMessage{
		ConversationID: convID,
		SenderID:       senderID,
		Type:           msgType,
		Content:        content,
		FileURL:        fileURL,
		FileName:       fileName,
		FileSize:       fileSize,
		ScheduledAt:    scheduledAt,
	}
	if err := database.DB.Create(sm).Error; err != nil {
		return nil, err
	}
	return sm, nil
}

func (s *MessageService) GetScheduledMessages(convID, userID string) ([]models.ScheduledMessage, error) {
	if err := s.requireMember(convID, userID); err != nil {
		return nil, err
	}
	var msgs []models.ScheduledMessage
	database.DB.Where("conversation_id = ? AND sender_id = ? AND sent = ?", convID, userID, false).
		Order("scheduled_at ASC").
		Find(&msgs)
	return msgs, nil
}

func (s *MessageService) DeleteScheduledMessage(id, userID string) error {
	var sm models.ScheduledMessage
	if err := database.DB.First(&sm, "id = ?", id).Error; err != nil {
		return errors.New("scheduled message not found")
	}
	if sm.SenderID != userID {
		return errors.New("permission denied")
	}
	if sm.Sent {
		return errors.New("message already sent")
	}
	return database.DB.Delete(&sm).Error
}

func (s *MessageService) ProcessScheduledMessages() []models.Message {
	// Atomically claim unsent due messages in a single UPDATE so concurrent
	// runners (e.g. rolling restart) cannot double-deliver the same message.
	var due []models.ScheduledMessage
	// RETURNING * is PostgreSQL-specific. If the DB is not PostgreSQL this will
	// log an error and return no messages rather than silently double-delivering.
	if err := database.DB.Raw(
		"UPDATE scheduled_messages SET sent = true WHERE sent = false AND scheduled_at <= ? RETURNING *",
		time.Now(),
	).Scan(&due).Error; err != nil {
		log.Printf("error: failed to claim scheduled messages: %v", err)
		return nil
	}

	var sent []models.Message
	for _, sm := range due {
		msg, err := s.CreateMessage(sm.ConversationID, sm.SenderID, sm.Type, sm.Content, sm.FileURL, sm.FileName, sm.FileSize, nil, nil)
		if err == nil {
			sent = append(sent, *msg)
		}
	}
	return sent
}
