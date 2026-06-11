package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/store"
	"github.com/orgchat/backend/utils"
	ws "github.com/orgchat/backend/websocket"
)

type MessagesHandler struct {
	Service *services.MessageService
	WS      *ws.Manager
}

func (h *MessagesHandler) GetMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if aroundDate := c.Query("around_date"); aroundDate != "" {
		date, err := time.Parse("2006-01-02", aroundDate)
		if err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": "around_date must be YYYY-MM-DD"})
			return
		}
		result, err := h.Service.GetMessagesAroundDate(convID, user.ID, date)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
		return
	}

	limit := 50
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l >= 1 && l <= 100 {
		limit = l
	}
	var beforeID *string
	if b := c.Query("before_id"); b != "" {
		beforeID = &b
	}
	result, err := h.Service.GetMessages(convID, user.ID, beforeID, limit)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *MessagesHandler) SendMessage(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	var req struct {
		Type           string  `json:"type"`
		Content        *string `json:"content"`
		ReplyToID      *string `json:"reply_to_id"`
		ThreadParentID *string `json:"thread_parent_id"`
		FileURL        *string `json:"file_url"`
		FileName       *string `json:"file_name"`
		FileSize       *int64  `json:"file_size"`
		IsEncrypted    bool    `json:"is_encrypted"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	if req.Type == "" {
		req.Type = "text"
	}

	msg, err := h.Service.CreateMessage(convID, user.ID, req.Type, req.Content, req.FileURL, req.FileName, req.FileSize, req.ReplyToID, req.ThreadParentID)
	if err == nil && req.IsEncrypted {
		database.DB.Model(&msg).Update("is_encrypted", true)
		msg.IsEncrypted = true
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		if req.ThreadParentID != nil && *req.ThreadParentID != "" {
			payload := gin.H{
				"parent_message_id": *req.ThreadParentID,
				"conversation_id":   convID,
				"reply":             msg,
			}
			for _, m := range conv.Members {
				h.WS.SendToUser(m.UserID, "thread:new_reply", payload)
			}
		} else {
			broadcast := struct {
				*models.Message
				ConversationType string `json:"conversation_type"`
			}{Message: msg, ConversationType: conv.Type}
			for _, m := range conv.Members {
				h.WS.SendToUser(m.UserID, "message:new", broadcast)
			}
		}
	}
	c.JSON(http.StatusCreated, msg)
}

func (h *MessagesHandler) GetThreadReplies(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	replies, err := h.Service.GetThreadReplies(msgID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, replies)
}

func (h *MessagesHandler) EditMessage(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	msg, err := h.Service.EditMessage(msgID, user.ID, req.Content)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	// broadcast edit to conversation
	conv, _ := h.Service.GetConversation(msg.ConversationID, user.ID)
	if conv != nil {
		payload := gin.H{
			"message_id":      msg.ID,
			"content":         msg.Content,
			"conversation_id": msg.ConversationID,
		}
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:edited", payload)
		}
	}
	c.JSON(http.StatusOK, msg)
}

func (h *MessagesHandler) DeleteMessage(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	msg, err := h.Service.DeleteMessage(msgID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(msg.ConversationID, user.ID)
	if conv != nil {
		payload := gin.H{
			"message_id":      msg.ID,
			"conversation_id": msg.ConversationID,
		}
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:deleted", payload)
		}
	}
	c.JSON(http.StatusOK, msg)
}

func (h *MessagesHandler) MarkRead(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.MarkAsRead(msgID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *MessagesHandler) MarkConversationRead(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	infos, err := h.Service.MarkConversationAsRead(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	// notify senders
	for _, info := range infos {
		h.WS.SendToUser(info.SenderID, "message:read_receipt", gin.H{
			"message_id": info.MessageID,
			"user_id":    user.ID,
			"status":     "read",
			"timestamp":  info.Timestamp,
		})
	}
	c.Status(http.StatusNoContent)
}

func (h *MessagesHandler) UploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "file is required"})
		return
	}
	mimeType := file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	result, err := utils.ValidateAndUpload(file, mimeType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *MessagesHandler) SearchMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": "query parameter 'q' is required"})
		return
	}
	user := middleware.CurrentUser(c)
	msgs, err := h.Service.SearchMessages(convID, user.ID, q)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

func (h *MessagesHandler) GetAttachments(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	page := 1
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p >= 1 {
		page = p
	}
	limit := 50
	if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l >= 1 && l <= 100 {
		limit = l
	}
	attachments, err := h.Service.GetAttachments(convID, user.ID, page, limit)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, attachments)
}

func (h *MessagesHandler) ReactToMessage(c *gin.Context) {
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	var req struct {
		Emoji string `json:"emoji" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	reactions, err := h.Service.ReactToMessage(msgID, user.ID, req.Emoji)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	// broadcast updated reactions to all conversation members
	convID, _ := h.Service.GetMessageConvID(msgID)
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		payload := gin.H{
			"message_id":      msgID,
			"conversation_id": convID,
			"reactions":       reactions,
		}
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:reacted", payload)
		}
	}
	c.JSON(http.StatusOK, gin.H{"reactions": reactions})
}

func (h *MessagesHandler) PinMessage(c *gin.Context) {
	convID := c.Param("conversation_id")
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	pin, err := h.Service.PinMessage(convID, msgID, user.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:pinned", gin.H{
				"conversation_id": convID,
				"pin":             pin,
			})
		}
	}
	c.JSON(http.StatusCreated, pin)
}

