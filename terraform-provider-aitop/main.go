// AITOP Terraform Provider
//
// Manages AITOP monitoring resources as Infrastructure-as-Code:
//   - aitop_alert_policy
//   - aitop_slo
//   - aitop_dashboard
//   - aitop_agent_group
//   - aitop_notification_channel
//
// Data sources:
//   - aitop_agents
//   - aitop_services
//   - aitop_projects
package main

import (
	"context"
	"log"

	"github.com/aurakimjh/terraform-provider-aitop/internal/provider"
	"github.com/hashicorp/terraform-plugin-framework/providerserver"
)

func main() {
	err := providerserver.Serve(context.Background(), provider.New, providerserver.ServeOpts{
		Address: "registry.terraform.io/aurakimjh/aitop",
	})
	if err != nil {
		log.Fatal(err)
	}
}
