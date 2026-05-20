package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/utils"
	ws "github.com/orgchat/backend/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	WS          *ws.Manager
	MsgService  *services.MessageService
	CallService *services.CallService
	NotifSvc    *services.NotificationService
}

type inboundEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

func (h *WSHandler) Connect(c *gin.Context) {
	tokenStr := c.Query("token")
	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "missing token"})
		return
	}
	claims, err := utils.DecodeToken(tokenStr)
	if err != nil || claims.Type != "access" {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "invalid token"})
		return
	}
	var user models.User
	if err := database.DB.Where("id = ? AND is_active = ?", claims.Sub, true).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "user not found"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	defer conn.Close()

	h.WS.Register(user.ID, conn)
	defer h.WS.Unregister(user.ID, conn)

	// mark online + update last_seen
	now := time.Now()
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_online": true, "status": "online", "last_seen": now,
	})
	// Reflect the saved values on the local struct so broadcastPresence sends accurate state.
	user.IsOnline = true
	user.Status = "online"
	h.MsgService.MarkAllDelivered(user.ID)

	// send connection:established
	h.WS.SendToUser(user.ID, "connection:established", gin.H{
		"user_id":   user.ID,
		"timestamp": now.UTC().Format(time.RFC3339),
	})

	// send presence:snapshot — list of already-online contacts
	onlineIDs := h.WS.OnlineUsers()
	var onlineUsers []map[string]interface{}
	for _, uid := range onlineIDs {
		if uid == user.ID {
			continue
		}
		var u models.User
		if database.DB.First(&u, "id = ?", uid).Error == nil {
			onlineUsers = append(onlineUsers, map[string]interface{}{
				"user_id": u.ID, "status": u.Status,
			})
		}
	}
	if onlineUsers == nil {
		onlineUsers = []map[string]interface{}{}
	}
	h.WS.SendToUser(user.ID, "presence:snapshot", gin.H{
		"users":     onlineUsers,
		"timestamp": now.UTC().Format(time.RFC3339),
	})

	// broadcast user came online to everyone else
	h.broadcastPresence(&user, "user:online")

	// read loop
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var event inboundEvent
		if err := json.Unmarshal(raw, &event); err != nil {
			continue
		}
		h.handleEvent(&user, event)
	}

	// disconnected — mark offline + update last_seen
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_online": false, "status": "offline", "last_seen": time.Now(),
	})
	user.IsOnline = false
	user.Status = "offline"
	h.broadcastPresence(&user, "user:offline")
}

