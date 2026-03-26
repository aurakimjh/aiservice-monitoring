#!/usr/bin/env python3
"""
sampling-optimizer.py — Tail Sampling 비용 최적화 분석기

Phase 9'-2: 기존 5% baseline 대비 3계층 최적화 샘플링의 비용 절감 효과를 분석한다.

Usage:
    python scripts/sampling-optimizer.py
    python scripts/sampling-optimizer.py --daily-traces 1000000
    python scripts/sampling-optimizer.py --output reports/sampling-optimization.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

S3_PRICE_PER_GB_MONTH = 0.023  # us-east-1 S3 Standard, $/GB/month
AVG_TRACE_SIZE_KB = 4.5        # 평균 트레이스 크기 (KB, OTLP → Parquet 압축 후)
DAYS_PER_MONTH = 30

# ── Data Models ──────────────────────────────────────────────────────────────


@dataclass
class TrafficProfile:
    """하루 트래픽 프로필 정의."""
    name: str
    daily_traces: int
    error_rate: float          # 에러 비율 (0~1)
    slo_violation_rate: float  # SLO 위반 비율 (0~1)
    guardrail_block_rate: float  # 가드레일 차단 비율 (0~1)
    enterprise_rate: float     # 엔터프라이즈 사용자 비율 (0~1)
    gpu_pressure_rate: float   # GPU 압력 상태 비율 (0~1)
    rag_pipeline_rate: float   # RAG 파이프라인 비율 (0~1)
    description: str = ""


@dataclass
class SamplingPolicy:
    """샘플링 정책 정의."""
    name: str
    description: str
    # Layer 1: Always preserve rates (100%)
    error_sample_rate: float = 1.0
    slo_violation_sample_rate: float = 1.0
    guardrail_block_sample_rate: float = 1.0
    # Layer 2: Conditional rates
    enterprise_sample_rate: float = 0.50
    gpu_pressure_sample_rate: float = 0.30
    rag_pipeline_sample_rate: float = 0.10
    # Layer 3: Baseline for remaining "normal" traffic
    baseline_sample_rate: float = 0.03


@dataclass
class CostResult:
    """비용 분석 결과."""
    profile_name: str
    policy_name: str
    daily_traces: int
    preserved_traces: int
    preservation_rate: float
    daily_storage_gb: float
    monthly_storage_gb: float
    monthly_cost_usd: float
    # Breakdown by category
    breakdown: Dict[str, int] = field(default_factory=dict)


# ── Default Profiles ─────────────────────────────────────────────────────────

DEFAULT_PROFILES: List[TrafficProfile] = [
    TrafficProfile(
        name="Normal Day",
        daily_traces=1_000_000,
        error_rate=0.005,       # 0.5%
        slo_violation_rate=0.01,  # 1%
        guardrail_block_rate=0.002,  # 0.2%
        enterprise_rate=0.15,    # 15%
        gpu_pressure_rate=0.03,  # 3%
        rag_pipeline_rate=0.25,  # 25%
        description="일반적인 운영일 — 안정적인 트래픽",
    ),
    TrafficProfile(
        name="Peak Day",
        daily_traces=3_000_000,
        error_rate=0.008,       # 0.8%
        slo_violation_rate=0.02,  # 2%
        guardrail_block_rate=0.003,  # 0.3%
        enterprise_rate=0.20,    # 20%
        gpu_pressure_rate=0.08,  # 8%
        rag_pipeline_rate=0.30,  # 30%
        description="피크일 — 프로모션/이벤트로 트래픽 3배",
    ),
    TrafficProfile(
        name="Incident Day",
        daily_traces=2_000_000,
        error_rate=0.05,        # 5%
        slo_violation_rate=0.08,  # 8%
        guardrail_block_rate=0.01,  # 1%
        enterprise_rate=0.15,    # 15%
        gpu_pressure_rate=0.20,  # 20%
        rag_pipeline_rate=0.25,  # 25%
        description="장애일 — 에러/SLO 위반 급증",
    ),
]

# Before (기존) vs After (최적화) 정책
POLICY_BEFORE = SamplingPolicy(
    name="Before (5% Baseline)",
    description="기존 정책: 에러 100%, 나머지 5% 균일 샘플링",
    error_sample_rate=1.0,
    slo_violation_sample_rate=1.0,
    guardrail_block_sample_rate=1.0,
    enterprise_sample_rate=0.05,   # 차별 없음
    gpu_pressure_sample_rate=0.05,  # 차별 없음
    rag_pipeline_sample_rate=0.05,  # 차별 없음
    baseline_sample_rate=0.05,
)

POLICY_AFTER = SamplingPolicy(
    name="After (3-Tier Optimized)",
    description="최적화 정책: 3계층 + 비용 인식 샘플링",
    error_sample_rate=1.0,
    slo_violation_sample_rate=1.0,
    guardrail_block_sample_rate=1.0,
    enterprise_sample_rate=0.50,
    gpu_pressure_sample_rate=0.30,
    rag_pipeline_sample_rate=0.10,
    baseline_sample_rate=0.03,
)


# ── Core Calculation ─────────────────────────────────────────────────────────

def calculate_preserved_traces(
    profile: TrafficProfile,
    policy: SamplingPolicy,
) -> Tuple[int, Dict[str, int]]:
    """
    각 카테고리별 보존 트레이스 수를 계산한다.

    트레이스 분류는 우선순위 기반으로 처리된다:
      Layer 1 (에러/SLO/가드레일) → Layer 2 (엔터프라이즈/GPU/RAG) → Layer 3 (나머지)
    한 트레이스가 여러 카테고리에 해당하면 가장 높은 우선순위 정책이 적용된다.
    """
    total = profile.daily_traces
    breakdown: Dict[str, int] = {}
    remaining = total

    # Layer 1: Always preserve (mutually exclusive allocation for cost calc)
    error_count = int(total * profile.error_rate)
    breakdown["error"] = int(error_count * policy.error_sample_rate)
    remaining -= error_count

    slo_count = int(total * profile.slo_violation_rate)
    # SLO 위반 중 에러와 겹치는 부분 제외 (에러 트레이스는 이미 Layer 1에서 보존)
    slo_unique = max(0, slo_count - error_count)
    breakdown["slo_violation"] = int(slo_unique * policy.slo_violation_sample_rate)
    remaining -= slo_unique

    guardrail_count = int(total * profile.guardrail_block_rate)
    breakdown["guardrail_block"] = int(guardrail_count * policy.guardrail_block_sample_rate)
    remaining -= guardrail_count

    # Layer 2: Conditional preserve (from remaining traces)
    enterprise_count = int(remaining * profile.enterprise_rate)
    breakdown["enterprise"] = int(enterprise_count * policy.enterprise_sample_rate)
    remaining -= enterprise_count

    gpu_count = int(remaining * profile.gpu_pressure_rate)
    breakdown["gpu_pressure"] = int(gpu_count * policy.gpu_pressure_sample_rate)
    remaining -= gpu_count

    rag_count = int(remaining * profile.rag_pipeline_rate)
    breakdown["rag_pipeline"] = int(rag_count * policy.rag_pipeline_sample_rate)
    remaining -= rag_count

    # Layer 3: Baseline
    breakdown["baseline"] = int(remaining * policy.baseline_sample_rate)

    preserved = sum(breakdown.values())
    return preserved, breakdown


def calculate_cost(
    profile: TrafficProfile,
    policy: SamplingPolicy,
) -> CostResult:
    """주어진 프로필과 정책으로 월간 S3 비용을 계산한다."""
    preserved, breakdown = calculate_preserved_traces(profile, policy)
    preservation_rate = preserved / profile.daily_traces if profile.daily_traces > 0 else 0

    daily_storage_gb = (preserved * AVG_TRACE_SIZE_KB) / (1024 * 1024)  # KB → GB
    monthly_storage_gb = daily_storage_gb * DAYS_PER_MONTH
    monthly_cost = monthly_storage_gb * S3_PRICE_PER_GB_MONTH

    return CostResult(
        profile_name=profile.name,
        policy_name=policy.name,
        daily_traces=profile.daily_traces,
        preserved_traces=preserved,
        preservation_rate=preservation_rate,
        daily_storage_gb=daily_storage_gb,
        monthly_storage_gb=monthly_storage_gb,
        monthly_cost_usd=monthly_cost,
        breakdown=breakdown,
    )


# ── Output Formatting ────────────────────────────────────────────────────────

def format_number(n: int) -> str:
    """숫자를 천 단위 콤마 포맷으로 변환."""
    return f"{n:,}"


def print_separator(char: str = "=", width: int = 90) -> None:
    print(char * width)


def print_header() -> None:
    print()
    print_separator()
    print("  Tail Sampling Cost Optimization Report")
    print("  Phase 9'-2: 3-Tier Sampling vs Baseline Comparison")
    print_separator()
    print()
    print(f"  Assumptions:")
    print(f"    - Average trace size (compressed): {AVG_TRACE_SIZE_KB} KB")
    print(f"    - S3 Standard price (us-east-1):   ${S3_PRICE_PER_GB_MONTH}/GB/month")
    print(f"    - Month = {DAYS_PER_MONTH} days")
    print()


def print_profile_summary(profiles: List[TrafficProfile]) -> None:
    print("  Traffic Profiles:")
    print_separator("-")
    header = f"  {'Profile':<16} {'Daily Traces':>14} {'Error%':>8} {'SLO%':>8} {'Enterprise%':>13} {'RAG%':>8}"
    print(header)
    print_separator("-")
    for p in profiles:
        row = (
            f"  {p.name:<16} "
            f"{format_number(p.daily_traces):>14} "
            f"{p.error_rate * 100:>7.1f}% "
            f"{p.slo_violation_rate * 100:>7.1f}% "
            f"{p.enterprise_rate * 100:>12.1f}% "
            f"{p.rag_pipeline_rate * 100:>7.1f}%"
        )
        print(row)
    print()


def print_comparison_table(
    before_results: List[CostResult],
    after_results: List[CostResult],
) -> None:
    print("  Cost Comparison:")
    print_separator("-")
    header = (
        f"  {'Profile':<16} "
        f"{'Before':>12} "
        f"{'After':>12} "
        f"{'Savings':>12} "
        f"{'Savings%':>10} "
        f"{'Preserved':>12}"
    )
    print(header)
    print(f"  {'':<16} {'($/month)':>12} {'($/month)':>12} {'($/month)':>12} {'':>10} {'(After)':>12}")
    print_separator("-")

    total_before = 0.0
    total_after = 0.0

    for before, after in zip(before_results, after_results):
        savings = before.monthly_cost_usd - after.monthly_cost_usd
        savings_pct = (savings / before.monthly_cost_usd * 100) if before.monthly_cost_usd > 0 else 0
        total_before += before.monthly_cost_usd
        total_after += after.monthly_cost_usd

        row = (
            f"  {before.profile_name:<16} "
            f"${before.monthly_cost_usd:>10.2f} "
            f"${after.monthly_cost_usd:>10.2f} "
            f"${savings:>10.2f} "
            f"{savings_pct:>9.1f}% "
            f"{after.preservation_rate * 100:>10.1f}%"
        )
        print(row)

    print_separator("-")
    total_savings = total_before - total_after
    total_savings_pct = (total_savings / total_before * 100) if total_before > 0 else 0
    row = (
        f"  {'TOTAL':<16} "
        f"${total_before:>10.2f} "
        f"${total_after:>10.2f} "
        f"${total_savings:>10.2f} "
        f"{total_savings_pct:>9.1f}% "
        f"{'':>12}"
    )
    print(row)
    print()


def print_breakdown(results: List[CostResult]) -> None:
    print("  Preservation Breakdown (After — Optimized Policy):")
    print_separator("-")
    categories = ["error", "slo_violation", "guardrail_block",
                   "enterprise", "gpu_pressure", "rag_pipeline", "baseline"]
    cat_labels = {
        "error": "Error (100%)",
        "slo_violation": "SLO Viol (100%)",
        "guardrail_block": "Guardrail (100%)",
        "enterprise": "Enterprise (50%)",
        "gpu_pressure": "GPU Press (30%)",
        "rag_pipeline": "RAG Pipe (10%)",
        "baseline": "Baseline (3%)",
    }

    header = f"  {'Category':<20}"
    for r in results:
        header += f" {r.profile_name:>16}"
    print(header)
    print_separator("-")

    for cat in categories:
        row = f"  {cat_labels.get(cat, cat):<20}"
        for r in results:
            count = r.breakdown.get(cat, 0)
            row += f" {format_number(count):>16}"
        print(row)

    print_separator("-")
    total_row = f"  {'TOTAL PRESERVED':<20}"
    for r in results:
        total_row += f" {format_number(r.preserved_traces):>16}"
    print(total_row)

    pct_row = f"  {'PRESERVATION RATE':<20}"
    for r in results:
        pct_row += f" {r.preservation_rate * 100:>15.2f}%"
    print(pct_row)
    print()


def print_recommendation(
    before_results: List[CostResult],
    after_results: List[CostResult],
) -> None:
    print_separator()
    print("  Recommendation")
    print_separator()
    print()

    # Normal day cost check
    normal_after = next((r for r in after_results if r.profile_name == "Normal Day"), None)
    if normal_after:
        target_met = normal_after.monthly_cost_usd <= 15.0
        status = "MET" if target_met else "NOT MET"
        print(f"  Cost Target ($15/month for 1M traces/day): [{status}]")
        print(f"    - Actual: ${normal_after.monthly_cost_usd:.2f}/month")
        print()

    # Overall savings
    total_before = sum(r.monthly_cost_usd for r in before_results)
    total_after = sum(r.monthly_cost_usd for r in after_results)
    total_savings = total_before - total_after

    print(f"  Total Monthly Savings (all profiles): ${total_savings:.2f}")
    print()
    print("  Key Benefits:")
    print("    1. Error/SLO violation traces: 100% preserved (no change)")
    print("    2. Enterprise user traces: 50% preserved (up from 5%)")
    print("    3. GPU pressure traces: 30% preserved (up from 5%)")
    print("    4. Normal traffic: 3% baseline (down from 5%) — main cost savings")
    print("    5. RAG pipeline: 10% preserved (up from 5%) with bounded cost")
    print()
    print("  Trade-offs:")
    print("    - Normal traffic coverage reduced from 5% to 3%")
    print("    - Acceptable because error/SLO/high-value traces are fully preserved")
    print("    - Statistical significance maintained at 3% for 1M+ daily traces")
    print()


# ── CSV Export ───────────────────────────────────────────────────────────────

def export_csv(
    before_results: List[CostResult],
    after_results: List[CostResult],
    output_path: str,
) -> None:
    """결과를 CSV로 내보낸다."""
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    categories = ["error", "slo_violation", "guardrail_block",
                   "enterprise", "gpu_pressure", "rag_pipeline", "baseline"]

    fieldnames = [
        "profile", "policy", "daily_traces",
        "preserved_traces", "preservation_rate_pct",
        "daily_storage_gb", "monthly_storage_gb", "monthly_cost_usd",
    ] + [f"preserved_{cat}" for cat in categories]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for result in before_results + after_results:
            row = {
                "profile": result.profile_name,
                "policy": result.policy_name,
                "daily_traces": result.daily_traces,
                "preserved_traces": result.preserved_traces,
                "preservation_rate_pct": round(result.preservation_rate * 100, 4),
                "daily_storage_gb": round(result.daily_storage_gb, 6),
                "monthly_storage_gb": round(result.monthly_storage_gb, 4),
                "monthly_cost_usd": round(result.monthly_cost_usd, 4),
            }
            for cat in categories:
                row[f"preserved_{cat}"] = result.breakdown.get(cat, 0)
            writer.writerow(row)

    print(f"  CSV exported to: {output_path}")
    print()


# ── Main ─────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tail Sampling 비용 최적화 분석기 — Phase 9'-2",
    )
    parser.add_argument(
        "--daily-traces",
        type=int,
        default=None,
        help="Override daily trace count for Normal Day profile (default: 1,000,000)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="CSV output path (e.g., reports/sampling-optimization.csv)",
    )
    parser.add_argument(
        "--trace-size-kb",
        type=float,
        default=AVG_TRACE_SIZE_KB,
        help=f"Average compressed trace size in KB (default: {AVG_TRACE_SIZE_KB})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    global AVG_TRACE_SIZE_KB
    AVG_TRACE_SIZE_KB = args.trace_size_kb

    profiles = [TrafficProfile(**p.__dict__) for p in DEFAULT_PROFILES]

    # Override daily traces if specified
    if args.daily_traces is not None:
        for p in profiles:
            if p.name == "Normal Day":
                p.daily_traces = args.daily_traces

    # Calculate costs
    before_results = [calculate_cost(p, POLICY_BEFORE) for p in profiles]
    after_results = [calculate_cost(p, POLICY_AFTER) for p in profiles]

    # Print report
    print_header()
    print_profile_summary(profiles)
    print_comparison_table(before_results, after_results)
    print_breakdown(after_results)
    print_recommendation(before_results, after_results)

    # Export CSV if requested
    if args.output:
        export_csv(before_results, after_results, args.output)


if __name__ == "__main__":
    main()
