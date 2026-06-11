package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// connEntry wraps a connection with its own write mutex so concurrent
// SendToUser calls for the same user never race on WriteMessage.
type connEntry struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// writeWait bounds every write (data frames and keepalive pings) so a stuck
// socket can't block a writer indefinitely.
const writeWait = 10 * time.Second

type Manager struct {
	mu          sync.RWMutex
	connections map[string]map[*websocket.Conn]*connEntry
	callTimers  map[string]*time.Timer
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]map[*websocket.Conn]*connEntry),
		callTimers:  make(map[string]*time.Timer),
	}
}

func (m *Manager) Register(userID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.connections[userID] == nil {
		m.connections[userID] = make(map[*websocket.Conn]*connEntry)
	}
	m.connections[userID][conn] = &connEntry{conn: conn}
}

func (m *Manager) Unregister(userID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if conns, ok := m.connections[userID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(m.connections, userID)
		}
	}
}

func (m *Manager) IsOnline(userID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conns, ok := m.connections[userID]
	return ok && len(conns) > 0
}

func (m *Manager) OnlineUsers() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	users := make([]string, 0, len(m.connections))
	for uid := range m.connections {
		users = append(users, uid)
	}
	return users
}

func (m *Manager) SendToUser(userID, eventType string, data interface{}) {
	// Snapshot entries while holding the read lock so Unregister cannot
	// delete map keys while we iterate.
	m.mu.RLock()
	src := m.connections[userID]
	entries := make([]*connEntry, 0, len(src))
	for _, e := range src {
		entries = append(entries, e)
	}
	m.mu.RUnlock()

	payload, _ := json.Marshal(Event{Type: eventType, Data: data})
	var failed []*websocket.Conn
	for _, e := range entries {
		// Serialize writes per connection; Gorilla WebSocket forbids concurrent writers.
		e.mu.Lock()
		e.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := e.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			log.Printf("ws: failed to send %q to user %s: %v", eventType, userID, err)
			e.conn.Close()
			failed = append(failed, e.conn)
		}
		e.mu.Unlock()
	}
	// Unregister outside the write loop so Unregister (which takes m.mu.Lock)
	// is never called while e.mu is still held, avoiding a lock-ordering hazard.
	for _, conn := range failed {
		m.Unregister(userID, conn)
	}
}

func (m *Manager) SendToUsers(userIDs []string, eventType string, data interface{}) {
	for _, uid := range userIDs {
		m.SendToUser(uid, eventType, data)
	}
}

func (m *Manager) Broadcast(eventType string, data interface{}) {
	m.mu.RLock()
	ids := make([]string, 0, len(m.connections))
	for uid := range m.connections {
		ids = append(ids, uid)
	}
	m.mu.RUnlock()

	for _, uid := range ids {
		m.SendToUser(uid, eventType, data)
	}
}

func (m *Manager) SetCallTimer(callID string, t *time.Timer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callTimers[callID] = t
}

func (m *Manager) CancelCallTimer(callID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t, ok := m.callTimers[callID]; ok {
		t.Stop()
		delete(m.callTimers, callID)
	}
}

// SendToConn delivers an event to a single WebSocket connection of a user
// (rather than every tab). The SFU uses this to route an offer / ICE candidate
// back to the exact connection that owns the peer.
func (m *Manager) SendToConn(userID string, conn *websocket.Conn, eventType string, data interface{}) {
	m.mu.RLock()
	entry := m.connections[userID][conn]
	m.mu.RUnlock()
	if entry == nil {
		return
	}
	payload, _ := json.Marshal(Event{Type: eventType, Data: data})
	entry.mu.Lock()
	entry.conn.SetWriteDeadline(time.Now().Add(writeWait))
	writeErr := entry.conn.WriteMessage(websocket.TextMessage, payload)
	if writeErr != nil {
		entry.conn.Close()
	}
	entry.mu.Unlock()
	if writeErr != nil {
		log.Printf("ws: failed to send %q to a connection of user %s: %v", eventType, userID, writeErr)
		m.Unregister(userID, conn)
	}
}

// PingConn sends a WebSocket ping under the same per-connection lock as every
// other write. Without this the keepalive goroutine would write concurrently with
// SendToUser/SendToConn (Gorilla forbids concurrent writers), corrupting the frame
// stream — which drops the socket ~1 ping interval into a busy call.
func (m *Manager) PingConn(userID string, conn *websocket.Conn) error {
	m.mu.RLock()
	entry := m.connections[userID][conn]
	m.mu.RUnlock()
	if entry == nil {
		return nil
	}
	entry.mu.Lock()
	defer entry.mu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(writeWait))
	return conn.WriteMessage(websocket.PingMessage, nil)
}

// BroadcastPresenceChange notifies all connected users (except the target) that
// a user's status has changed. Used after call start/end to push busy/online transitions.
func (m *Manager) BroadcastPresenceChange(userID string, online bool, status string) {
	payload := map[string]interface{}{
		"user_id":   userID,
		"online":    online,
		"status":    status,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	for _, uid := range m.OnlineUsers() {
		if uid != userID {
			m.SendToUser(uid, "user:presence", payload)
		}
	}
}
