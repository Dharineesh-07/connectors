package websocket

import (
	"encoding/json"
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

type Manager struct {
	mu          sync.RWMutex
	connections map[string]map[*websocket.Conn]*connEntry
	callTimers  map[string]*time.Timer

	// iceBufMu protects iceBuffers. Key is "callID:recipientUserID".
	// Candidates from joined participants (e.g. the caller) are buffered for
	// participants who have not yet answered so that the callee's peer
	// connection is fully configured before it receives candidates.
	iceBufMu   sync.Mutex
	iceBuffers map[string][]map[string]interface{}
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]map[*websocket.Conn]*connEntry),
		callTimers:  make(map[string]*time.Timer),
		iceBuffers:  make(map[string][]map[string]interface{}),
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
	for _, e := range entries {
		// Serialize writes per connection; Gorilla WebSocket forbids concurrent writers.
		e.mu.Lock()
		_ = e.conn.WriteMessage(websocket.TextMessage, payload)
		e.mu.Unlock()
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

func iceKey(callID, recipientID string) string { return callID + ":" + recipientID }

// BufferICECandidate stores a candidate payload for a recipient who has not
// yet joined the call. The payload must be the full map that would be sent
// as the event data (including user_id, candidate, etc.).
func (m *Manager) BufferICECandidate(callID, recipientID string, payload map[string]interface{}) {
	m.iceBufMu.Lock()
	defer m.iceBufMu.Unlock()
	key := iceKey(callID, recipientID)
	m.iceBuffers[key] = append(m.iceBuffers[key], payload)
}

// FlushICECandidates returns and removes all buffered candidates for a
// recipient, so the caller can deliver them now that the recipient has joined.
func (m *Manager) FlushICECandidates(callID, recipientID string) []map[string]interface{} {
	m.iceBufMu.Lock()
	defer m.iceBufMu.Unlock()
	key := iceKey(callID, recipientID)
	buffered := m.iceBuffers[key]
	delete(m.iceBuffers, key)
	return buffered
}

// ClearCallICEBuffers removes all buffered candidates for every participant
// of a call. Call this when a call ends or is rejected to avoid memory leaks.
func (m *Manager) ClearCallICEBuffers(callID string) {
	m.iceBufMu.Lock()
	defer m.iceBufMu.Unlock()
	prefix := callID + ":"
	for key := range m.iceBuffers {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			delete(m.iceBuffers, key)
		}
	}
}
