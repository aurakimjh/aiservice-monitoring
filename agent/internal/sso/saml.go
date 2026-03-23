package sso

import (
	"fmt"
)

// SAMLLoginParams holds the parameters for initiating a SAML login.
type SAMLLoginParams struct {
	RedirectURL string
	RequestID   string
}

// InitiateSAMLLogin builds a SAML AuthnRequest and returns the IdP redirect URL.
// In production, this would use github.com/crewjam/saml (Apache 2.0).
func InitiateSAMLLogin(provider *Provider) (*SAMLLoginParams, error) {
	if provider.Protocol != "saml" {
		return nil, fmt.Errorf("provider %s is not SAML", provider.ID)
	}
	if provider.SAMLMetadataURL == "" {
		return nil, fmt.Errorf("SAML IdP metadata URL not configured for provider %s", provider.ID)
	}

	requestID := GenerateState()

	// In production:
	//  1. Parse IdP metadata from SAMLMetadataURL
	//  2. Build AuthnRequest XML
	//  3. Sign with SP private key
	//  4. Base64-encode and URL-encode
	//  5. Redirect to IdP SSO URL with SAMLRequest parameter

	redirectURL := provider.SAMLMetadataURL + "?SAMLRequest=demo&RelayState=" + requestID

	return &SAMLLoginParams{
		RedirectURL: redirectURL,
		RequestID:   requestID,
	}, nil
}

// HandleSAMLACS processes the SAML Assertion Consumer Service callback.
// In production, this would:
//  1. Parse the SAMLResponse POST parameter
//  2. Validate the XML signature against IdP certificate
//  3. Decrypt the assertion if encrypted
//  4. Extract NameID and attribute statements
//
// Library: github.com/crewjam/saml (Apache 2.0)
func HandleSAMLACS(provider *Provider, samlResponse string) (*UserInfo, error) {
	// In production: validate and parse SAML response
	// For MVP, return demo user info
	return &UserInfo{
		ExternalID: "saml-user-demo",
		Email:      "user@" + provider.Name + ".com",
		Name:       "SAML User (" + provider.Name + ")",
		Groups:     []string{"default"},
	}, nil
}

// GenerateSPMetadata generates SAML Service Provider metadata XML.
func GenerateSPMetadata(provider *Provider) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="%s">
  <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="%s"
      index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`, provider.SAMLEntityID, provider.SAMLACS)
}
