package manager

import (
	"testing"

	"go.mau.fi/whatsmeow"
)

func TestSendMedia_InvalidOrg(t *testing.T) {
	mgr := &Manager{clients: make(map[string]*whatsmeow.Client)}
	err := mgr.SendMedia("nonexistent-org", "2348012345678", []byte("test"), "image/jpeg", "caption")
	if err == nil {
		t.Fatal("expected error for nonexistent org")
	}
}

func TestContains(t *testing.T) {
	if !contains("hello@s.whatsapp.net", "@") {
		t.Error("contains should find @")
	}
	if contains("2348012345678", "@") {
		t.Error("contains should not find @ in plain phone")
	}
}

func TestSendMessage_PlainPhoneNormalized(t *testing.T) {
	mgr := &Manager{clients: make(map[string]*whatsmeow.Client)}
	err := mgr.SendMessage("nonexistent", "2348012345678", "test")
	if err == nil {
		t.Fatal("expected error for nonexistent org when sending text to plain phone")
	}
}
