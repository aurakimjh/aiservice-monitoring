terraform {
  required_providers {
    aitop = {
      source = "aurakimjh/aitop"
    }
  }
}

provider "aitop" {
  api_url = "http://localhost:8080/api/v1"
  api_key = "aitop_tf_admin_demo_key_003"
}

# Alert Policy
resource "aitop_alert_policy" "high_error_rate" {
  name           = "High Error Rate"
  severity       = "critical"
  target         = "service:api-gateway"
  condition_type = "metric"
  condition      = "error_rate > 5%"
  threshold_type = "static"
  enabled        = true
}

# SLO
resource "aitop_slo" "api_latency" {
  name    = "API P99 Latency"
  service = "api-gateway"
  sli     = "latency_p99 < 500ms"
  target  = 99.9
  window  = "30d"
}

# Notification Channel
resource "aitop_notification_channel" "slack_ops" {
  name    = "#ops-alerts"
  type    = "slack"
  config  = jsonencode({ webhook_url = "https://hooks.slack.com/services/T00/B00/xxx" })
  enabled = true
}

# Dashboard
resource "aitop_dashboard" "overview" {
  name        = "Service Overview"
  description = "High-level service health dashboard"
}

# Data Sources
data "aitop_agents" "all" {}
data "aitop_services" "all" {}
data "aitop_projects" "all" {}
