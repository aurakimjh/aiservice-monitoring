package sso

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
)

// OIDCLoginParams holds the parameters for initiating an OIDC login.
type OIDCLoginParams struct {
	AuthorizationURL string
	State            string
	Nonce            string
	CodeVerifier     string
	CodeChallenge    string
}

// InitiateOIDCLogin builds the OIDC authorization URL with PKCE.
// In production, this would use github.com/coreos/go-oidc/v3 (Apache 2.0).
func InitiateOIDCLogin(provider *Provider, callbackURL string) (*OIDCLoginParams, error) {
	if provider.Protocol != "oidc" {
		return nil, fmt.Errorf("provider %s is not OIDC", provider.ID)
	}
	if provider.OIDCIssuer == "" {
		return nil, fmt.Errorf("OIDC issuer not configured for provider %s", provider.ID)
	}

	state := GenerateState()
	nonce := GenerateState()

	// Generate PKCE code verifier and challenge (S256)
	verifierBytes := make([]byte, 32)
	_, _ = rand.Read(verifierBytes)
	codeVerifier := base64.RawURLEncoding.EncodeToString(verifierBytes)
	challengeHash := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(challengeHash[:])

	// Build authorization URL
	// In production, discovery document (.well-known/openid-configuration) would be fetched
	authEndpoint := provider.OIDCIssuer + "/authorize"

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {provider.OIDCClientID},
		"redirect_uri":          {callbackURL},
		"scope":                 {provider.OIDCScopes},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}

	return &OIDCLoginParams{
		AuthorizationURL: authEndpoint + "?" + params.Encode(),
		State:            state,
		Nonce:            nonce,
		CodeVerifier:     codeVerifier,
		CodeChallenge:    codeChallenge,
	}, nil
}

// HandleOIDCCallback processes the OIDC callback and returns user info.
// In production, this would:
//  1. Exchange the authorization code for tokens using PKCE code_verifier
//  2. Validate the ID token signature via JWKS
//  3. Extract user claims from the ID token
//
// Library: github.com/coreos/go-oidc/v3 (Apache 2.0)
func HandleOIDCCallback(provider *Provider, code, state, expectedState, codeVerifier string) (*UserInfo, error) {
	if state != expectedState {
		return nil, fmt.Errorf("state mismatch")
	}

	// In production: exchange code for tokens via token endpoint
	// For MVP, return demo user info
	return &UserInfo{
		ExternalID: "oidc-user-" + state[:8],
		Email:      "user@" + provider.Name + ".com",
		Name:       "SSO User (" + provider.Name + ")",
		Groups:     []string{"default"},
	}, nil
}
