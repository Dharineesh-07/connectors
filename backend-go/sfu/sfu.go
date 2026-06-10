// Package sfu implements a minimal selective-forwarding unit (SFU) on top of
// pion/webrtc. Every client maintains a single PeerConnection to the SFU over
// which it both publishes its own media and subscribes to everyone else's.
//
// The design follows pion's canonical example-webrtc-applications/sfu-ws:
//   - The SERVER is always the offerer (the browser only ever creates answers),
//     which removes glare entirely.
//   - A publisher's incoming track (OnTrack) is copied packet-for-packet into a
//     TrackLocalStaticRTP that is added to every OTHER peer in the room.
//   - signalPeerConnections() reconciles each peer's senders against the room's
//     current track set and renegotiates (a fresh offer) whenever they drift.
//
// Forwarded tracks carry the publisher's userID as their RTP StreamID, so the
// browser groups a participant's audio+video into one MediaStream and the UI can
// label the tile. Signaling itself is relayed over the app's existing WebSocket
// (see handlers/websocket.go) — this package never touches the socket directly;
// it emits via a per-peer `send` callback.
package sfu

import (
	"errors"
	"log"
	"net"
	"sync"
	"time"

	"github.com/orgchat/backend/config"
	"github.com/pion/interceptor"
	"github.com/pion/logging"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

// SendFunc delivers a signaling event to the single client connection that owns
// a peer. Wired by the WebSocket handler to a connection-scoped writer.
type SendFunc func(event string, data interface{})

// signalMsg is one queued outbound signaling event for a peer.
type signalMsg struct {
	event string
	data  interface{}
}

// SFU owns the shared pion API (media engine + setting engine) and the set of
// active rooms.
type SFU struct {
	api      *webrtc.API
	mu       sync.RWMutex
	rooms    map[string]*Room
	rosterCb func(room string, userIDs []string) // notified when room membership changes
}

// Room is one call/meeting: a set of peers and the forwarded tracks among them.
type Room struct {
	sfu         *SFU
	name        string
	mu          sync.RWMutex
	peers       map[*Peer]struct{}
	trackLocals map[string]*webrtc.TrackLocalStaticRTP // local track ID -> forwarder
}

// Peer is one client's server-side PeerConnection within a room.
//
// Outbound signaling goes through a buffered channel drained by a dedicated
// writeLoop goroutine, so the actual (potentially blocking) socket write never
// happens while a room lock is held — a slow client can't stall the whole room.
// The channel also guarantees offers/answers/candidates are delivered in order.
type Peer struct {
	room    *Room
	userID  string
	pc      *webrtc.PeerConnection
	rawSend SendFunc
	sendCh  chan signalMsg
	closed  bool
	mu      sync.Mutex

	// renegotiate is a sticky "this peer's forwarded-track set changed, it needs a
	// fresh offer" flag. It is set when we add/remove a track and cleared only once
	// an offer is actually sent. Guarded by the owning Room's mutex (touched solely
	// inside signalPeerConnections, which holds r.mu).
	renegotiate bool
}

// send enqueues a signaling event for delivery by writeLoop. It is non-blocking
// and safe to call under a room lock. If the queue is full (a client that isn't
// draining signaling), the peer is dropped rather than blocking or reordering.
func (p *Peer) send(event string, data interface{}) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return
	}
	select {
	case p.sendCh <- signalMsg{event: event, data: data}:
	default:
		log.Printf("sfu: signaling queue full for user %s — dropping peer", p.userID)
		go p.Close()
	}
}

func (p *Peer) writeLoop() {
	for msg := range p.sendCh {
		p.rawSend(msg.event, msg.data)
	}
}

