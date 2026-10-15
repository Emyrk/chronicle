// Package store persists the uploader's settings and sign-in token.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/zalando/go-keyring"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
)

const keyringService = "chronicle-uploader"
const keyringUser = "default"

// State is everything the uploader remembers between runs.
type State struct {
	// Tenant is the server chosen with --server or by pairing; empty means
	// the default tenant.
	Tenant tenant.Tenant `json:"tenant,omitempty"`
	// WoWPath is the folder the user picked; empty means auto-detect.
	WoWPath string `json:"wow_path,omitempty"`
	// UploadOnIdle also uploads when the log goes quiet, not only on WoW exit.
	UploadOnIdle bool `json:"upload_on_idle,omitempty"`
	// KeepLog turns off renaming the combat log after it was uploaded. The
	// zero value archives, which is the default.
	KeepLog bool `json:"keep_log,omitempty"`
	// Uploaded maps a log path to the size that has been uploaded.
	Uploaded map[string]int64 `json:"uploaded,omitempty"`
	// Logs is the upload ledger: it maps a log's content-keyed source id
	// (upload.Identify) to what Chronicle has of it. Unlike Uploaded, which is
	// keyed by path and forgotten when the file is renamed or moved, the ledger
	// is what keeps a log the server already has from being sent again.
	Logs map[string]Log `json:"logs,omitempty"`
	// LastReportURL is the most recent report, for the tray menu.
	LastReportURL string `json:"last_report_url,omitempty"`
}

// Log is one entry of the upload ledger.
type Log struct {
	// Size is how many bytes of the log reached the server.
	Size int64 `json:"size"`
	// ReportURL is where it can be viewed.
	ReportURL string `json:"report_url,omitempty"`
	// At is when the entry was last written. The oldest entries are dropped
	// once the ledger is full.
	At time.Time `json:"at"`
}

// LedgerMax bounds the ledger: one entry is kept per log file ever uploaded,
// which is a handful per play session, so the state file cannot grow forever.
const LedgerMax = 1000

// RecordLog adds or replaces the ledger entry for a source id, dropping the
// oldest entries once the ledger is full.
func (s *State) RecordLog(id string, l Log) {
	if s.Logs == nil {
		s.Logs = map[string]Log{}
	}
	s.Logs[id] = l
	for len(s.Logs) > LedgerMax {
		oldest, at := "", time.Time{}
		for k, v := range s.Logs {
			if oldest == "" || v.At.Before(at) {
				oldest, at = k, v.At
			}
		}
		delete(s.Logs, oldest)
	}
}

// Store is a JSON file on disk.
type Store struct {
	path string
	mu   sync.Mutex
	st   State
}

// Dir is the directory holding the uploader's files.
func Dir() (string, error) {
	cfg, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cfg, "chronicle-uploader"), nil
}

// Open loads the state file at path, or starts empty.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, &s.st); err != nil {
		// A corrupt file must not stop the uploader; start over.
		s.st = State{}
	}
	return s, nil
}

// Get returns a copy of the state.
func (s *Store) Get() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := s.st
	cp.Uploaded = make(map[string]int64, len(s.st.Uploaded))
	for k, v := range s.st.Uploaded {
		cp.Uploaded[k] = v
	}
	cp.Logs = make(map[string]Log, len(s.st.Logs))
	for k, v := range s.st.Logs {
		cp.Logs[k] = v
	}
	return cp
}

// Update applies fn and saves.
func (s *Store) Update(fn func(*State)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.st)
	b, err := json.MarshalIndent(s.st, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Token reads the bearer token from the OS keychain ("" when none).
func Token() string {
	t, err := keyring.Get(keyringService, keyringUser)
	if err != nil {
		return ""
	}
	return t
}

// SaveToken stores the bearer token in the OS keychain.
func SaveToken(token string) error {
	return keyring.Set(keyringService, keyringUser, token)
}

// DeleteToken removes the bearer token from the OS keychain.
func DeleteToken() error {
	err := keyring.Delete(keyringService, keyringUser)
	if errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}
