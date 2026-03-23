package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// ── Alert Policy CRUD ────────────────────────────────────────────────────

type AlertPolicy struct {
	PolicyID      string          `json:"policy_id"`
	Name          string          `json:"name"`
	Severity      string          `json:"severity"`
	Target        string          `json:"target"`
	ConditionType string          `json:"condition_type"`
	Condition     string          `json:"condition"`
	ThresholdType string          `json:"threshold_type"`
	Channels      json.RawMessage `json:"channels"`
	Enabled       bool            `json:"enabled"`
	ManagedBy     string          `json:"managed_by"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

func (db *DB) InsertAlertPolicy(ctx context.Context, p *AlertPolicy) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO alert_policies (policy_id,name,severity,target,condition_type,condition,threshold_type,channels,enabled,managed_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`, p.PolicyID, p.Name, p.Severity, p.Target, p.ConditionType, p.Condition, p.ThresholdType, string(p.Channels), p.Enabled, p.ManagedBy)
	return err
}

func (db *DB) GetAlertPolicy(ctx context.Context, id string) (*AlertPolicy, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var p AlertPolicy
	var ch string
	err := db.conn.QueryRowContext(ctx, `SELECT policy_id,name,severity,target,condition_type,condition,threshold_type,channels,enabled,managed_by,created_at,updated_at FROM alert_policies WHERE policy_id=$1`, id).
		Scan(&p.PolicyID, &p.Name, &p.Severity, &p.Target, &p.ConditionType, &p.Condition, &p.ThresholdType, &ch, &p.Enabled, &p.ManagedBy, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	p.Channels = json.RawMessage(ch)
	return &p, err
}

func (db *DB) ListAlertPolicies(ctx context.Context) ([]AlertPolicy, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	rows, err := db.conn.QueryContext(ctx, `SELECT policy_id,name,severity,target,condition_type,condition,threshold_type,channels,enabled,managed_by,created_at,updated_at FROM alert_policies ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var policies []AlertPolicy
	for rows.Next() {
		var p AlertPolicy
		var ch string
		if err := rows.Scan(&p.PolicyID, &p.Name, &p.Severity, &p.Target, &p.ConditionType, &p.Condition, &p.ThresholdType, &ch, &p.Enabled, &p.ManagedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Channels = json.RawMessage(ch)
		policies = append(policies, p)
	}
	return policies, rows.Err()
}

func (db *DB) UpdateAlertPolicy(ctx context.Context, p *AlertPolicy) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `
		UPDATE alert_policies SET name=$2,severity=$3,target=$4,condition_type=$5,condition=$6,threshold_type=$7,channels=$8,enabled=$9,managed_by=$10,updated_at=NOW()
		WHERE policy_id=$1
	`, p.PolicyID, p.Name, p.Severity, p.Target, p.ConditionType, p.Condition, p.ThresholdType, string(p.Channels), p.Enabled, p.ManagedBy)
	return err
}

func (db *DB) DeleteAlertPolicy(ctx context.Context, id string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM alert_policies WHERE policy_id=$1`, id)
	return err
}

// ── SLO Definition CRUD ──────────────────────────────────────────────────

type SLODef struct {
	SLOID     string    `json:"slo_id"`
	Name      string    `json:"name"`
	Service   string    `json:"service"`
	SLI       string    `json:"sli"`
	Target    float64   `json:"target"`
	Window    string    `json:"window"`
	ManagedBy string    `json:"managed_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (db *DB) InsertSLO(ctx context.Context, s *SLODef) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `INSERT INTO slo_definitions (slo_id,name,service,sli,target,window,managed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		s.SLOID, s.Name, s.Service, s.SLI, s.Target, s.Window, s.ManagedBy)
	return err
}

func (db *DB) GetSLO(ctx context.Context, id string) (*SLODef, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var s SLODef
	err := db.conn.QueryRowContext(ctx, `SELECT slo_id,name,service,sli,target,window,managed_by,created_at,updated_at FROM slo_definitions WHERE slo_id=$1`, id).
		Scan(&s.SLOID, &s.Name, &s.Service, &s.SLI, &s.Target, &s.Window, &s.ManagedBy, &s.CreatedAt, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (db *DB) ListSLOs(ctx context.Context) ([]SLODef, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	rows, err := db.conn.QueryContext(ctx, `SELECT slo_id,name,service,sli,target,window,managed_by,created_at,updated_at FROM slo_definitions ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var slos []SLODef
	for rows.Next() {
		var s SLODef
		if err := rows.Scan(&s.SLOID, &s.Name, &s.Service, &s.SLI, &s.Target, &s.Window, &s.ManagedBy, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		slos = append(slos, s)
	}
	return slos, rows.Err()
}

func (db *DB) UpdateSLO(ctx context.Context, s *SLODef) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `UPDATE slo_definitions SET name=$2,service=$3,sli=$4,target=$5,window=$6,managed_by=$7,updated_at=NOW() WHERE slo_id=$1`,
		s.SLOID, s.Name, s.Service, s.SLI, s.Target, s.Window, s.ManagedBy)
	return err
}

func (db *DB) DeleteSLO(ctx context.Context, id string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM slo_definitions WHERE slo_id=$1`, id)
	return err
}

// ── Dashboard CRUD ───────────────────────────────────────────────────────

type Dashboard struct {
	DashboardID string          `json:"dashboard_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Template    string          `json:"template,omitempty"`
	Widgets     json.RawMessage `json:"widgets"`
	ManagedBy   string          `json:"managed_by"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

func (db *DB) InsertDashboard(ctx context.Context, d *Dashboard) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `INSERT INTO dashboards (dashboard_id,name,description,template,widgets,managed_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		d.DashboardID, d.Name, d.Description, d.Template, string(d.Widgets), d.ManagedBy)
	return err
}

func (db *DB) GetDashboard(ctx context.Context, id string) (*Dashboard, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var d Dashboard
	var w string
	err := db.conn.QueryRowContext(ctx, `SELECT dashboard_id,name,description,COALESCE(template,''),widgets,managed_by,created_at,updated_at FROM dashboards WHERE dashboard_id=$1`, id).
		Scan(&d.DashboardID, &d.Name, &d.Description, &d.Template, &w, &d.ManagedBy, &d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	d.Widgets = json.RawMessage(w)
	return &d, err
}

func (db *DB) ListDashboards(ctx context.Context) ([]Dashboard, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	rows, err := db.conn.QueryContext(ctx, `SELECT dashboard_id,name,description,COALESCE(template,''),widgets,managed_by,created_at,updated_at FROM dashboards ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var dashboards []Dashboard
	for rows.Next() {
		var d Dashboard
		var w string
		if err := rows.Scan(&d.DashboardID, &d.Name, &d.Description, &d.Template, &w, &d.ManagedBy, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		d.Widgets = json.RawMessage(w)
		dashboards = append(dashboards, d)
	}
	return dashboards, rows.Err()
}

func (db *DB) UpdateDashboard(ctx context.Context, d *Dashboard) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `UPDATE dashboards SET name=$2,description=$3,template=$4,widgets=$5,managed_by=$6,updated_at=NOW() WHERE dashboard_id=$1`,
		d.DashboardID, d.Name, d.Description, d.Template, string(d.Widgets), d.ManagedBy)
	return err
}

func (db *DB) DeleteDashboard(ctx context.Context, id string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM dashboards WHERE dashboard_id=$1`, id)
	return err
}

// ── Notification Channel CRUD ────────────────────────────────────────────

type NotificationChannel struct {
	ChannelID string          `json:"channel_id"`
	Name      string          `json:"name"`
	Type      string          `json:"type"`
	Config    json.RawMessage `json:"config"`
	Enabled   bool            `json:"enabled"`
	ManagedBy string          `json:"managed_by"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (db *DB) InsertNotificationChannel(ctx context.Context, ch *NotificationChannel) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `INSERT INTO notification_channels (channel_id,name,type,config,enabled,managed_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		ch.ChannelID, ch.Name, ch.Type, string(ch.Config), ch.Enabled, ch.ManagedBy)
	return err
}

func (db *DB) GetNotificationChannel(ctx context.Context, id string) (*NotificationChannel, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var ch NotificationChannel
	var cfg string
	err := db.conn.QueryRowContext(ctx, `SELECT channel_id,name,type,config,enabled,managed_by,created_at,updated_at FROM notification_channels WHERE channel_id=$1`, id).
		Scan(&ch.ChannelID, &ch.Name, &ch.Type, &cfg, &ch.Enabled, &ch.ManagedBy, &ch.CreatedAt, &ch.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	ch.Config = json.RawMessage(cfg)
	return &ch, err
}

func (db *DB) ListNotificationChannels(ctx context.Context) ([]NotificationChannel, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	rows, err := db.conn.QueryContext(ctx, `SELECT channel_id,name,type,config,enabled,managed_by,created_at,updated_at FROM notification_channels ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var channels []NotificationChannel
	for rows.Next() {
		var ch NotificationChannel
		var cfg string
		if err := rows.Scan(&ch.ChannelID, &ch.Name, &ch.Type, &cfg, &ch.Enabled, &ch.ManagedBy, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		ch.Config = json.RawMessage(cfg)
		channels = append(channels, ch)
	}
	return channels, rows.Err()
}

func (db *DB) UpdateNotificationChannel(ctx context.Context, ch *NotificationChannel) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `UPDATE notification_channels SET name=$2,type=$3,config=$4,enabled=$5,managed_by=$6,updated_at=NOW() WHERE channel_id=$1`,
		ch.ChannelID, ch.Name, ch.Type, string(ch.Config), ch.Enabled, ch.ManagedBy)
	return err
}

func (db *DB) DeleteNotificationChannel(ctx context.Context, id string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM notification_channels WHERE channel_id=$1`, id)
	return err
}

// ── API Key CRUD ─────────────────────────────────────────────────────────

type APIKey struct {
	KeyID          string    `json:"key_id"`
	KeyHash        string    `json:"-"`
	KeyPrefix      string    `json:"key_prefix"`
	Name           string    `json:"name"`
	Role           string    `json:"role"`
	OrganizationID string    `json:"organization_id"`
	CreatedBy      string    `json:"created_by"`
	ExpiresAt      time.Time `json:"expires_at,omitempty"`
	LastUsedAt     time.Time `json:"last_used_at,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// HashAPIKey returns the SHA-256 hex hash of an API key.
func HashAPIKey(key string) string {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:])
}

