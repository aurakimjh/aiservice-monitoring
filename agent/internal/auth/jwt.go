// Package auth provides JWT authentication and RBAC authorization
// for the AITOP Collection Server REST API.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Role defines user roles with hierarchical permissions.
type Role string

const (
	RoleAdmin      Role = "admin"
	RoleSRE        Role = "sre"
	RoleAIEngineer Role = "ai_engineer"
	RoleViewer     Role = "viewer"
)

// RoleLevel returns the numeric level for role hierarchy.
func RoleLevel(r Role) int {
	switch r {
	case RoleAdmin:
		return 100
	case RoleSRE:
		return 80
	case RoleAIEngineer:
		return 60
	case RoleViewer:
		return 10
	default:
		return 0
	}
}

// Claims holds JWT token claims.
type Claims struct {
	UserID         string `json:"sub"`
	Email          string `json:"email"`
	Name           string `json:"name"`
	Role           Role   `json:"role"`
	OrganizationID string `json:"org_id"`
	IssuedAt       int64  `json:"iat"`
	ExpiresAt      int64  `json:"exp"`
}

// JWTConfig holds JWT configuration.
type JWTConfig struct {
	Secret          string        `yaml:"secret"`           // HMAC-SHA256 signing key
	AccessTokenTTL  time.Duration `yaml:"access_token_ttl"` // default 1h
	RefreshTokenTTL time.Duration `yaml:"refresh_token_ttl"` // default 24h
}

// JWTManager handles token creation and verification.
type JWTManager struct {
	secret         []byte
	accessTokenTTL time.Duration
	refreshTokenTTL time.Duration
}

// NewJWTManager creates a JWT manager with the given config.
func NewJWTManager(cfg JWTConfig) *JWTManager {
	secret := cfg.Secret
	if secret == "" {
		secret = "aitop-dev-secret-change-in-production"
	}
	accessTTL := cfg.AccessTokenTTL
	if accessTTL == 0 {
		accessTTL = time.Hour
	}
	refreshTTL := cfg.RefreshTokenTTL
	if refreshTTL == 0 {
		refreshTTL = 24 * time.Hour
	}
	return &JWTManager{
		secret:         []byte(secret),
		accessTokenTTL: accessTTL,
		refreshTokenTTL: refreshTTL,
	}
}

// GenerateAccessToken creates a signed JWT access token.
func (m *JWTManager) GenerateAccessToken(userID, email, name string, role Role, orgID string) (string, int64, error) {
	expiresAt := time.Now().Add(m.accessTokenTTL).Unix()
	claims := Claims{
		UserID:         userID,
		Email:          email,
		Name:           name,
		Role:           role,
		OrganizationID: orgID,
		IssuedAt:       time.Now().Unix(),
		ExpiresAt:      expiresAt,
	}
	token, err := m.sign(claims)
	return token, expiresAt * 1000, err // return millis for frontend
}

// GenerateRefreshToken creates a signed JWT refresh token.
func (m *JWTManager) GenerateRefreshToken(userID string) (string, error) {
	claims := Claims{
		UserID:    userID,
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: time.Now().Add(m.refreshTokenTTL).Unix(),
	}
	return m.sign(claims)
}

// Verify validates a JWT token and returns the claims.
func (m *JWTManager) Verify(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	expectedSig := m.hmacSign([]byte(signingInput))
	actualSig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("invalid signature encoding")
	}
	if !hmac.Equal(expectedSig, actualSig) {
		return nil, fmt.Errorf("invalid signature")
	}

	// Decode claims
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid claims encoding")
	}

	var claims Claims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("invalid claims: %w", err)
	}

	// Check expiry
	if time.Now().Unix() > claims.ExpiresAt {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

// sign creates a signed JWT token from claims.
func (m *JWTManager) sign(claims Claims) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(claimsJSON)

	signingInput := header + "." + payload
	signature := base64.RawURLEncoding.EncodeToString(m.hmacSign([]byte(signingInput)))

	return signingInput + "." + signature, nil
}

func (m *JWTManager) hmacSign(data []byte) []byte {
	h := hmac.New(sha256.New, m.secret)
	h.Write(data)
	return h.Sum(nil)
}

