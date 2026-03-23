package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Profile represents a row in the profiling_profiles table.
type Profile struct {
	ProfileID   string            `json:"profile_id"`
	AgentID     string            `json:"agent_id"`
	ServiceName string            `json:"service_name"`
	Language    string            `json:"language"`
	ProfileType string           `json:"profile_type"`
	Format      string            `json:"format"`
	DurationSec int               `json:"duration_sec"`
	SampleCount int               `json:"sample_count"`
	S3Key       string            `json:"s3_key"`
	SizeBytes   int64             `json:"size_bytes"`
	Labels      map[string]string `json:"labels,omitempty"`
	TraceID     string            `json:"trace_id,omitempty"`
	SpanID      string            `json:"span_id,omitempty"`
	StartedAt   time.Time         `json:"started_at"`
	EndedAt     time.Time         `json:"ended_at"`
	CreatedAt   time.Time         `json:"created_at"`
}

// ListProfilesFilter defines query parameters for listing profiles.
type ListProfilesFilter struct {
	AgentID     string
	ServiceName string
	Language    string
	ProfileType string
	TraceID     string
	From        time.Time
	To          time.Time
	Limit       int
}

// InsertProfile stores a new profile metadata record.
func (db *DB) InsertProfile(ctx context.Context, p *Profile) error {
	if !db.IsAvailable() {
		return nil
	}

	labelsJSON, _ := json.Marshal(p.Labels)

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO profiling_profiles
		  (profile_id, agent_id, service_name, language, profile_type, format,
		   duration_sec, sample_count, s3_key, size_bytes, labels, trace_id, span_id,
		   started_at, ended_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
	`, p.ProfileID, p.AgentID, p.ServiceName, p.Language, p.ProfileType, p.Format,
		p.DurationSec, p.SampleCount, p.S3Key, p.SizeBytes, string(labelsJSON),
		nullStr(p.TraceID), nullStr(p.SpanID), p.StartedAt, p.EndedAt)

	return err
}

// ListProfiles returns profiles matching the given filter.
func (db *DB) ListProfiles(ctx context.Context, f ListProfilesFilter) ([]Profile, error) {
	if !db.IsAvailable() {
		return nil, nil
	}

	query := `SELECT profile_id, agent_id, service_name, language, profile_type, format,
	           duration_sec, sample_count, s3_key, size_bytes, COALESCE(labels,'{}'),
	           COALESCE(trace_id,''), COALESCE(span_id,''), started_at, ended_at, created_at
	          FROM profiling_profiles WHERE 1=1`
	args := []interface{}{}
	idx := 1

	if f.AgentID != "" {
		query += fmt.Sprintf(" AND agent_id = $%d", idx)
		args = append(args, f.AgentID)
		idx++
	}
	if f.ServiceName != "" {
		query += fmt.Sprintf(" AND service_name = $%d", idx)
		args = append(args, f.ServiceName)
		idx++
	}
	if f.Language != "" {
		query += fmt.Sprintf(" AND language = $%d", idx)
		args = append(args, f.Language)
		idx++
	}
	if f.ProfileType != "" {
		query += fmt.Sprintf(" AND profile_type = $%d", idx)
		args = append(args, f.ProfileType)
		idx++
	}
	if f.TraceID != "" {
		query += fmt.Sprintf(" AND trace_id = $%d", idx)
		args = append(args, f.TraceID)
		idx++
	}
	if !f.From.IsZero() {
		query += fmt.Sprintf(" AND started_at >= $%d", idx)
		args = append(args, f.From)
		idx++
	}
	if !f.To.IsZero() {
		query += fmt.Sprintf(" AND started_at <= $%d", idx)
		args = append(args, f.To)
		idx++
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 100
	}
	query += fmt.Sprintf(" ORDER BY started_at DESC LIMIT %d", limit)

	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []Profile
	for rows.Next() {
		var p Profile
		var labelsStr string
		if err := rows.Scan(&p.ProfileID, &p.AgentID, &p.ServiceName, &p.Language,
			&p.ProfileType, &p.Format, &p.DurationSec, &p.SampleCount,
			&p.S3Key, &p.SizeBytes, &labelsStr, &p.TraceID, &p.SpanID,
			&p.StartedAt, &p.EndedAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(labelsStr), &p.Labels)
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

// GetProfile returns a single profile by ID.
func (db *DB) GetProfile(ctx context.Context, profileID string) (*Profile, error) {
	if !db.IsAvailable() {
		return nil, nil
	}

	var p Profile
	var labelsStr string
	err := db.conn.QueryRowContext(ctx, `
		SELECT profile_id, agent_id, service_name, language, profile_type, format,
		       duration_sec, sample_count, s3_key, size_bytes, COALESCE(labels,'{}'),
		       COALESCE(trace_id,''), COALESCE(span_id,''), started_at, ended_at, created_at
		FROM profiling_profiles WHERE profile_id = $1
	`, profileID).Scan(&p.ProfileID, &p.AgentID, &p.ServiceName, &p.Language,
		&p.ProfileType, &p.Format, &p.DurationSec, &p.SampleCount,
		&p.S3Key, &p.SizeBytes, &labelsStr, &p.TraceID, &p.SpanID,
		&p.StartedAt, &p.EndedAt, &p.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	_ = json.Unmarshal([]byte(labelsStr), &p.Labels)
	return &p, err
}

// GetProfilesByTraceID returns all profiles linked to a trace.
func (db *DB) GetProfilesByTraceID(ctx context.Context, traceID string) ([]Profile, error) {
	return db.ListProfiles(ctx, ListProfilesFilter{TraceID: traceID})
}

// DeleteProfile removes a profile record by ID.
func (db *DB) DeleteProfile(ctx context.Context, profileID string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM profiling_profiles WHERE profile_id = $1`, profileID)
	return err
}

// nullStr returns a sql.NullString for optional string fields.
func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
