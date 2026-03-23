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

var _ resource.Resource = &AlertPolicyResource{}

type AlertPolicyResource struct{ client *client.Client }

type alertPolicyModel struct {
	ID            types.String `tfsdk:"id"`
	Name          types.String `tfsdk:"name"`
	Severity      types.String `tfsdk:"severity"`
	Target        types.String `tfsdk:"target"`
	ConditionType types.String `tfsdk:"condition_type"`
	Condition     types.String `tfsdk:"condition"`
	ThresholdType types.String `tfsdk:"threshold_type"`
	Enabled       types.Bool   `tfsdk:"enabled"`
}

func NewAlertPolicyResource() resource.Resource { return &AlertPolicyResource{} }

func (r *AlertPolicyResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_alert_policy"
}

func (r *AlertPolicyResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages an AITOP alert policy.",
		Attributes: map[string]schema.Attribute{
			"id":             schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
			"name":           schema.StringAttribute{Required: true, Description: "Alert policy name"},
			"severity":       schema.StringAttribute{Required: true, Description: "Severity: critical, warning, info"},
			"target":         schema.StringAttribute{Required: true, Description: "Target service/host pattern"},
			"condition_type": schema.StringAttribute{Required: true, Description: "Condition type: metric, trace, log, composite"},
			"condition":      schema.StringAttribute{Required: true, Description: "Alert condition expression"},
			"threshold_type": schema.StringAttribute{Optional: true, Description: "Threshold type: static, dynamic, forecast"},
			"enabled":        schema.BoolAttribute{Optional: true, Description: "Whether the policy is enabled"},
		},
	}
}

func (r *AlertPolicyResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData != nil {
		r.client = req.ProviderData.(*client.Client)
	}
}

func (r *AlertPolicyResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan alertPolicyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	body := map[string]interface{}{
		"name": plan.Name.ValueString(), "severity": plan.Severity.ValueString(),
		"target": plan.Target.ValueString(), "condition_type": plan.ConditionType.ValueString(),
		"condition": plan.Condition.ValueString(), "threshold_type": plan.ThresholdType.ValueString(),
		"enabled": plan.Enabled.ValueBool(), "managed_by": "terraform",
	}
	result, err := r.client.Create("/alerts/policies", body)
	if err != nil {
		resp.Diagnostics.AddError("Create Alert Policy", err.Error())
		return
	}
	plan.ID = types.StringValue(fmt.Sprintf("%v", result["policy_id"]))
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *AlertPolicyResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state alertPolicyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	result, err := r.client.Read("/alerts/policies/" + state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Read Alert Policy", err.Error())
		return
	}

	if v, ok := result["name"].(string); ok {
		state.Name = types.StringValue(v)
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *AlertPolicyResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan alertPolicyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	body := map[string]interface{}{
		"name": plan.Name.ValueString(), "severity": plan.Severity.ValueString(),
		"target": plan.Target.ValueString(), "condition_type": plan.ConditionType.ValueString(),
		"condition": plan.Condition.ValueString(), "managed_by": "terraform",
	}
	_, err := r.client.Update("/alerts/policies/"+plan.ID.ValueString(), body)
	if err != nil {
		resp.Diagnostics.AddError("Update Alert Policy", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *AlertPolicyResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state alertPolicyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.Delete("/alerts/policies/" + state.ID.ValueString()); err != nil {
		resp.Diagnostics.AddError("Delete Alert Policy", err.Error())
	}
}