// New builds an SFU with default codecs/interceptors. The setting engine binds a
// fixed UDP mux port (config WEBRTC_UDP_PORT) when provided and advertises a
// NAT1To1 host IP (config WEBRTC_NAT_1TO1_IP) — both help media reach the SFU
// when it runs behind Docker/NAT. TURN (coturn) is the fallback relay.
func New() (*SFU, error) {
	mediaEngine := &webrtc.MediaEngine{}
	if err := mediaEngine.RegisterDefaultCodecs(); err != nil {
		return nil, err
	}

	interceptorRegistry := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(mediaEngine, interceptorRegistry); err != nil {
		return nil, err
	}

	settingEngine := webrtc.SettingEngine{}
	if ip := config.App.WebRTCNAT1To1IP; ip != "" {
		settingEngine.SetNAT1To1IPs([]string{ip}, webrtc.ICECandidateTypeHost)
	}
	if port := config.App.WebRTCUDPPort; port > 0 {
		udpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: port})
		if err != nil {
			log.Printf("sfu: failed to bind UDP mux on :%d: %v — falling back to ephemeral ports", port, err)
		} else {
			muxLogger := logging.NewDefaultLoggerFactory().NewLogger("ice")
			settingEngine.SetICEUDPMux(webrtc.NewICEUDPMux(muxLogger, udpConn))
			log.Printf("sfu: media UDP mux listening on :%d", port)
		}
	}

	api := webrtc.NewAPI(
		webrtc.WithMediaEngine(mediaEngine),
		webrtc.WithInterceptorRegistry(interceptorRegistry),
		webrtc.WithSettingEngine(settingEngine),
	)

	return &SFU{api: api, rooms: make(map[string]*Room)}, nil
}

// SetRosterCallback registers a hook invoked (off the hot path) whenever a
// room's membership changes. The handler uses it to enrich userIDs with
// names/avatars and broadcast a "call:roster" so tiles are labelled.
func (s *SFU) SetRosterCallback(cb func(room string, userIDs []string)) {
	s.rosterCb = cb
}

// Broadcast sends an event to every peer in a room, optionally skipping one
// user (e.g. the sender of a raise-hand / reaction signal).
func (s *SFU) Broadcast(room, event string, data interface{}, excludeUserID string) {
	s.mu.RLock()
	r := s.rooms[room]
	s.mu.RUnlock()
	if r == nil {
		return
	}
	r.mu.RLock()
	peers := make([]*Peer, 0, len(r.peers))
	for p := range r.peers {
		peers = append(peers, p)
	}
	r.mu.RUnlock()
	for _, p := range peers {
		if excludeUserID != "" && p.userID == excludeUserID {
			continue
		}
		p.send(event, data)
	}
}

// notifyRoster gathers the distinct userIDs currently in the room and fires the
// roster callback (if any) on its own goroutine.
func (r *Room) notifyRoster() {
	cb := r.sfu.rosterCb
	if cb == nil {
		return
	}
	r.mu.RLock()
	seen := make(map[string]struct{}, len(r.peers))
	ids := make([]string, 0, len(r.peers))
	for p := range r.peers {
		if _, ok := seen[p.userID]; ok {
			continue
		}
		seen[p.userID] = struct{}{}
		ids = append(ids, p.userID)
	}
	r.mu.RUnlock()
	go cb(r.name, ids)
}

// addPeerToRoom registers p in the named room (creating it if needed) and adds
// it to the peer set under s.mu — the same lock dropRoomIfEmpty takes — so a
// concurrent leave can't delete the room in the window between creating it and
// adding its first peer. Also sets p.room.
func (s *SFU) addPeerToRoom(name string, p *Peer) *Room {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.rooms[name]
	if !ok {
		r = &Room{
			sfu:         s,
			name:        name,
			peers:       make(map[*Peer]struct{}),
			trackLocals: make(map[string]*webrtc.TrackLocalStaticRTP),
		}
		s.rooms[name] = r
	}
	r.mu.Lock()
	r.peers[p] = struct{}{}
	r.mu.Unlock()
	p.room = r
	return r
}

func (s *SFU) dropRoomIfEmpty(r *Room) {
	r.mu.RLock()
	empty := len(r.peers) == 0
	r.mu.RUnlock()
	if !empty {
		return
	}
	s.mu.Lock()
	if cur, ok := s.rooms[r.name]; ok && cur == r {
		r.mu.RLock()
		if len(r.peers) == 0 {
			delete(s.rooms, r.name)
		}
		r.mu.RUnlock()
	}
	s.mu.Unlock()
}

