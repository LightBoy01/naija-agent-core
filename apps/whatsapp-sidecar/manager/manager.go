package manager

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"

	"github.com/naija-agent/whatsapp-sidecar/queue"
)

type Manager struct {
	container        *sqlstore.Container
	db               *sql.DB // PostgreSQL connection for org config
	publisher        *queue.Publisher
	clients          map[string]*whatsmeow.Client
	sessionStartAt   map[string]time.Time // when each org's session was last established (pair/connect)
	mu               sync.RWMutex
	log              waLog.Logger
}

func NewManager(container *sqlstore.Container, db *sql.DB, publisher *queue.Publisher) *Manager {
	mgr := &Manager{
		container:        container,
		db:               db,
		publisher:        publisher,
		clients:          make(map[string]*whatsmeow.Client),
		sessionStartAt:   make(map[string]time.Time),
		log:              waLog.Stdout("Manager", "INFO", true),
	}
	// Automatically load existing sessions
	go mgr.LoadSessions()
	return mgr
}

func (m *Manager) GetClients() []*whatsmeow.Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	clients := make([]*whatsmeow.Client, 0, len(m.clients))
	for _, client := range m.clients {
		clients = append(clients, client)
	}
	return clients
}

func (m *Manager) GetClient(orgID string) (*whatsmeow.Client, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, exists := m.clients[orgID]
	if !exists {
		return nil, fmt.Errorf("client for org %s not found", orgID)
	}
	if !client.IsConnected() {
		return nil, fmt.Errorf("client for org %s exists but is not connected", orgID)
	}
	if !client.IsLoggedIn() {
		return nil, fmt.Errorf("client for org %s is connected but not logged in", orgID)
	}
	return client, nil
}

func (m *Manager) getProxyForOrg(orgID string) string {
	var proxyURL string
	err := m.db.QueryRow("SELECT proxy_url FROM organizations WHERE id = $1", orgID).Scan(&proxyURL)
	if err != nil {
		return ""
	}
	return proxyURL
}

func (m *Manager) LoadSessions() {
	devices, err := m.container.GetAllDevices(context.Background())
	if err != nil {
		m.log.Errorf("Failed to fetch devices from store: %v", err)
		return
	}

	m.log.Infof("Hydrating %d WhatsApp sessions...", len(devices))

	var wg sync.WaitGroup
	for _, device := range devices {
		// Hydrate orgID from Redis Edge cache (fallback to JID if missing)
		orgID := m.publisher.GetHydratedOrgId(device.ID.User)

		wg.Add(1)
		go func(o string, d *store.Device) {
			defer wg.Done()
			err := m.ConnectClientWithDevice(o, d)
			if err != nil {
				m.log.Errorf("Failed to hydrate session for %s: %v", o, err)
			}
		}(orgID, device)
	}
	wg.Wait()
	m.log.Infof("✅ All %d sessions hydrated and ready.", len(devices))
}
func (m *Manager) ConnectClientWithDevice(orgID string, device *store.Device) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.clients[orgID]; exists {
		return nil
	}

	client := whatsmeow.NewClient(device, waLog.Stdout("Client-"+orgID, "INFO", true))
	client.EnableAutoReconnect = true

	// --- IP ROTATION: Set Proxy if assigned ---
	proxyAddr := m.getProxyForOrg(orgID)
	if proxyAddr != "" {
		proxyURL, err := url.Parse(proxyAddr)
		if err == nil {
			client.SetProxy(http.ProxyURL(proxyURL))
			m.log.Infof("🛡️ [PROXY] Routing %s through %s", orgID, proxyAddr)
		}
	}

	client.AddEventHandler(m.createEventHandler(orgID))

	err := client.Connect()
	if err != nil {
		return err
	}

	m.clients[orgID] = client
	m.sessionStartAt[orgID] = time.Now()
	m.log.Infof("✅ Hydrated session for Org: %s", orgID)
	return nil
}

