package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/orgchat/backend/config"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/models"
	"github.com/orgchat/backend/services"
	"github.com/orgchat/backend/sfu"
	"github.com/orgchat/backend/utils"
	ws "github.com/orgchat/backend/websocket"
	pion "github.com/pion/webrtc/v4"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		for _, allowed := range config.App.CORSOrigins {
			if origin == allowed {
				return true
			}
		}
		return false
	},
}

type WSHandler struct {
	WS          *ws.Manager
	MsgService  *services.MessageService
	CallService *services.CallService
	NotifSvc    *services.NotificationService
	SFU         *sfu.SFU
}

// callSession holds the per-connection WebRTC state: a writer that targets this
// exact socket and the SFU peers this connection owns (one per joined room).
type callSession struct {
	send  sfu.SendFunc
	peers map[string]*sfu.Peer
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

	// Keepalive: server pings every 54 s; client must pong within 60 s or
	// the read deadline fires and the connection is torn down. This ensures
	// zombie connections (e.g. browser tabs suspended after hours of idle)
	// are detected and cleaned up promptly.
	const pongWait = 60 * time.Second
	const pingPeriod = 54 * time.Second
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	h.WS.Register(user.ID, conn)
	defer h.WS.Unregister(user.ID, conn)

	// Ping goroutine — stopped when Connect returns (deferred close(stopPing)).
	stopPing := make(chan struct{})
	defer close(stopPing)
	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-stopPing:
				return
			case <-ticker.C:
				// Send the ping through the manager so it serialises with all
				// other writes to this connection (Gorilla forbids concurrent
				// writers); a raw write here races SendToConn/SendToUser during a
				// call and corrupts the frame stream, dropping the socket at ~60s.
				if err := h.WS.PingConn(user.ID, conn); err != nil {
					return
				}
			}
		}
	}()

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

	// Per-connection WebRTC session: signaling for this socket targets this
	// exact connection, and we track the SFU peers it owns so they can be torn
	// down when the socket closes.
	session := &callSession{
		send: func(eventType string, data interface{}) {
			h.WS.SendToConn(user.ID, conn, eventType, data)
		},
		peers: make(map[string]*sfu.Peer),
	}

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
		h.handleEvent(&user, session, event)
	}

	// Socket closed — tear down any SFU peers so forwarded tracks stop and the
	// remaining participants renegotiate.
	for _, p := range session.peers {
		p.Close()
	}

	// This connection is finished. Remove it now (rather than relying solely on
	// the deferred Unregister) so we can tell whether the user still has other
	// live tabs before we flip presence or tear down their calls.
	h.WS.Unregister(user.ID, conn)
	if h.WS.IsOnline(user.ID) {
		// Another tab/connection is still active — keep the user online and
		// leave any in-progress call untouched.
		return
	}

	// Fully disconnected — leave any active calls so we don't leave ghost
	// participants and "ongoing" calls that block future calls.
	h.cleanupUserCalls(&user)

	// disconnected — mark offline + update last_seen
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_online": false, "status": "offline", "last_seen": time.Now(),
	})
	user.IsOnline = false
	user.Status = "offline"
	h.broadcastPresence(&user, "user:offline")
}

