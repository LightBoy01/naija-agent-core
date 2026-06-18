package api

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/naija-agent/whatsapp-sidecar/manager"
)

func TestHandleSendMedia_MissingOrgId(t *testing.T) {
	s := &Server{mgr: &manager.Manager{}, apiKey: ""}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("to", "2348012345678")
	part, _ := writer.CreateFormFile("file", "test.jpg")
	part.Write([]byte("data"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/send-media", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	s.handleSendMedia(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleSendMedia_MissingFile(t *testing.T) {
	s := &Server{mgr: &manager.Manager{}, apiKey: ""}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("orgId", "test-org")
	_ = writer.WriteField("to", "2348012345678")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/send-media", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	s.handleSendMedia(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for missing file, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleSendMedia_WrongMethod(t *testing.T) {
	s := &Server{mgr: &manager.Manager{}, apiKey: ""}

	req := httptest.NewRequest(http.MethodGet, "/send-media", nil)
	w := httptest.NewRecorder()

	s.handleSendMedia(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 Method Not Allowed, got %d", w.Code)
	}
}

func TestHandleSendMedia_AuthRequired(t *testing.T) {
	s := &Server{mgr: &manager.Manager{}, apiKey: "secret123"}

	req := httptest.NewRequest(http.MethodPost, "/send-media", nil)
	w := httptest.NewRecorder()

	s.handleSendMedia(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", w.Code)
	}
}