func (h *WSHandler) broadcastPresence(user *models.User, eventType string) {
	payload := gin.H{
		"user_id":   user.ID,
		"online":    user.IsOnline,
		"status":    user.Status,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	// send to all other connected users
	for _, uid := range h.WS.OnlineUsers() {
		if uid != user.ID {
			h.WS.SendToUser(uid, eventType, payload)
		}
	}
}

func (h *WSHandler) handleEvent(user *models.User, event inboundEvent) {
	switch event.Type {
	case "user:status":
		h.handleUserStatus(user, event.Data)
	case "message:typing":
		h.handleTyping(user, event.Data)
	case "message:read":
		h.handleMessageRead(user, event.Data)
	case "call:initiate":
		h.handleCallInitiate(user, event.Data)
	case "call:answer":
		h.handleCallAnswer(user, event.Data)
	case "call:reject":
		h.handleCallReject(user, event.Data)
	case "call:ice-candidate":
		h.handleICECandidate(user, event.Data)
	case "call:end":
		h.handleCallEnd(user, event.Data)
	case "call:join":
		h.handleCallJoin(user, event.Data)
	case "call:screen-share":
		h.handleScreenShare(user, event.Data)
	case "call:camera-toggle":
		h.handleCameraToggle(user, event.Data)
	case "call:peer_offer":
		h.handlePeerOffer(user, event.Data)
	case "call:peer_answer":
		h.handlePeerAnswer(user, event.Data)
	}
}

func (h *WSHandler) handleUserStatus(user *models.User, data json.RawMessage) {
	var d struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Status == "" {
		return
	}
	// never downgrade an active call's busy status
	if user.Status == "busy" {
		return
	}
	database.DB.Model(user).Update("status", d.Status)
	user.Status = d.Status
	h.broadcastPresence(user, "user:presence")
}

func (h *WSHandler) handleTyping(user *models.User, data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversation_id"`
		IsTyping       bool   `json:"is_typing"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "message:typing", gin.H{
			"user_id":         user.ID,
			"conversation_id": d.ConversationID,
			"is_typing":       d.IsTyping,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handleMessageRead(user *models.User, data json.RawMessage) {
	var d struct {
		MessageID string `json:"message_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	if err := h.MsgService.MarkAsRead(d.MessageID, user.ID); err != nil {
		return
	}
	var msg models.Message
	if database.DB.First(&msg, "id = ?", d.MessageID).Error == nil {
		h.WS.SendToUser(msg.SenderID, "message:read_receipt", gin.H{
			"message_id": d.MessageID,
			"user_id":    user.ID,
			"status":     "read",
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handleCallInitiate(user *models.User, data json.RawMessage) {
	var d struct {
		CallID         string      `json:"call_id"`
		ConversationID string      `json:"conversation_id"`
		Type           string      `json:"type"`
		OfferSDP       interface{} `json:"offer_sdp"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}

	var call models.Call
	if database.DB.First(&call, "id = ?", d.CallID).Error != nil {
		return
	}

	// set caller status to busy
	database.DB.Model(user).Update("status", "busy")
	user.Status = "busy"
	h.broadcastPresence(user, "user:presence")

	callerInfo := gin.H{
		"id":        user.ID,
		"full_name": user.FullName,
		"avatar_url": user.AvatarURL,
	}

	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "call:incoming", gin.H{
			"call_id":         call.ID,
			"caller":          callerInfo,
			"type":            call.Type,
			"offer_sdp":       d.OfferSDP,
			"conversation_id": d.ConversationID,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		})
	}

	// 30-second unanswered timeout
	timer := time.AfterFunc(30*time.Second, func() {
		var c models.Call
		if database.DB.First(&c, "id = ?", d.CallID).Error != nil {
			return
		}
		if c.Status == "initiated" {
			now := time.Now()
			database.DB.Model(&c).Updates(map[string]interface{}{
				"status": "missed", "ended_at": now,
			})
			database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("status", "online")
			database.DB.Model(&models.CallParticipant{}).Where("call_id = ?", d.CallID).
				Where("status IN ?", []string{"invited", "missed"}).Update("status", "missed")

			timeoutPayload := gin.H{
				"call_id":   d.CallID,
				"message":   "User did not respond to the call",
				"timestamp": now.UTC().Format(time.RFC3339),
			}
			h.WS.SendToUser(user.ID, "call:timeout", timeoutPayload)
			for _, m := range members {
				h.WS.SendToUser(m.UserID, "call:timeout", gin.H{
					"call_id":   d.CallID,
					"timestamp": now.UTC().Format(time.RFC3339),
				})
			}
		}
	})
	h.WS.SetCallTimer(d.CallID, timer)
}

func (h *WSHandler) handleCallAnswer(user *models.User, data json.RawMessage) {
	var d struct {
		CallID    string      `json:"call_id"`
		AnswerSDP interface{} `json:"answer_sdp"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}
	h.WS.CancelCallTimer(d.CallID)

	now := time.Now()
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND user_id = ?", d.CallID, user.ID).
		Updates(map[string]interface{}{"status": "joined", "joined_at": now})
	database.DB.Model(&models.Call{}).Where("id = ?", d.CallID).Update("status", "ongoing")
	database.DB.Model(user).Update("status", "busy")
	user.Status = "busy"
	h.broadcastPresence(user, "user:presence")

	answererInfo := gin.H{
		"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL,
	}

	// notify initiator
	var call models.Call
	if database.DB.First(&call, "id = ?", d.CallID).Error == nil {
		h.WS.SendToUser(call.InitiatedBy, "call:answered", gin.H{
			"call_id":    d.CallID,
			"user_id":    user.ID,
			"user":       answererInfo,
			"answer_sdp": d.AnswerSDP,
			"timestamp":  now.UTC().Format(time.RFC3339),
		})

		// Flush any ICE candidates that were buffered for the answerer while
		// their peer connection did not exist yet. These are sent NOW because
		// answerCall() has already called setRemoteDescription(offer) and
		// setLocalDescription(answer) before emitting call:answer, so the
		// callee's PC is fully configured and can apply the candidates.
		for _, p := range h.WS.FlushICECandidates(d.CallID, user.ID) {
			h.WS.SendToUser(user.ID, "call:ice-candidate", p)
		}
	}

	// Determine whether this is the first answerer. When B is the first answerer,
	// A (initiator) handles the direct connection via call:answered using its
	// pendingPC. Sending call:participant_joined to A at the same time causes a
	// race: call:answered does an async setRemoteDescription that yields the JS
	// event loop, so call:participant_joined fires first, finds pcsRef[B] empty,
	// and creates a second PC — which then destroys B's original valid PC for A
	// (via buildPCForPeer's close() call), breaking A's media path to B entirely.
	// For 2nd+ answerers A's pendingPC is already consumed, so A legitimately
	// needs call:participant_joined to open a fresh peer connection to the new joiner.
	var otherJoinedCount int64
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND status = ? AND user_id NOT IN ?",
			d.CallID, "joined", []string{user.ID, call.InitiatedBy}).
		Count(&otherJoinedCount)
	isFirstAnswerer := otherJoinedCount == 0

	// notify all other joined participants so they can open a P2P connection
	var joinedParticipants []models.CallParticipant
	database.DB.Where("call_id = ? AND status = ? AND user_id != ?", d.CallID, "joined", user.ID).
		Find(&joinedParticipants)
	for _, p := range joinedParticipants {
		if isFirstAnswerer && p.UserID == call.InitiatedBy {
			continue
		}
		h.WS.SendToUser(p.UserID, "call:participant_joined", gin.H{
			"call_id":   d.CallID,
			"user_id":   user.ID,
			"user":      answererInfo,
			"timestamp": now.UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handleCallReject(user *models.User, data json.RawMessage) {
	var d struct {
		CallID string `json:"call_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}
	h.WS.ClearCallICEBuffers(d.CallID)

	now := time.Now()
	// Mark only this participant as having rejected the call.
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND user_id = ?", d.CallID, user.ID).
		Update("status", "missed")

	var call models.Call
	if database.DB.First(&call, "id = ?", d.CallID).Error != nil {
		return
	}

	rejectPayload := gin.H{
		"call_id":   d.CallID,
		"user_id":   user.ID,
		"timestamp": now.UTC().Format(time.RFC3339),
	}
	h.WS.SendToUser(call.InitiatedBy, "call:rejected", rejectPayload)
	if user.ID != call.InitiatedBy {
		h.WS.SendToUser(user.ID, "call:rejected", rejectPayload)
	}

	// End the call only when no joined participants remain (group call) or it
	// is a direct (1:1) call — mirrors the LeaveCall service logic.
	var conv models.Conversation
	isDirectCall := false
	if database.DB.First(&conv, "id = ?", call.ConversationID).Error == nil {
		isDirectCall = conv.Type == "direct"
	}

	var remainingJoined int64
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND status = ? AND user_id != ?", d.CallID, "joined", user.ID).
		Count(&remainingJoined)

	if remainingJoined == 0 || isDirectCall {
		h.WS.CancelCallTimer(d.CallID)
		database.DB.Model(&models.Call{}).Where("id = ?", d.CallID).Updates(map[string]interface{}{
			"status": "missed", "ended_at": now,
		})
		database.DB.Model(&models.User{}).Where("id = ?", call.InitiatedBy).Update("status", "online")
	}
}

func (h *WSHandler) handleICECandidate(user *models.User, data json.RawMessage) {
	var d struct {
		CallID       string      `json:"call_id"`
		TargetUserID *string     `json:"target_user_id"`
		Candidate    interface{} `json:"candidate"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	payload := map[string]interface{}{
		"call_id":   d.CallID,
		"user_id":   user.ID,
		"candidate": d.Candidate,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	if d.TargetUserID != nil && *d.TargetUserID != "" {
		h.WS.SendToUser(*d.TargetUserID, "call:ice-candidate", payload)
		return
	}

	// Relay to all other participants.
	// Participants who have not yet answered (status != "joined") cannot apply
	// candidates — their peer connection does not exist yet. Buffer for them
	// and flush when they answer (see handleCallAnswer).
	var call models.Call
	if database.DB.First(&call, "id = ?", d.CallID).Error != nil {
		return
	}
	var participants []models.CallParticipant
	database.DB.Where("call_id = ? AND user_id != ?", d.CallID, user.ID).Find(&participants)
	notified := map[string]bool{}
	for _, p := range participants {
		if notified[p.UserID] {
			continue
		}
		notified[p.UserID] = true
		if p.Status == "joined" {
			h.WS.SendToUser(p.UserID, "call:ice-candidate", payload)
		} else {
			h.WS.BufferICECandidate(d.CallID, p.UserID, payload)
		}
	}
	if !notified[call.InitiatedBy] && call.InitiatedBy != user.ID {
		// Initiator is always "joined" (set in InitiateCall service).
		h.WS.SendToUser(call.InitiatedBy, "call:ice-candidate", payload)
	}
}

func (h *WSHandler) handleCallEnd(user *models.User, data json.RawMessage) {
	var d struct {
		CallID string `json:"call_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}
	h.WS.CancelCallTimer(d.CallID)
	h.WS.ClearCallICEBuffers(d.CallID)

	var call models.Call
	if database.DB.Preload("Participants").First(&call, "id = ?", d.CallID).Error != nil {
		return
	}

	now := time.Now()
	duration := int(now.Sub(call.StartedAt).Seconds())
	if duration < 0 {
		duration = 0
	}
	database.DB.Model(&call).Updates(map[string]interface{}{
		"status": "ended", "ended_at": now, "duration_seconds": duration,
	})

	// collect all participant IDs to notify (joined + still ringing)
	notifyIDs := map[string]bool{}
	for _, p := range call.Participants {
		if p.Status == "joined" {
			database.DB.Model(&p).Updates(map[string]interface{}{"left_at": now, "status": "left"})
			database.DB.Model(&models.User{}).Where("id = ?", p.UserID).Update("status", "online")
		}
		notifyIDs[p.UserID] = true
	}

	// reset initiator status
	database.DB.Model(&models.User{}).Where("id = ?", call.InitiatedBy).Update("status", "online")

	endedPayload := gin.H{
		"call_id":          d.CallID,
		"ended_by":         user.ID,
		"duration_seconds": duration,
		"timestamp":        now.UTC().Format(time.RFC3339),
	}
	for uid := range notifyIDs {
		if uid != user.ID {
			h.WS.SendToUser(uid, "call:ended", endedPayload)
		}
	}
}

func (h *WSHandler) handleCallJoin(user *models.User, data json.RawMessage) {
	var d struct {
		CallID string `json:"call_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}
	now := time.Now()
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND user_id = ?", d.CallID, user.ID).
		Updates(map[string]interface{}{"status": "joined", "joined_at": now})
	database.DB.Model(user).Update("status", "busy")
	user.Status = "busy"
	h.broadcastPresence(user, "user:presence")

	joiningInfo := gin.H{"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL}

	var joinedParticipants []models.CallParticipant
	database.DB.Where("call_id = ? AND status = ? AND user_id != ?", d.CallID, "joined", user.ID).
		Find(&joinedParticipants)
	for _, p := range joinedParticipants {
		h.WS.SendToUser(p.UserID, "call:participant_joined", gin.H{
			"call_id":   d.CallID,
			"user_id":   user.ID,
			"user":      joiningInfo,
			"timestamp": now.UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handleScreenShare(user *models.User, data json.RawMessage) {
	var d struct {
		CallID    string `json:"call_id"`
		IsSharing bool   `json:"is_sharing"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	var joinedParticipants []models.CallParticipant
	database.DB.Where("call_id = ? AND status = ? AND user_id != ?", d.CallID, "joined", user.ID).
		Find(&joinedParticipants)
	for _, p := range joinedParticipants {
		h.WS.SendToUser(p.UserID, "call:screen-share", gin.H{
			"call_id":    d.CallID,
			"user_id":    user.ID,
			"is_sharing": d.IsSharing,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handleCameraToggle(user *models.User, data json.RawMessage) {
	var d struct {
		CallID   string `json:"call_id"`
		CameraOn bool   `json:"camera_on"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	var joinedParticipants []models.CallParticipant
	database.DB.Where("call_id = ? AND status = ? AND user_id != ?", d.CallID, "joined", user.ID).
		Find(&joinedParticipants)
	for _, p := range joinedParticipants {
		h.WS.SendToUser(p.UserID, "call:camera-toggle", gin.H{
			"call_id":   d.CallID,
			"user_id":   user.ID,
			"camera_on": d.CameraOn,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (h *WSHandler) handlePeerOffer(user *models.User, data json.RawMessage) {
	var d struct {
		TargetUserID string      `json:"target_user_id"`
		CallID       string      `json:"call_id"`
		OfferSDP     interface{} `json:"offer_sdp"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.TargetUserID == "" {
		return
	}
	senderInfo := gin.H{"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL}
	h.WS.SendToUser(d.TargetUserID, "call:peer_offer", gin.H{
		"call_id":      d.CallID,
		"from_user_id": user.ID,
		"from_user":    senderInfo,
		"offer_sdp":    d.OfferSDP,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *WSHandler) handlePeerAnswer(user *models.User, data json.RawMessage) {
	var d struct {
		TargetUserID string      `json:"target_user_id"`
		CallID       string      `json:"call_id"`
		AnswerSDP    interface{} `json:"answer_sdp"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.TargetUserID == "" {
		return
	}
	h.WS.SendToUser(d.TargetUserID, "call:peer_answer", gin.H{
		"call_id":      d.CallID,
		"from_user_id": user.ID,
		"answer_sdp":   d.AnswerSDP,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}