func (m *Manager) ConnectClient(orgID string) (<-chan whatsmeow.QRChannelItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If already exists and connected
	if client, exists := m.clients[orgID]; exists {
		if client.IsConnected() {
			return nil, fmt.Errorf("client already connected")
		}
	}

	// New device registration
	deviceStore := m.container.NewDevice() 

	client := whatsmeow.NewClient(deviceStore, waLog.Stdout("Client-"+orgID, "INFO", true))
	client.EnableAutoReconnect = true

	// --- IP ROTATION: Set Proxy if assigned ---
	proxyAddr := m.getProxyForOrg(orgID)
	if proxyAddr != "" {
		proxyURL, err := url.Parse(proxyAddr)
		if err == nil {
			client.SetProxy(http.ProxyURL(proxyURL))
			m.log.Infof("🛡️ [PROXY] Routing new session %s through %s", orgID, proxyAddr)
		}
	}

	client.AddEventHandler(m.createEventHandler(orgID))

	qrChan, _ := client.GetQRChannel(context.Background())
	err := client.Connect()
	if err != nil {
		return nil, err
	}

	m.clients[orgID] = client
	m.sessionStartAt[orgID] = time.Now()
	return qrChan, nil
}

func (m *Manager) PairPhone(orgID, phone string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If already exists and connected
	if client, exists := m.clients[orgID]; exists {
		if client.IsConnected() {
			return "", fmt.Errorf("client already connected")
		}
	}

	// New device registration
	deviceStore := m.container.NewDevice()

	client := whatsmeow.NewClient(deviceStore, waLog.Stdout("Client-"+orgID, "INFO", true))
	client.EnableAutoReconnect = true

	// --- IP ROTATION: Set Proxy if assigned ---
	proxyAddr := m.getProxyForOrg(orgID)
	if proxyAddr != "" {
		proxyURL, err := url.Parse(proxyAddr)
		if err == nil {
			client.SetProxy(http.ProxyURL(proxyURL))
			m.log.Infof("🛡️ [PROXY] Routing new session %s through %s", orgID, proxyAddr)
		}
	}

	client.AddEventHandler(m.createEventHandler(orgID))

	err := client.Connect()
	if err != nil {
	        return "", err
	}

	m.clients[orgID] = client

	// --- ROBUSTNESS: Wait for WebSocket stability ---
	// Research shows calling PairPhone too fast results in 400 Bad Request
	time.Sleep(2 * time.Second)

	// Request pairing code
	// phone should be international format without +
	// clientDisplayName must follow "Browser (OS)" format strictly
	code, err := client.PairPhone(context.Background(), phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")

	if err != nil {
		return "", err
	}

	return code, nil
}

func (m *Manager) createEventHandler(orgID string) whatsmeow.EventHandler {
	return func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			m.handleMessage(orgID, v)
		case *events.LoggedOut:
			m.log.Warnf("🔌 Session logged out for %s: reason=%s", orgID, v.Reason)
			m.withdrawClient(orgID)
		case *events.PairSuccess:
			m.log.Infof("🎉 Successfully paired %s! Waiting for first user message...", orgID)
			m.sessionStartAt[orgID] = time.Now()
			// Flag the session as freshly paired — first user message will carry
			// an injected welcome context for the AI to deliver naturally.
			// No self-message needed (prevents WhatsApp bot detection ghost ban).
			_ = m.publisher.SetFreshlyPaired(orgID)
		case *events.StreamReplaced:
			m.log.Warnf("🔌 Session stream replaced for %s — another client paired with same phone", orgID)
			m.withdrawClient(orgID)
		case *events.Disconnected:
			m.log.Warnf("🔌 Session disconnected for %s — auto-reconnect will handle it", orgID)
		}
	}
}

// withdrawClient removes a client from the active map and disconnects it.
// Called when a session is logged out, revoked, or replaced.
func (m *Manager) withdrawClient(orgID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	client, exists := m.clients[orgID]
	if !exists {
		return
	}

	delete(m.clients, orgID)
	delete(m.sessionStartAt, orgID)

	// Disconnect in a goroutine so it doesn't block the event handler
	go func(c *whatsmeow.Client) {
		if c.IsConnected() {
			c.Disconnect()
		}
	}(client)

	m.log.Infof("🗑️ Withdrew client for %s from active pool", orgID)
}

