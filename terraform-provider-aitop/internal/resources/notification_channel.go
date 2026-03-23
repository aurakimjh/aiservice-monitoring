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

var _ resource.Resource = &NotificationChannelResource{}

type NotificationChannelResource struct{ client *client.Client }
type notificationChannelModel struct {
	ID      types.String `tfsdk:"id"`
	Name    types.String `tfsdk:"name"`
	Type    types.String `tfsdk:"type"`
	Config  types.String `tfsdk:"config"`
	Enabled types.Bool   `tfsdk:"enabled"`
}

func NewNotificationChannelResource() resource.Resource { return &NotificationChannelResource{} }

func (r *NotificationChannelResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_notification_channel"
}

func (r *NotificationChannelResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages an AITOP notification channel.",
		Attributes: map[string]schema.Attribute{
			"id":      schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
			"name":    schema.StringAttribute{Required: true},
			"type":    schema.StringAttribute{Required: true, Description: "Channel type: slack, email, pagerduty, webhook, teams"},
			"config":  schema.StringAttribute{Optional: true, Sensitive: true, Description: "JSON-encoded channel configuration"},
			"enabled": schema.BoolAttribute{Optional: true},
		},
	}
}

func (r *NotificationChannelResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData != nil {
		r.client = req.ProviderData.(*client.Client)
	}
}

func (r *NotificationChannelResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan notificationChannelModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "type": plan.Type.ValueString(), "config": plan.Config.ValueString(), "enabled": plan.Enabled.ValueBool(), "managed_by": "terraform"}
	result, err := r.client.Create("/alerts/channels", body)
	if err != nil {
		resp.Diagnostics.AddError("Create Notification Channel", err.Error())
		return
	}
	plan.ID = types.StringValue(fmt.Sprintf("%v", result["channel_id"]))
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *NotificationChannelResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state notificationChannelModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *NotificationChannelResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan notificationChannelModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	body := map[string]interface{}{"name": plan.Name.ValueString(), "type": plan.Type.ValueString(), "config": plan.Config.ValueString(), "enabled": plan.Enabled.ValueBool()}
	_, err := r.client.Update("/alerts/channels/"+plan.ID.ValueString(), body)
	if err != nil {
		resp.Diagnostics.AddError("Update Notification Channel", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *NotificationChannelResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state notificationChannelModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.Delete("/alerts/channels/" + state.ID.ValueString()); err != nil {
		resp.Diagnostics.AddError("Delete Notification Channel", err.Error())
	}
}