// Join creates a server-side PeerConnection for a client and registers it in the
// named room. The returned Peer is used to feed in the client's answer and ICE
// candidates. `send` delivers offers/candidates back to that one client.
func (s *SFU) Join(room, userID string, send SendFunc) (*Peer, error) {
	if room == "" {
		return nil, errors.New("room required")
	}

	cfg := webrtc.Configuration{ICEServers: pionICEServers(userID)}
	pc, err := s.api.NewPeerConnection(cfg)
	if err != nil {
		return nil, err
	}

	// Recv-only transceivers so the client can publish audio (+video) by
	// attaching its local tracks when it answers our first offer.
	for _, kind := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeAudio, webrtc.RTPCodecTypeVideo} {
		if _, err := pc.AddTransceiverFromKind(kind, webrtc.RTPTransceiverInit{
			Direction: webrtc.RTPTransceiverDirectionRecvonly,
		}); err != nil {
			_ = pc.Close()
			return nil, err
		}
	}

	p := &Peer{userID: userID, pc: pc, rawSend: send, sendCh: make(chan signalMsg, 64), renegotiate: true}
	go p.writeLoop()

	// Register in the room before wiring callbacks (which reference the room) and
	// before negotiation can fire any of them.
	r := s.addPeerToRoom(room, p)

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		p.send("webrtc:ice", map[string]interface{}{
			"room":      r.name,
			"candidate": c.ToJSON(),
		})
	})

	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			p.Close()
		default:
		}
	})

	pc.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		log.Printf("sfu: OnTrack user=%s kind=%s id=%s", userID, track.Kind(), track.ID())
		local := r.addTrack(track, userID)
		if local == nil {
			return
		}
		defer r.removeTrack(local)

		// Periodically request a keyframe from the publisher so subscribers that
		// join mid-stream render video without a long black gap. Bound the ticker
		// to this track's lifetime so it stops the moment the track ends.
		stop := make(chan struct{})
		defer close(stop)
		if track.Kind() == webrtc.RTPCodecTypeVideo {
			go func() {
				ticker := time.NewTicker(3 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-stop:
						return
					case <-ticker.C:
						if err := pc.WriteRTCP([]rtcp.Packet{
							&rtcp.PictureLossIndication{MediaSSRC: uint32(track.SSRC())},
						}); err != nil {
							return
						}
					}
				}
			}()
		}

		buf := make([]byte, 1500)
		for {
			n, _, readErr := track.Read(buf)
			if readErr != nil {
				return
			}
			if _, writeErr := local.Write(buf[:n]); writeErr != nil {
				return
			}
		}
	})

	// Enforce a single active session per user per room: drop any earlier peer for
	// this user (a second tab/device, or a zombie left behind by a dropped socket)
	// so this connection cleanly supersedes it instead of splitting the user's
	// media across two server PeerConnections.
	r.closeOtherPeersForUser(p)

	r.signalPeerConnections()
	r.notifyRoster()
	return p, nil
}

// HandleAnswer applies the client's SDP answer to the server PeerConnection. The
// peer is stable again afterwards, so it re-runs reconciliation: any renegotiation
// that was deferred while this offer was in flight now goes out.
func (p *Peer) HandleAnswer(sdp string) error {
	if err := p.pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  sdp,
	}); err != nil {
		return err
	}
	if p.room != nil {
		p.room.signalPeerConnections()
	}
	return nil
}

// HandleICE adds a trickled ICE candidate from the client.
func (p *Peer) HandleICE(candidate webrtc.ICECandidateInit) error {
	return p.pc.AddICECandidate(candidate)
}

// Close tears down the peer and renegotiates the rest of the room.
func (p *Peer) Close() {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	p.closed = true
	close(p.sendCh) // stops writeLoop; send() is guarded by p.closed so it won't write to a closed channel
	p.mu.Unlock()

	r := p.room
	r.mu.Lock()
	delete(r.peers, p)
	r.mu.Unlock()

	_ = p.pc.Close()
	r.signalPeerConnections()
	r.notifyRoster()
	r.sfu.dropRoomIfEmpty(r)
}

// closeOtherPeersForUser drops every peer in the room that belongs to the same
// user as keep — a second tab/device or a zombie left by a dropped socket — so a
// fresh join supersedes the stale session rather than fighting it for media.
func (r *Room) closeOtherPeersForUser(keep *Peer) {
	r.mu.RLock()
	var stale []*Peer
	for p := range r.peers {
		if p != keep && p.userID == keep.userID {
			stale = append(stale, p)
		}
	}
	r.mu.RUnlock()
	for _, p := range stale {
		p.Close()
	}
}

// UserID exposes the owning user (used by the handler for roster building).
func (p *Peer) UserID() string { return p.userID }