// ValidateAPIKey checks if an API key (aitop_...) is valid.
// For the MVP, it accepts demo API keys; production would check the database.
func (m *JWTManager) ValidateAPIKey(key string) *Claims {
	// Demo API keys for development
	demoKeys := map[string]*Claims{
		"aitop_prod_admin_demo_key_001": {UserID: "api-001", Email: "api@aitop.io", Name: "API Key (Admin)", Role: RoleAdmin, OrganizationID: "org-001"},
		"aitop_ci_sre_demo_key_002":     {UserID: "api-002", Email: "ci@aitop.io", Name: "API Key (SRE)", Role: RoleSRE, OrganizationID: "org-001"},
		"aitop_tf_admin_demo_key_003":   {UserID: "api-003", Email: "terraform@aitop.io", Name: "Terraform Provider", Role: RoleAdmin, OrganizationID: "org-001"},
	}
	if claims, ok := demoKeys[key]; ok {
		return claims
	}
	return nil
}

// ── Demo Users (개발/테스트용) ───────────────────────────────────────────────

// DemoUser represents a built-in demo account.
type DemoUser struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Password string `json:"-"`
	Name     string `json:"name"`
	Role     Role   `json:"role"`
	OrgID    string `json:"org_id"`
	OrgName  string `json:"org_name"`
}

// DemoUsers is the list of built-in demo accounts matching frontend DEMO_USERS.
var DemoUsers = []DemoUser{
	{ID: "u-001", Email: "admin@aitop.io", Password: "admin", Name: "Admin", Role: RoleAdmin, OrgID: "org-001", OrgName: "AITOP"},
	{ID: "u-002", Email: "sre@aitop.io", Password: "sre", Name: "SRE Kim", Role: RoleSRE, OrgID: "org-001", OrgName: "AITOP"},
	{ID: "u-003", Email: "ai@aitop.io", Password: "ai", Name: "AI Engineer Park", Role: RoleAIEngineer, OrgID: "org-001", OrgName: "AITOP"},
	{ID: "u-004", Email: "viewer@aitop.io", Password: "viewer", Name: "Viewer Lee", Role: RoleViewer, OrgID: "org-001", OrgName: "AITOP"},
}

// FindDemoUser looks up a demo user by email and password.
func FindDemoUser(email, password string) *DemoUser {
	for _, u := range DemoUsers {
		if u.Email == email && u.Password == password {
			return &u
		}
	}
	return nil
}

// ── HTTP Middleware ──────────────────────────────────────────────────────────

type contextKey string

const claimsKey contextKey = "claims"

// Middleware returns an HTTP middleware that validates JWT tokens.
// Requests to paths in `publicPaths` are allowed without authentication.
func Middleware(jwtMgr *JWTManager, publicPaths []string) func(http.Handler) http.Handler {
	publicSet := make(map[string]bool, len(publicPaths))
	for _, p := range publicPaths {
		publicSet[p] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Allow public paths
			if publicSet[r.URL.Path] || publicSet[r.Method+" "+r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			// Allow healthz
			if r.URL.Path == "/healthz" || r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}
			// Allow agent heartbeat/collect (agents use Bearer project token)
			if strings.HasPrefix(r.URL.Path, "/api/v1/heartbeat") ||
				strings.HasPrefix(r.URL.Path, "/api/v1/collect/") {
				next.ServeHTTP(w, r)
				return
			}
			// Allow SSO endpoints (Phase 21-3)
			if strings.HasPrefix(r.URL.Path, "/api/v1/auth/sso/") {
				next.ServeHTTP(w, r)
				return
			}

			// Extract Bearer token
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"message":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(authHeader, "Bearer ")
			if token == authHeader {
				http.Error(w, `{"message":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			// API Key authentication (Phase 21-2: Terraform Provider)
			if strings.HasPrefix(token, "aitop_") {
				claims := jwtMgr.ValidateAPIKey(token)
				if claims != nil {
					ctx := context.WithValue(r.Context(), claimsKey, claims)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				http.Error(w, `{"message":"invalid API key"}`, http.StatusUnauthorized)
				return
			}

			// Verify JWT token
			claims, err := jwtMgr.Verify(token)
			if err != nil {
				http.Error(w, fmt.Sprintf(`{"message":"%s"}`, err.Error()), http.StatusUnauthorized)
				return
			}

			// Inject claims into context
			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetClaims retrieves JWT claims from the request context.
func GetClaims(r *http.Request) *Claims {
	claims, _ := r.Context().Value(claimsKey).(*Claims)
	return claims
}

// RequireRole returns a middleware that enforces a minimum role level.
func RequireRole(minRole Role) func(http.Handler) http.Handler {
	minLevel := RoleLevel(minRole)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil || RoleLevel(claims.Role) < minLevel {
				http.Error(w, `{"message":"insufficient permissions"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CORS returns a middleware that adds CORS headers.
func CORS(allowOrigins string) func(http.Handler) http.Handler {
	if allowOrigins == "" {
		allowOrigins = "*"
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", allowOrigins)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
