// Package provider implements the AITOP Terraform provider.
package provider

import (
	"context"

	"github.com/aurakimjh/terraform-provider-aitop/internal/client"
	"github.com/aurakimjh/terraform-provider-aitop/internal/datasources"
	"github.com/aurakimjh/terraform-provider-aitop/internal/resources"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ provider.Provider = &AitopProvider{}

// AitopProvider is the AITOP Terraform provider implementation.
type AitopProvider struct {
	version string
}

type aitopProviderModel struct {
	APIURL types.String `tfsdk:"api_url"`
	APIKey types.String `tfsdk:"api_key"`
}

// New creates a new AITOP provider factory.
func New() provider.Provider {
	return &AitopProvider{version: "0.1.0"}
}

func (p *AitopProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "aitop"
	resp.Version = p.version
}

func (p *AitopProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "AITOP AI Service Monitoring — Terraform Provider for managing monitoring resources as IaC.",
		Attributes: map[string]schema.Attribute{
			"api_url": schema.StringAttribute{
				Description: "AITOP Collection Server API URL (e.g., http://localhost:8080/api/v1)",
				Optional:    true,
			},
			"api_key": schema.StringAttribute{
				Description: "AITOP API key (from Settings > API Keys, prefixed with aitop_)",
				Optional:    true,
				Sensitive:   true,
			},
		},
	}
}

func (p *AitopProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config aitopProviderModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	apiURL := "http://localhost:8080/api/v1"
	if !config.APIURL.IsNull() && !config.APIURL.IsUnknown() {
		apiURL = config.APIURL.ValueString()
	}

	apiKey := ""
	if !config.APIKey.IsNull() && !config.APIKey.IsUnknown() {
		apiKey = config.APIKey.ValueString()
	}

	c := client.New(apiURL, apiKey)
	resp.DataSourceData = c
	resp.ResourceData = c
}

func (p *AitopProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		resources.NewAlertPolicyResource,
		resources.NewSLOResource,
		resources.NewDashboardResource,
		resources.NewAgentGroupResource,
		resources.NewNotificationChannelResource,
	}
}

func (p *AitopProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		datasources.NewAgentsDataSource,
		datasources.NewServicesDataSource,
		datasources.NewProjectsDataSource,
	}
}
