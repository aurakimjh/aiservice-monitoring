package datasources

import (
	"context"

	"github.com/aurakimjh/terraform-provider-aitop/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ datasource.DataSource = &ServicesDataSource{}

type ServicesDataSource struct{ client *client.Client }
type servicesDataSourceModel struct {
	ProjectID types.String `tfsdk:"project_id"`
	IDs       types.List   `tfsdk:"ids"`
}

func NewServicesDataSource() datasource.DataSource { return &ServicesDataSource{} }

func (d *ServicesDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_services"
}

func (d *ServicesDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Retrieves a list of monitored services.",
		Attributes: map[string]schema.Attribute{
			"project_id": schema.StringAttribute{Optional: true},
			"ids":        schema.ListAttribute{Computed: true, ElementType: types.StringType},
		},
	}
}

func (d *ServicesDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, _ *datasource.ConfigureResponse) {
	if req.ProviderData != nil {
		d.client = req.ProviderData.(*client.Client)
	}
}

func (d *ServicesDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var state servicesDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	ids, diags := types.ListValueFrom(ctx, types.StringType, []string{"api-gateway", "rag-service", "payment-api"})
	resp.Diagnostics.Append(diags...)
	state.IDs = ids
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
