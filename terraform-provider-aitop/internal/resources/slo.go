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

var _ resource.Resource = &SLOResource{}

type SLOResource struct{ client *client.Client }
type sloModel struct {
	ID      types.String  `tfsdk:"id"`
	Name    types.String  `tfsdk:"name"`
	Service types.String  `tfsdk:"service"`
	SLI     types.String  `tfsdk:"sli"`
	Target  types.Float64 `tfsdk:"target"`
	Window  types.String  `tfsdk:"window"`
}

func NewSLOResource() resource.Resource { return &SLOResource{} }

func (r *SLOResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_slo"
}

func (r *SLOResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages an AITOP SLO definition.",
		Attributes: map[string]schema.Attribute{
			"id":      schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
			"name":    schema.StringAttribute{Required: true},
			"service": schema.StringAttribute{Required: true},
			"sli":     schema.StringAttribute{Required: true, Description: "Service Level Indicator expression"},
			"target":  schema.Float64Attribute{Required: true, Description: "SLO target percentage (e.g., 99.9)"},
			"window":  schema.StringAttribute{Required: true, Description: "Measurement window: 7d, 30d, 90d"},
		},
	}
}

func (r *SLOResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData != nil {
		r.client = req.ProviderData.(*client.Client)
	}
}

func (r *SLOResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan sloModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "service": plan.Service.ValueString(), "sli": plan.SLI.ValueString(), "target": plan.Target.ValueFloat64(), "window": plan.Window.ValueString(), "managed_by": "terraform"}
	result, err := r.client.Create("/slo", body)
	if err != nil {
		resp.Diagnostics.AddError("Create SLO", err.Error())
		return
	}
	plan.ID = types.StringValue(fmt.Sprintf("%v", result["slo_id"]))
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *SLOResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state sloModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.Read("/slo/" + state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Read SLO", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SLOResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan sloModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "service": plan.Service.ValueString(), "sli": plan.SLI.ValueString(), "target": plan.Target.ValueFloat64(), "window": plan.Window.ValueString()}
	_, err := r.client.Update("/slo/"+plan.ID.ValueString(), body)
	if err != nil {
		resp.Diagnostics.AddError("Update SLO", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *SLOResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state sloModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.Delete("/slo/" + state.ID.ValueString()); err != nil {
		resp.Diagnostics.AddError("Delete SLO", err.Error())
	}
}