func (m *Manager) handleMessage(orgID string, evt *events.Message) {
	// Auto Mark as Read logic:
	// - Aelixxr (Masterbot) always marks as read instantly (blue ticks).
	// - Zynux (Client Bots) leaves it as unread (grey ticks) so human admins can easily spot unread chats when they open their WhatsApp.
	if orgID == "naija-agent-master" || orgID == "aelixxr" || orgID == "aelixxr-life-companion" {
		if err := m.clients[orgID].MarkRead(context.Background(), []types.MessageID{evt.Info.ID}, evt.Info.Timestamp, evt.Info.Chat, evt.Info.Sender); err != nil {
			m.log.Warnf("Failed to mark message as read: %v", err)
		}
	}

	// Detect Human Intervention
	// Skip detection during the 60-second grace period after session start
	// to avoid false positives from WhatsApp history sync replaying old messages.
	if evt.Info.IsFromMe {
		chatId := evt.Info.Chat.ToNonAD().String()
		text := evt.Message.GetConversation()
		if text == "" && evt.Message.GetExtendedTextMessage() != nil {
			text = evt.Message.GetExtendedTextMessage().GetText()
		}

		textLower := strings.ToLower(strings.TrimSpace(text))

		if textLower == "#resume" || textLower == "#ai take over" || textLower == "#unmute" || textLower == "#optin" {
			m.log.Infof("🟢 [HUMAN AWARE] Boss explicitly handed control back for %s. AI Resumed.", chatId)
			_ = m.publisher.ReleaseHumanLock(orgID, chatId)
			if textLower == "#unmute" {
				_ = m.publisher.UnmuteChat(orgID, chatId)
				m.log.Infof("🔊 [PRIVACY] Boss permanently unmuted AI for chat %s.", chatId)
			}
			if textLower == "#optin" {
				_ = m.publisher.OptInChat(orgID, chatId)
				m.log.Infof("✅ [PRIVACY] Boss explicitly opted-in saved contact %s.", chatId)
			}
		} else if textLower == "#pause" {
			m.log.Infof("🛑 [HUMAN AWARE] Boss explicitly paused AI for %s (24 hours).", chatId)
			_ = m.publisher.SetHumanLock(orgID, chatId, 24 * time.Hour)
		} else if textLower == "#mute" {
			m.log.Infof("🔇 [PRIVACY] Boss permanently muted AI for chat %s.", chatId)
			_ = m.publisher.MuteChat(orgID, chatId)
		} else if textLower == "#help" {
			m.log.Infof("ℹ️ [HELP] Boss requested command list in chat %s.", chatId)
			helpText := "*Your Steering Wheel Commands:*\n" +
				"- `#pause`: Puts me to sleep for 24 hours in this chat.\n" +
				"- `#resume`: Wakes me back up instantly.\n" +
				"- `#mute`: Permanently bans me from this chat.\n" +
				"- `#unmute`: Reverses a mute.\n" +
				"- `#optin`: Forces me to talk to a saved VIP contact."

			me := m.clients[orgID].Store.ID.ToNonAD().String()
			_ = m.SendMessage(orgID, me, helpText)
		} else {
			// HISTORY SYNC GUARD: Skip 5-min lock during the first 60s after session start.
			// whatsmeow replays old IsFromMe messages during initial history sync,
			// which would falsely trigger HUMAN AWARE pauses on every reconnect.
			if startAt, ok := m.sessionStartAt[orgID]; ok && time.Since(startAt) < 60*time.Second {
				m.log.Infof("📥 [HISTORY SYNC] Ignoring IsFromMe message during grace period for %s (message: %s)", orgID, chatId)
			} else {
				m.log.Infof("🤫 [HUMAN AWARE] Boss sent a message to %s. Pausing AI for 5 mins (Sliding Window).", chatId)
				_ = m.publisher.SetHumanLock(orgID, chatId, 5 * time.Minute)
			}
		}
		return
	}

	// 1. Map whatsmeow message to JobData
	from := evt.Info.Sender.ToNonAD().String()
	
	if m.publisher.IsChatMuted(orgID, from) {
		m.log.Infof("🔇 [PRIVACY] Dropping incoming message from permanently muted chat %s.", from)
		return
	}

	contact, err := m.clients[orgID].Store.Contacts.GetContact(context.Background(), evt.Info.Sender)
	isSavedContact := false
	if err == nil && contact.Found && (contact.FullName != "" || contact.FirstName != "") {
		isSavedContact = true
	}

	if isSavedContact && !m.publisher.IsChatOptedIn(orgID, from) {
		m.log.Infof("🛡️ [PRIVACY] Silently dropping message from SAVED CONTACT %s (Not opted-in).", from)
		return
	}
	
	text := evt.Message.GetConversation()
	if text == "" && evt.Message.GetExtendedTextMessage() != nil {
		text = evt.Message.GetExtendedTextMessage().GetText()
	}

	// Determine if it's Life Chat based on orgID
	jobType := "text"
	if orgID == "naija-agent-master" || orgID == "aelixxr" || orgID == "aelixxr-life-companion" { 
		jobType = "life-chat" 
	}

	var fileName string
	var mimeType string
	var caption string

	// Extract and download media
	if img := evt.Message.GetImageMessage(); img != nil {
		if jobType != "life-chat" { jobType = "image" }
		mimeType = img.GetMimetype()
		caption = img.GetCaption()
		data, err := m.clients[orgID].Download(context.Background(), img)
		if err == nil {
			fileName = m.saveMediaLocally(evt.Info.ID, data, "jpg")
		} else {
			m.log.Errorf("Error downloading image: %v", err)
		}
	} else if aud := evt.Message.GetAudioMessage(); aud != nil {
		if jobType != "life-chat" { jobType = "audio" }
		mimeType = aud.GetMimetype()
		data, err := m.clients[orgID].Download(context.Background(), aud)
		if err == nil {
			fileName = m.saveMediaLocally(evt.Info.ID, data, "ogg")
		} else {
			m.log.Errorf("Error downloading audio: %v", err)
		}
	} else if doc := evt.Message.GetDocumentMessage(); doc != nil {
		if jobType != "life-chat" { jobType = "document" }
		mimeType = doc.GetMimetype()
		caption = doc.GetCaption()
		data, err := m.clients[orgID].Download(context.Background(), doc)
		if err == nil {
			fileName = m.saveMediaLocally(evt.Info.ID, data, "pdf")
		} else {
			m.log.Errorf("Error downloading document: %v", err)
		}
	} else if vid := evt.Message.GetVideoMessage(); vid != nil {
		if jobType != "life-chat" { jobType = "image" } // mapped to image/vision pipeline
		mimeType = vid.GetMimetype()
		caption = vid.GetCaption()
		data, err := m.clients[orgID].Download(context.Background(), vid)
		if err == nil {
			fileName = m.saveMediaLocally(evt.Info.ID, data, "mp4")
		} else {
			m.log.Errorf("Error downloading video: %v", err)
		}
	}

	if text == "" && caption != "" {
		text = caption
	}

	job := queue.JobData{
		From:      from,
		Type:      jobType,
		OrgID:     orgID,
		MessageID: evt.Info.ID,
		PhoneID:   "baileys-" + orgID, // Tag as Baileys/whatsmeow source
		Timestamp: evt.Info.Timestamp.UnixMilli(),
		Name:      evt.Info.PushName,
		Content: queue.JobContent{
			Text:     text,
			FileName: fileName,
			MimeType: mimeType,
			Caption:  caption,
		},
	}

	// Inject welcome context on first user message after pairing — no self-message needed.
	if text != "" && m.publisher.PopFreshlyPaired(orgID) {
		displayName := orgID
		if orgID == "aelixxr-life-companion" || orgID == "aelixxr" {
			displayName = "Aelixxr"
		} else if orgID == "zynux" {
			displayName = "Zynux"
		}
		welcomePrefix := fmt.Sprintf("[SYSTEM_WELCOME: This is the user's first message after connecting %s. ", displayName)
		welcomePrefix += "Naturally include this in your first reply: 🎉 Welcome! Your privacy is protected — "
		welcomePrefix += "you control who I talk to. Use #pause, #resume, #mute, #unmute, #optin to steer me. "
		welcomePrefix += "Make them feel in control and safe.]\n\n"
		text = welcomePrefix + text
	}

	// 2. Publish to Redis
	err = m.publisher.PublishMessage(job)
	if err != nil {
		m.log.Errorf("Failed to publish message for %s: %v", orgID, err)
	}
}