// cleanupUserCalls leaves every active call the user is currently joined to.
// Called when the user's last connection drops so calls don't linger as
// "ongoing" and 1:1 peers are notified that the call ended.
func (h *WSHandler) cleanupUserCalls(user *models.User) {
	var participations []models.CallParticipant
	database.DB.
		Joins("JOIN calls ON calls.id = call_participants.call_id").
		Where("call_participants.user_id = ? AND call_participants.status = ? AND calls.status IN ?",
			user.ID, "joined", []string{"initiated", "ongoing"}).
		Find(&participations)

	for _, part := range participations {
		call, err := h.CallService.LeaveCall(part.CallID, user.ID)
		if err != nil {
			continue
		}
		ts := time.Now().UTC().Format(time.RFC3339)
		if call.Status == "ended" {
			h.WS.CancelCallTimer(call.ID)
			for _, p := range call.Participants {
				if p.UserID == user.ID {
					continue // about to be marked offline below
				}
				database.DB.Model(&models.User{}).Where("id = ?", p.UserID).Update("status", "online")
				h.WS.BroadcastPresenceChange(p.UserID, true, "online")
				h.WS.SendToUser(p.UserID, "call:ended", gin.H{
					"call_id":          call.ID,
					"ended_by":         user.ID,
					"duration_seconds": call.DurationSeconds,
					"timestamp":        ts,
				})
			}
		} else {
			leaverInfo := gin.H{"id": user.ID, "full_name": user.FullName, "avatar_url": user.AvatarURL}
			for _, p := range call.Participants {
				if p.UserID == user.ID {
					continue
				}
				h.WS.SendToUser(p.UserID, "call:participant_left", gin.H{
					"call_id":   call.ID,
					"user_id":   user.ID,
					"user":      leaverInfo,
					"timestamp": ts,
				})
				// call.InitiatedBy reflects any host reassignment done in LeaveCall.
				h.WS.SendToUser(p.UserID, "call:updated", gin.H{
					"call_id":         call.ID,
					"conversation_id": call.ConversationID,
					"initiated_by":    call.InitiatedBy,
					"timestamp":       ts,
				})
			}
		}
	}
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

func (h *WSHandler) handleEvent(user *models.User, sess *callSession, event inboundEvent) {
	switch event.Type {
	case "user:status":
		h.handleUserStatus(user, event.Data)
	case "message:typing":
		h.handleTyping(user, event.Data)
	case "message:read":
		h.handleMessageRead(user, event.Data)
	case "call:initiate":
		h.handleCallInitiate(user, event.Data)
	case "call:reject":
		h.handleCallReject(user, event.Data)
	case "call:end":
		h.handleCallEnd(user, event.Data)
	// ── WebRTC SFU signaling ──
	case "webrtc:join":
		h.handleWebRTCJoin(user, sess, event.Data)
	case "webrtc:answer":
		h.handleWebRTCAnswer(sess, event.Data)
	case "webrtc:ice":
		h.handleWebRTCICE(sess, event.Data)
	case "webrtc:leave":
		h.handleWebRTCLeave(sess, event.Data)
	case "call:signal":
		h.handleCallSignal(user, event.Data)
	case "whiteboard:stroke":
		h.handleWhiteboardStroke(user, event.Data)
	case "whiteboard:clear":
		h.handleWhiteboardClear(user, event.Data)
	case "whiteboard:shape":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:shape")
	case "whiteboard:note_add":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:note_add")
	case "whiteboard:note_move":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:note_move")
	case "whiteboard:note_edit":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:note_edit")
	case "whiteboard:note_delete":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:note_delete")
	case "whiteboard:cursor":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:cursor")
	case "whiteboard:cursor_leave":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:cursor_leave")
	case "whiteboard:text":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:text")
	case "whiteboard:image":
		h.relayWhiteboardEvent(user, event.Data, "whiteboard:image")
	}
}

// handleWebRTCJoin sets up this connection's server-side PeerConnection for a
// room. The SFU is the offerer, so the offer arrives back over "webrtc:offer".
func (h *WSHandler) handleWebRTCJoin(user *models.User, sess *callSession, data json.RawMessage) {
	var d struct {
		Room string `json:"room"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Room == "" {
		return
	}
	// A re-join (e.g. after a media glitch) replaces the stale peer.
	if existing := sess.peers[d.Room]; existing != nil {
		existing.Close()
		delete(sess.peers, d.Room)
	}
	peer, err := h.SFU.Join(d.Room, user.ID, sess.send)
	if err != nil {
		log.Printf("sfu: join room %s failed: %v", d.Room, err)
		return
	}
	sess.peers[d.Room] = peer
}

func (h *WSHandler) handleWebRTCAnswer(sess *callSession, data json.RawMessage) {
	var d struct {
		Room string `json:"room"`
		SDP  string `json:"sdp"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	if peer := sess.peers[d.Room]; peer != nil {
		if err := peer.HandleAnswer(d.SDP); err != nil {
			log.Printf("sfu: answer for room %s failed: %v", d.Room, err)
		}
	}
}

func (h *WSHandler) handleWebRTCICE(sess *callSession, data json.RawMessage) {
	var d struct {
		Room      string                `json:"room"`
		Candidate pion.ICECandidateInit `json:"candidate"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	if peer := sess.peers[d.Room]; peer != nil {
		_ = peer.HandleICE(d.Candidate)
	}
}

func (h *WSHandler) handleWebRTCLeave(sess *callSession, data json.RawMessage) {
	var d struct {
		Room string `json:"room"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}
	if peer := sess.peers[d.Room]; peer != nil {
		peer.Close()
		delete(sess.peers, d.Room)
	}
}

// handleCallSignal relays in-call signals (raise hand, reactions, mute state) to
// the other participants of the room.
func (h *WSHandler) handleCallSignal(user *models.User, data json.RawMessage) {
	var d struct {
		Room    string          `json:"room"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Room == "" {
		return
	}
	h.SFU.Broadcast(d.Room, "call:signal", gin.H{
		"room":    d.Room,
		"from":    user.ID,
		"payload": d.Payload,
	}, user.ID)
}

// BuildRoster is the SFU roster callback: it enriches the room's userIDs with
// display names/avatars and broadcasts them so each tile can be labelled.
func (h *WSHandler) BuildRoster(room string, userIDs []string) {
	participants := make([]gin.H, 0, len(userIDs))
	if len(userIDs) > 0 {
		var users []models.User
		database.DB.Where("id IN ?", userIDs).Find(&users)
		for _, u := range users {
			avatar := ""
			if u.AvatarURL != nil {
				avatar = *u.AvatarURL
			}
			name := u.FullName
			if u.DisplayName != nil && *u.DisplayName != "" {
				name = *u.DisplayName
			}
			participants = append(participants, gin.H{"id": u.ID, "name": name, "avatar": avatar})
		}
	}
	h.SFU.Broadcast(room, "call:roster", gin.H{"room": room, "participants": participants}, "")
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
	if err := json.Unmarshal(data, &d); err != nil || d.ConversationID == "" {
		return
	}
	// verify the sender is a member before fanning out (prevents enumeration)
	var senderMembership models.ConversationMember
	if err := database.DB.Where("conversation_id = ? AND user_id = ?", d.ConversationID, user.ID).First(&senderMembership).Error; err != nil {
		return
	}
	displayName := user.FullName
	if user.DisplayName != nil && *user.DisplayName != "" {
		displayName = *user.DisplayName
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "message:typing", gin.H{
			"user_id":         user.ID,
			"display_name":    displayName,
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
	// Call initiation (call:incoming notifications, busy status, 30-second
	// timeout) is now handled entirely by the REST InitiateCall handler so
	// it works even when the WebSocket is mid-reconnect. This handler is
	// intentionally a no-op and kept only for backward-compat with any
	// client still emitting the call:initiate event.
}

func (h *WSHandler) handleCallReject(user *models.User, data json.RawMessage) {
	var d struct {
		CallID string `json:"call_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.CallID == "" {
		return
	}

	now := time.Now()
	// Mark only this participant as having rejected the call.
	database.DB.Model(&models.CallParticipant{}).
		Where("call_id = ? AND user_id = ?", d.CallID, user.ID).
		Update("status", "rejected")

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
		h.WS.BroadcastPresenceChange(call.InitiatedBy, true, "online")
	}
}

// relayWhiteboardEvent is a generic helper that verifies membership and
// broadcasts any whiteboard event (with user_id injected) to other members.
func (h *WSHandler) relayWhiteboardEvent(user *models.User, data json.RawMessage, eventType string) {
	var d struct {
		ConversationID string `json:"conversation_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.ConversationID == "" {
		return
	}
	var membership models.ConversationMember
	if database.DB.Where("conversation_id = ? AND user_id = ?", d.ConversationID, user.ID).First(&membership).Error != nil {
		return
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	var payload map[string]interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		return
	}
	payload["user_id"] = user.ID
	for _, m := range members {
		h.WS.SendToUser(m.UserID, eventType, payload)
	}
}

func (h *WSHandler) handleWhiteboardStroke(user *models.User, data json.RawMessage) {
	var d struct {
		ConversationID string  `json:"conversation_id"`
		Tool           string  `json:"tool"`
		Color          string  `json:"color"`
		Size           float64 `json:"size"`
		From           struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"from"`
		To struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"to"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.ConversationID == "" {
		return
	}
	var membership models.ConversationMember
	if database.DB.Where("conversation_id = ? AND user_id = ?", d.ConversationID, user.ID).First(&membership).Error != nil {
		return
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	payload := map[string]interface{}{
		"conversation_id": d.ConversationID,
		"user_id":         user.ID,
		"tool":            d.Tool,
		"color":           d.Color,
		"size":            d.Size,
		"from":            map[string]float64{"x": d.From.X, "y": d.From.Y},
		"to":              map[string]float64{"x": d.To.X, "y": d.To.Y},
	}
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "whiteboard:stroke", payload)
	}
}

func (h *WSHandler) handleWhiteboardClear(user *models.User, data json.RawMessage) {
	var d struct {
		ConversationID string `json:"conversation_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.ConversationID == "" {
		return
	}
	var membership models.ConversationMember
	if database.DB.Where("conversation_id = ? AND user_id = ?", d.ConversationID, user.ID).First(&membership).Error != nil {
		return
	}
	var members []models.ConversationMember
	database.DB.Where("conversation_id = ? AND user_id != ?", d.ConversationID, user.ID).Find(&members)
	payload := map[string]interface{}{
		"conversation_id": d.ConversationID,
		"user_id":         user.ID,
	}
	for _, m := range members {
		h.WS.SendToUser(m.UserID, "whiteboard:clear", payload)
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
			h.WS.BroadcastPresenceChange(p.UserID, true, "online")
		}
		notifyIDs[p.UserID] = true
	}

	// reset initiator status
	database.DB.Model(&models.User{}).Where("id = ?", call.InitiatedBy).Update("status", "online")
	h.WS.BroadcastPresenceChange(call.InitiatedBy, true, "online")

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
