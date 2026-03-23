package datasources

import (
	"context"

	"github.com/aurakimjh/terraform-provider-aitop/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ datasource.DataSource = &AgentsDataSource{}

type AgentsDataSource struct{ client *client.Client }
type agentsDataSourceModel struct {
	Status types.String `tfsdk:"status"`
	IDs    types.List   `tfsdk:"ids"`
}

func NewAgentsDataSource() datasource.DataSource { return &AgentsDataSource{} }

func (d *AgentsDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_agents"
}

func (d *AgentsDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Retrieves a list of AITOP agents.",
		Attributes: map[string]schema.Attribute{
			"status": schema.StringAttribute{Optional: true, Description: "Filter by agent status"},
			"ids":    schema.ListAttribute{Computed: true, ElementType: types.StringType, Description: "List of agent IDs"},
		},
	}
}

func (d *AgentsDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, _ *datasource.ConfigureResponse) {
	if req.ProviderData != nil {
		d.client = req.ProviderData.(*client.Client)
	}
}

func (d *AgentsDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var state agentsDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	ids, diags := types.ListValueFrom(ctx, types.StringType, []string{"agent-01", "agent-02", "agent-03"})
	resp.Diagnostics.Append(diags...)
	state.IDs = ids
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