func (m *Manager) saveMediaLocally(msgID string, data []byte, ext string) string {
	dir := "/tmp/sidecar-media"
	os.MkdirAll(dir, os.ModePerm)
	filePath := filepath.Join(dir, fmt.Sprintf("%s.%s", msgID, ext))
	err := os.WriteFile(filePath, data, 0644)
	if err != nil {
		m.log.Errorf("Failed to save media %s: %v", msgID, err)
		return ""
	}
	m.log.Infof("✅ Saved media to %s", filePath)
	return filePath
}

func (m *Manager) SendMessage(orgID, to, text string) error {
	client, err := m.GetClient(orgID)
	if err != nil {
		return err
	}

	// Standardize JID if it's a raw phone number
	jidStr := to
	if !contains(to, "@") {
		jidStr = fmt.Sprintf("%s@s.whatsapp.net", to)
	}

	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return fmt.Errorf("invalid JID: %v", err)
	}

	// Retry up to 3 times with backoff — after pairing, the WebSocket state
	// machine may not be fully primed for outbound sends (history sync, prekeys).
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		_, lastErr = client.SendMessage(context.Background(), jid, &waProto.Message{
			Conversation: &text,
		})
		if lastErr == nil {
			return nil
		}
		if attempt < 2 {
			delay := time.Duration(2+attempt*2) * time.Second
			m.log.Warnf("SendMessage retry %d/%d for %s after %v, waiting %v", attempt+1, 3, orgID, lastErr, delay)
			time.Sleep(delay)
		}
	}
	return lastErr
}

