{{/*
aiservice-monitoring Helm chart — 공통 헬퍼 템플릿
*/}}

{{/*
차트 이름 (nameOverride 적용)
*/}}
{{- define "aiservice-monitoring.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
풀네임 (fullnameOverride 적용, Release.Name + Chart.Name 조합)
*/}}
{{- define "aiservice-monitoring.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
차트 버전 레이블 (Chart.Name-Chart.Version)
*/}}
{{- define "aiservice-monitoring.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
공통 레이블 (모든 리소스에 적용)
*/}}
{{- define "aiservice-monitoring.labels" -}}
helm.sh/chart: {{ include "aiservice-monitoring.chart" . }}
{{ include "aiservice-monitoring.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: aiservice-monitoring
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
셀렉터 레이블 (Deployment/Service matchLabels에 사용)
*/}}
{{- define "aiservice-monitoring.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aiservice-monitoring.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount 이름
*/}}
{{- define "aiservice-monitoring.serviceAccountName" -}}
{{- printf "%s-otel-collector" (include "aiservice-monitoring.fullname" .) }}
{{- end }}

{{/*
네임스페이스 (Release.Namespace 기본값)
*/}}
{{- define "aiservice-monitoring.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride }}
{{- end }}
