package api

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/naija-agent/whatsapp-sidecar/manager"
	"go.mau.fi/whatsmeow"
)

type Server struct {
	mgr    *manager.Manager
	apiKey string
}

func NewServer(mgr *manager.Manager) *Server {
	return &Server{
		mgr:    mgr,
		apiKey: os.Getenv("ADMIN_API_KEY"),
	}
}

func (s *Server) checkAuth(w http.ResponseWriter, r *http.Request) bool {
	if s.apiKey == "" {
		return true // Allow if not configured (dev mode)
	}
	key := r.Header.Get("X-API-Key")
	if key != s.apiKey {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}

func (s *Server) Start(port string) {
	if port == "" {
		port = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/send", s.handleSend)
	mux.HandleFunc("/connect", s.handleConnect)
	mux.HandleFunc("/pair", s.handlePair)
	mux.HandleFunc("/download/", s.handleDownload)

	http.ListenAndServe(":"+port, mux)
}

func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		OrgID string `json:"orgId"`
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}

	code, err := s.mgr.PairPhone(req.OrgID, req.Phone)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "pairing_code_generated",
		"code":   code,
	})
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(w, r) {
		return
	}
	// Extract mediaId from path /download/{mediaId}
	mediaID := r.URL.Path[len("/download/"):]
	if mediaID == "" {
		http.Error(w, "mediaId is required", http.StatusBadRequest)
		return
	}

	// We need to know which client to use to download the media.
	// In this Sovereign architecture, media is usually context-free but needs a valid session.
	// We'll use the first available active client.
	var client *whatsmeow.Client
	for _, c := range s.mgr.GetClients() {
		if c.IsConnected() {
			client = c
			break
		}
	}

	if client == nil {
		http.Error(w, "no active whatsapp session available for download", http.StatusServiceUnavailable)
		return
	}

	// whatsmeow doesn't have a direct "download by ID" without the message context 
	// for simple security reasons (you need the media key).
	// However, we can use the Download function if we have the media record.
	// For now, this is a placeholder for the deep media retrieval logic.
	
	http.Error(w, "Direct download without media key not yet implemented in Sovereign Engine", http.StatusNotImplemented)
}

func (s *Server) handleSend(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		OrgID string `json:"orgId"`
		To    string `json:"to"`
		Text  string `json:"text"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.mgr.SendMessage(req.OrgID, req.To, req.Text); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(w, r) {
		return
	}
	var req struct {
		OrgID string `json:"orgId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	qrChan, err := s.mgr.ConnectClient(req.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Wait for the first QR code from the channel
	evt := <-qrChan
	if evt.Event == "code" {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "scan_required",
			"qr":     evt.Code,
		})
	} else {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status": evt.Event,
		})
	}
}
