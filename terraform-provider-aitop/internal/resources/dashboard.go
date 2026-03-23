package resources

import (
	"context"
	"fmt"

	"github.com/aurakimjh/terraform-provider-aitop/internal/client"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &DashboardResource{}

type DashboardResource struct{ client *client.Client }
type dashboardModel struct {
	ID          types.String `tfsdk:"id"`
	Name        types.String `tfsdk:"name"`
	Description types.String `tfsdk:"description"`
	Widgets     types.String `tfsdk:"widgets"`
}

func NewDashboardResource() resource.Resource { return &DashboardResource{} }

func (r *DashboardResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_dashboard"
}

func (r *DashboardResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages an AITOP dashboard configuration.",
		Attributes: map[string]schema.Attribute{
			"id":          schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
			"name":        schema.StringAttribute{Required: true},
			"description": schema.StringAttribute{Optional: true},
			"widgets":     schema.StringAttribute{Optional: true, Description: "JSON-encoded widget configuration"},
		},
	}
}

func (r *DashboardResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData != nil {
		r.client = req.ProviderData.(*client.Client)
	}
}

func (r *DashboardResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan dashboardModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "description": plan.Description.ValueString(), "widgets": plan.Widgets.ValueString(), "managed_by": "terraform"}
	result, err := r.client.Create("/dashboards", body)
	if err != nil {
		resp.Diagnostics.AddError("Create Dashboard", err.Error())
		return
	}
	plan.ID = types.StringValue(fmt.Sprintf("%v", result["dashboard_id"]))
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *DashboardResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state dashboardModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.Read("/dashboards/" + state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Read Dashboard", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *DashboardResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan dashboardModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "description": plan.Description.ValueString(), "widgets": plan.Widgets.ValueString()}
	_, err := r.client.Update("/dashboards/"+plan.ID.ValueString(), body)
	if err != nil {
		resp.Diagnostics.AddError("Update Dashboard", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *DashboardResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state dashboardModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.Delete("/dashboards/" + state.ID.ValueString()); err != nil {
		resp.Diagnostics.AddError("Delete Dashboard", err.Error())
	}
}