// addTrack registers a forwarder for an incoming publisher track. The forwarder
// carries the publisher's userID as StreamID so the browser groups the
// participant's media and the SFU can avoid echoing it back to the publisher.
func (r *Room) addTrack(t *webrtc.TrackRemote, userID string) *webrtc.TrackLocalStaticRTP {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.signalPeerConnections()
	}()

	id := userID + "-" + t.ID()
	local, err := webrtc.NewTrackLocalStaticRTP(t.Codec().RTPCodecCapability, id, userID)
	if err != nil {
		log.Printf("sfu: NewTrackLocalStaticRTP: %v", err)
		return nil
	}
	r.trackLocals[id] = local
	return local
}

func (r *Room) removeTrack(local *webrtc.TrackLocalStaticRTP) {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.signalPeerConnections()
	}()
	delete(r.trackLocals, local.ID())
}

// signalPeerConnections reconciles, for every peer, the set of tracks it is
// sending against the room's current track set, then sends a fresh offer when
// anything changed. Mirrors pion sfu-ws (retry with backoff to avoid spinning
// while a PeerConnection is mid-negotiation).
func (r *Room) signalPeerConnections() {
	r.mu.Lock()
	defer func() {
		r.mu.Unlock()
		r.dispatchKeyFrame()
	}()

	attemptSync := func() (tryAgain bool) {
		for p := range r.peers {
			if p.pc.ConnectionState() == webrtc.PeerConnectionStateClosed {
				delete(r.peers, p)
				return true
			}

			// Tracks we already forward to this peer; also drop senders whose
			// source track has gone away. Any change marks the peer for re-offer.
			existing := map[string]bool{}
			for _, sender := range p.pc.GetSenders() {
				if sender.Track() == nil {
					continue
				}
				existing[sender.Track().ID()] = true
				if _, ok := r.trackLocals[sender.Track().ID()]; !ok {
					if err := p.pc.RemoveTrack(sender); err != nil {
						return true
					}
					p.renegotiate = true
				}
			}

			// Add room tracks not yet forwarded — skipping this peer's own
			// published media (StreamID == userID).
			for trackID, local := range r.trackLocals {
				if existing[trackID] {
					continue
				}
				if local.StreamID() == p.userID {
					continue
				}
				if _, err := p.pc.AddTrack(local); err != nil {
					return true
				}
				p.renegotiate = true
			}

			// Only offer when something actually changed for this peer — avoids
			// spamming every peer on every join/leave.
			if !p.renegotiate {
				continue
			}
			// Never clobber an in-flight offer: if the peer hasn't answered the
			// previous one yet, leave renegotiate set and re-offer once it does
			// (HandleAnswer re-runs this). This is what prevents the offer/answer
			// glare that otherwise leaves media one-way or black.
			if p.pc.SignalingState() != webrtc.SignalingStateStable {
				continue
			}

			offer, err := p.pc.CreateOffer(nil)
			if err != nil {
				return true
			}
			if err := p.pc.SetLocalDescription(offer); err != nil {
				return true
			}
			p.renegotiate = false
			p.send("webrtc:offer", map[string]interface{}{
				"room": r.name,
				"sdp":  offer.SDP,
			})
		}
		return false
	}

	for attempt := 0; ; attempt++ {
		if attempt == 25 {
			// Give negotiation room to settle, then retry.
			go func() {
				time.Sleep(3 * time.Second)
				r.signalPeerConnections()
			}()
			return
		}
		if !attemptSync() {
			return
		}
	}
}

// dispatchKeyFrame asks every publisher for a fresh keyframe so newly-subscribed
// peers render video quickly.
func (r *Room) dispatchKeyFrame() {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for p := range r.peers {
		for _, receiver := range p.pc.GetReceivers() {
			if receiver.Track() == nil {
				continue
			}
			_ = p.pc.WriteRTCP([]rtcp.Packet{
				&rtcp.PictureLossIndication{MediaSSRC: uint32(receiver.Track().SSRC())},
			})
		}
	}
}

func pionICEServers(userID string) []webrtc.ICEServer {
	src := config.App.ICEServers(userID)
	out := make([]webrtc.ICEServer, 0, len(src))
	for _, s := range src {
		out = append(out, webrtc.ICEServer{
			URLs:       s.URLs,
			Username:   s.Username,
			Credential: s.Credential,
		})
	}
	return out
}
