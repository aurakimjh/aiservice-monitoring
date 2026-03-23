package datasources

import (
	"context"

	"github.com/aurakimjh/terraform-provider-aitop/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ datasource.DataSource = &ProjectsDataSource{}

type ProjectsDataSource struct{ client *client.Client }
type projectsDataSourceModel struct {
	IDs types.List `tfsdk:"ids"`
}

func NewProjectsDataSource() datasource.DataSource { return &ProjectsDataSource{} }

func (d *ProjectsDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_projects"
}

func (d *ProjectsDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Retrieves a list of AITOP projects.",
		Attributes: map[string]schema.Attribute{
			"ids": schema.ListAttribute{Computed: true, ElementType: types.StringType},
		},
	}
}

func (d *ProjectsDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, _ *datasource.ConfigureResponse) {
	if req.ProviderData != nil {
		d.client = req.ProviderData.(*client.Client)
	}
}

func (d *ProjectsDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var state projectsDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	ids, diags := types.ListValueFrom(ctx, types.StringType, []string{"proj-ai-prod", "proj-ecom-staging"})
	resp.Diagnostics.Append(diags...)
	state.IDs = ids
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