func (h *MessagesHandler) UnpinMessage(c *gin.Context) {
	convID := c.Param("conversation_id")
	msgID := c.Param("message_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.UnpinMessage(convID, msgID, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	conv, _ := h.Service.GetConversation(convID, user.ID)
	if conv != nil {
		for _, m := range conv.Members {
			h.WS.SendToUser(m.UserID, "message:unpinned", gin.H{
				"conversation_id": convID,
				"message_id":      msgID,
			})
		}
	}
	c.Status(http.StatusNoContent)
}

func (h *MessagesHandler) GetPinnedMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	pins, err := h.Service.GetPinnedMessages(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pins)
}

func (h *MessagesHandler) ScheduleMessage(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	var req struct {
		Type        string  `json:"type"`
		Content     *string `json:"content"`
		FileURL     *string `json:"file_url"`
		FileName    *string `json:"file_name"`
		FileSize    *int64  `json:"file_size"`
		ScheduledAt string  `json:"scheduled_at" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}
	scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": "scheduled_at must be RFC3339"})
		return
	}
	if req.Type == "" {
		req.Type = "text"
	}
	sm, err := h.Service.CreateScheduledMessage(convID, user.ID, req.Type, req.Content, req.FileURL, req.FileName, req.FileSize, scheduledAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, sm)
}

func (h *MessagesHandler) GetScheduledMessages(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)
	msgs, err := h.Service.GetScheduledMessages(convID, user.ID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, msgs)
}

func (h *MessagesHandler) DeleteScheduledMessage(c *gin.Context) {
	id := c.Param("scheduled_id")
	user := middleware.CurrentUser(c)
	if err := h.Service.DeleteScheduledMessage(id, user.ID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

type linkPreviewResult struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	SiteName    string `json:"site_name"`
}

var ogTitle = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']`)
var ogDesc = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']`)
var ogImage = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`)
var ogSite = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']`)
var titleTag = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)

var privateRanges = func() []net.IPNet {
	cidrs := []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"169.254.0.0/16", "127.0.0.0/8", "::1/128",
		"fc00::/7", "fe80::/10",
	}
	nets := make([]net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, _ := net.ParseCIDR(c)
		if n != nil {
			nets = append(nets, *n)
		}
	}
	return nets
}()

func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return true
	}
	for _, block := range privateRanges {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

func isSafeURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	addrs, err := net.LookupHost(parsed.Hostname())
	if err != nil || len(addrs) == 0 {
		return false
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip == nil || isPrivateIP(ip) {
			return false
		}
	}
	return true
}

func extractOG(body string, pattern *regexp.Regexp) string {
	if m := pattern.FindStringSubmatch(body); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func (h *MessagesHandler) GetLinkPreview(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": "url is required"})
		return
	}
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "invalid url"})
		return
	}
	if !isSafeURL(rawURL) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "url not allowed"})
		return
	}

	cacheKey := "linkpreview:" + rawURL

	// serve from Redis cache if available
	if store.RDB != nil {
		if cached, err := store.RDB.Get(context.Background(), cacheKey).Result(); err == nil {
			var result linkPreviewResult
			if json.Unmarshal([]byte(cached), &result) == nil {
				c.JSON(http.StatusOK, result)
				return
			}
		}
	}

	// Use a custom dialer that re-checks the resolved IP at connection time so
	// a DNS rebinding attack (TTL=0 domain flipping to a private IP after the
	// isSafeURL pre-flight) is blocked at the socket layer.
	safeTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("dns lookup failed for %s", host)
			}
			for _, ip := range ips {
				if isPrivateIP(ip.IP) {
					return nil, fmt.Errorf("resolved IP %s is not allowed", ip.IP)
				}
			}
			dialer := &net.Dialer{Timeout: 5 * time.Second}
			var lastErr error
			for _, ip := range ips {
				var conn net.Conn
				conn, lastErr = dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
				if lastErr == nil {
					return conn, nil
				}
			}
			return nil, lastErr
		},
	}
	client := &http.Client{Timeout: 5 * time.Second, Transport: safeTransport}
	req, _ := http.NewRequest("GET", rawURL, nil)
	req.Header.Set("User-Agent", "OrgChatBot/1.0 (link preview)")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		c.JSON(http.StatusOK, linkPreviewResult{URL: rawURL})
		return
	}
	defer resp.Body.Close()

	// Reject responses that declare themselves too large before reading the body.
	const maxBodyBytes = 50 * 1024
	if resp.ContentLength > maxBodyBytes {
		c.JSON(http.StatusOK, linkPreviewResult{URL: rawURL})
		return
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	body := string(bodyBytes)

	result := linkPreviewResult{
		URL:         rawURL,
		Title:       html.EscapeString(extractOG(body, ogTitle)),
		Description: html.EscapeString(extractOG(body, ogDesc)),
		Image:       extractOG(body, ogImage),
		SiteName:    html.EscapeString(extractOG(body, ogSite)),
	}
	if result.Title == "" {
		result.Title = html.EscapeString(extractOG(body, titleTag))
	}
	if result.SiteName == "" {
		result.SiteName = html.EscapeString(parsed.Host)
	}

	if store.RDB != nil {
		if b, err := json.Marshal(result); err == nil {
			store.RDB.Set(context.Background(), cacheKey, string(b), 24*time.Hour)
		}
	}

	c.JSON(http.StatusOK, result)
}

