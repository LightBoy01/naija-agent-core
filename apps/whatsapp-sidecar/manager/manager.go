package manager

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
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
		// Temporary: Using JID as orgID for auto-hydration until mapping table is ready
		orgID := device.ID.String()

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

func (m *Manager) createEventHandler(orgID string) whatsmeow.EventHandler {
	return func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			m.handleMessage(orgID, v)
		}
	}
}

func (m *Manager) handleMessage(orgID string, evt *events.Message) {
	// 1. Map whatsmeow message to JobData
	from := evt.Info.Sender.ToNonAD().String()
	text := evt.Message.GetConversation()

	// Determine if it's Life Chat based on orgID
	jobType := "text"
	if orgID == "naija-agent-master" || orgID == "aelixxr" { 
		jobType = "life-chat" 
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
			Text: text,
		},
	}

	// 2. Publish to Redis
	err := m.publisher.PublishMessage(job)
	if err != nil {
		m.log.Errorf("Failed to publish message for %s: %v", orgID, err)
	}
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
