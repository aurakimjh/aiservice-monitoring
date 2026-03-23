package database

import (
	"context"
	"database/sql"
	"time"
)

// UserRecord represents a row in the users table.
type UserRecord struct {
	UserID         string    `json:"user_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Role           string    `json:"role"`
	OrganizationID string    `json:"organization_id"`
	AuthMethod     string    `json:"auth_method"`
	AvatarURL      string    `json:"avatar_url,omitempty"`
	LastLoginAt    time.Time `json:"last_login_at,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// UpsertUser creates or updates a user record.
func (db *DB) UpsertUser(ctx context.Context, u *UserRecord) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO users (user_id, email, name, role, organization_id, auth_method, avatar_url, last_login_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		  email = EXCLUDED.email,
		  name = EXCLUDED.name,
		  role = EXCLUDED.role,
		  avatar_url = EXCLUDED.avatar_url,
		  last_login_at = NOW(),
		  updated_at = NOW()
	`, u.UserID, u.Email, u.Name, u.Role, u.OrganizationID, u.AuthMethod, nullStr(u.AvatarURL))
	return err
}

// GetUserByEmail returns a user by email.
func (db *DB) GetUserByEmail(ctx context.Context, email string) (*UserRecord, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var u UserRecord
	var avatar sql.NullString
	err := db.conn.QueryRowContext(ctx, `
		SELECT user_id, email, name, role, organization_id, auth_method,
		  COALESCE(avatar_url,''), COALESCE(last_login_at, created_at), created_at, updated_at
		FROM users WHERE email = $1
	`, email).Scan(&u.UserID, &u.Email, &u.Name, &u.Role, &u.OrganizationID, &u.AuthMethod,
		&avatar, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if avatar.Valid {
		u.AvatarURL = avatar.String
	}
	return &u, err
}

// ListUsers returns all users, optionally filtered by organization.
func (db *DB) ListUsers(ctx context.Context, orgID string) ([]UserRecord, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	query := `SELECT user_id, email, name, role, organization_id, auth_method,
	  COALESCE(avatar_url,''), COALESCE(last_login_at, created_at), created_at, updated_at
	  FROM users`
	args := []interface{}{}
	if orgID != "" {
		query += " WHERE organization_id = $1"
		args = append(args, orgID)
	}
	query += " ORDER BY created_at DESC"
	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []UserRecord
	for rows.Next() {
		var u UserRecord
		if err := rows.Scan(&u.UserID, &u.Email, &u.Name, &u.Role, &u.OrganizationID, &u.AuthMethod,
			&u.AvatarURL, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}