func (db *DB) InsertAPIKey(ctx context.Context, k *APIKey) error {
	if !db.IsAvailable() {
		return nil
	}
	expiresAt := sql.NullTime{}
	if !k.ExpiresAt.IsZero() {
		expiresAt = sql.NullTime{Time: k.ExpiresAt, Valid: true}
	}
	_, err := db.conn.ExecContext(ctx, `INSERT INTO api_keys (key_id,key_hash,key_prefix,name,role,organization_id,created_by,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		k.KeyID, k.KeyHash, k.KeyPrefix, k.Name, k.Role, k.OrganizationID, k.CreatedBy, expiresAt)
	return err
}

func (db *DB) GetAPIKeyByHash(ctx context.Context, keyHash string) (*APIKey, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var k APIKey
	var expiresAt, lastUsed sql.NullTime
	err := db.conn.QueryRowContext(ctx, `SELECT key_id,key_hash,key_prefix,name,role,organization_id,created_by,expires_at,last_used_at,created_at FROM api_keys WHERE key_hash=$1`, keyHash).
		Scan(&k.KeyID, &k.KeyHash, &k.KeyPrefix, &k.Name, &k.Role, &k.OrganizationID, &k.CreatedBy, &expiresAt, &lastUsed, &k.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if expiresAt.Valid {
		k.ExpiresAt = expiresAt.Time
	}
	if lastUsed.Valid {
		k.LastUsedAt = lastUsed.Time
	}
	return &k, err
}

func (db *DB) ListAPIKeys(ctx context.Context, orgID string) ([]APIKey, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	query := `SELECT key_id,key_prefix,name,role,organization_id,created_by,COALESCE(expires_at,'1970-01-01'),COALESCE(last_used_at,'1970-01-01'),created_at FROM api_keys`
	args := []interface{}{}
	if orgID != "" {
		query += " WHERE organization_id=$1"
		args = append(args, orgID)
	}
	query += " ORDER BY created_at DESC"

	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.KeyID, &k.KeyPrefix, &k.Name, &k.Role, &k.OrganizationID, &k.CreatedBy, &k.ExpiresAt, &k.LastUsedAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (db *DB) DeleteAPIKey(ctx context.Context, keyID string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM api_keys WHERE key_id=$1`, keyID)
	return err
}

func (db *DB) UpdateAPIKeyLastUsed(ctx context.Context, keyID string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `UPDATE api_keys SET last_used_at=NOW() WHERE key_id=$1`, keyID)
	return err
}

// ── Utility ──────────────────────────────────────────────────────────────

func genID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixMilli())
}
