package sso

import (
	"fmt"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
)

// Identity represents an SSO identity mapping (external → AITOP user).
type Identity struct {
	ID            int64     `json:"id"`
	ProviderID    string    `json:"provider_id"`
	ExternalID    string    `json:"external_id"`
	ExternalEmail string    `json:"external_email"`
	UserID        string    `json:"user_id"`
	LastLoginAt   time.Time `json:"last_login_at"`
	CreatedAt     time.Time `json:"created_at"`
}

// User represents an AITOP user (local or SSO-provisioned).
type User struct {
	UserID         string    `json:"user_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Role           auth.Role `json:"role"`
	OrganizationID string    `json:"organization_id"`
	AuthMethod     string    `json:"auth_method"` // "local", "oidc", "saml"
	AvatarURL      string    `json:"avatar_url,omitempty"`
	LastLoginAt    time.Time `json:"last_login_at"`
	CreatedAt      time.Time `json:"created_at"`
}

// ProvisionUser creates a new AITOP user from SSO authentication.
func ProvisionUser(provider *Provider, userInfo *UserInfo) *User {
	role := provider.DefaultRole

	// Apply role mapping
	for _, group := range userInfo.Groups {
		if mappedRole, ok := provider.RoleMapping[group]; ok {
			candidate := auth.Role(mappedRole)
			if auth.RoleLevel(candidate) > auth.RoleLevel(role) {
				role = candidate
			}
		}
	}

	return &User{
		UserID:         fmt.Sprintf("u-sso-%s-%d", provider.ID, time.Now().UnixMilli()),
		Email:          userInfo.Email,
		Name:           userInfo.Name,
		Role:           role,
		OrganizationID: provider.OrganizationID,
		AuthMethod:     provider.Protocol,
		AvatarURL:      userInfo.AvatarURL,
		LastLoginAt:    time.Now().UTC(),
		CreatedAt:      time.Now().UTC(),
	}
}

// UserToClaims converts a User to JWT Claims for token generation.
func UserToClaims(user *User) *auth.Claims {
	return &auth.Claims{
		UserID:         user.UserID,
		Email:          user.Email,
		Name:           user.Name,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
	}
}