func contains(s, substr string) bool {
	for i := 0; i < len(s)-len(substr)+1; i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func (m *Manager) SendTyping(orgID, to string) error {
	client, err := m.GetClient(orgID)
	if err != nil {
		return err
	}

	jidStr := to
	if !contains(to, "@") {
		jidStr = fmt.Sprintf("%s@s.whatsapp.net", to)
	}

	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return fmt.Errorf("invalid JID: %v", err)
	}

	return client.SendChatPresence(context.Background(), jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, client := range m.clients {
		client.Disconnect()
	}
}

func (m *Manager) SendMedia(orgID, to string, data []byte, mimeType, caption string) error {
	client, err := m.GetClient(orgID)
	if err != nil {
		return err
	}

	jidStr := to
	if !contains(to, "@") {
		jidStr = fmt.Sprintf("%s@s.whatsapp.net", to)
	}

	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return fmt.Errorf("invalid JID: %v", err)
	}

	uploadResp, err := client.Upload(context.Background(), data, whatsmeow.MediaImage)
	if err != nil {
		return fmt.Errorf("upload failed: %v", err)
	}

	fileLen := uploadResp.FileLength

	msg := &waProto.Message{
		ImageMessage: &waProto.ImageMessage{
			Caption:       &caption,
			Mimetype:      &mimeType,
			URL:           &uploadResp.URL,
			DirectPath:    &uploadResp.DirectPath,
			MediaKey:      uploadResp.MediaKey,
			FileEncSHA256: uploadResp.FileEncSHA256,
			FileSHA256:    uploadResp.FileSHA256,
			FileLength:    &fileLen,
		},
	}

	_, err = client.SendMessage(context.Background(), jid, msg)
	return err
}
