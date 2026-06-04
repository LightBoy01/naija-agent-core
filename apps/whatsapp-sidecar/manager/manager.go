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
	container *sqlstore.Container
	db        *sql.DB // PostgreSQL connection for org config
	publisher *queue.Publisher
	clients   map[string]*whatsmeow.Client
	mu        sync.RWMutex
	log       waLog.Logger
}

func NewManager(container *sqlstore.Container, db *sql.DB, publisher *queue.Publisher) *Manager {
	mgr := &Manager{
		container: container,
		db:        db,
		publisher: publisher,
		clients:   make(map[string]*whatsmeow.Client),
		log:       waLog.Stdout("Manager", "INFO", true),
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
	if exists {
		return client, nil
	}
	return nil, fmt.Errorf("client for org %s not found", orgID)
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

	client := whatsmeow.NewClient(device, waLog.Stdout("Client-"+orgID, "ERROR", true))
	
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

	// Request pairing code
	// phone should be international format without +
	code, err := client.PairPhone(context.Background(), phone, true, whatsmeow.PairClientChrome, "Naija Agent Bot")
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
		}
	}
}

func (m *Manager) handleMessage(orgID string, evt *events.Message) {
	// Auto Mark as Read logic:
	// - Aelixxr (Masterbot) always marks as read instantly (blue ticks).
	// - Zynux (Client Bots) leaves it as unread (grey ticks) so human admins can easily spot unread chats when they open their WhatsApp.
	if orgID == "naija-agent-master" || orgID == "aelixxr" {
		if err := m.clients[orgID].MarkRead([]types.MessageID{evt.Info.ID}, evt.Info.Timestamp, evt.Info.Chat, evt.Info.Sender); err != nil {
			m.log.Warnf("Failed to mark message as read: %v", err)
		}
	}

	// Detect Human Intervention
	if evt.Info.IsFromMe {
		chatId := evt.Info.Chat.ToNonAD().String()
		m.log.Infof("🤫 [HUMAN AWARE] Boss sent a message to %s. Pausing AI for 30 mins.", chatId)
		_ = m.publisher.SetHumanLock(orgID, chatId)
		return
	}

	// 1. Map whatsmeow message to JobData
	from := evt.Info.Sender.ToNonAD().String()
	
	text := evt.Message.GetConversation()
	if text == "" && evt.Message.GetExtendedTextMessage() != nil {
		text = evt.Message.GetExtendedTextMessage().GetText()
	}

	// Determine if it's Life Chat based on orgID
	jobType := "text"
	if orgID == "naija-agent-master" || orgID == "aelixxr" { 
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

	// 2. Publish to Redis
	err := m.publisher.PublishMessage(job)
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

	jid, err := types.ParseJID(to)
	if err != nil {
		return fmt.Errorf("invalid JID: %v", err)
	}

	_, err = client.SendMessage(context.Background(), jid, &waProto.Message{
		Conversation: &text,
	})
	return err
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, client := range m.clients {
		client.Disconnect()
	}
}
