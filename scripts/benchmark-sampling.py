#!/usr/bin/env python3
"""
Tail Sampling 비율 시뮬레이션 및 비용 추정 도구

실제 트래픽 분포를 입력받아 현재 Tail Sampling 정책이
얼마나 많은 트레이스를 보존/폐기하는지 시뮬레이션하고
월간 저장 비용을 추정합니다.

사용법:
    python scripts/benchmark-sampling.py
    python scripts/benchmark-sampling.py --rps 500 --error-rate 0.02
    python scripts/benchmark-sampling.py --export-csv results.csv
"""

import argparse
import csv
import sys
from dataclasses import dataclass, field
from typing import List


@dataclass
class TrafficProfile:
    """트래픽 구성 프로파일"""
    rps: float = 100.0                 # 초당 요청 수

    # 트레이스 분류 비율 (합계 = 1.0)
    error_rate: float = 0.02           # 에러 트레이스 비율
    high_latency_rate: float = 0.03    # 고레이턴시 (>5s) 비율
    high_ttft_rate: float = 0.05       # 고TTFT (>2s) 비율
    guardrail_block_rate: float = 0.03 # 가드레일 차단 비율
    external_timeout_rate: float = 0.01# 외부 API 타임아웃 비율
    enterprise_user_rate: float = 0.10 # 엔터프라이즈 사용자 비율
    gpu_pressure_rate: float = 0.08    # GPU VRAM 고압 트레이스 비율

    # Sampling 정책 보존율
    policy_preserve_rate: float = 1.0  # 정책 매칭 시 보존율 (기본 100%)
    gpu_preserve_rate: float = 0.50    # GPU 압 트레이스 보존율
    baseline_rate: float = 0.05        # 확률적 기준선 보존율

    # 트레이스 크기 추정
    avg_trace_size_kb: float = 80.0    # 평균 트레이스 크기 (KB)

    # 비용 기준 (AWS S3 ap-northeast-2)
    storage_cost_per_gb_month: float = 0.025  # $/GB/월


@dataclass
class SamplingResult:
    """시뮬레이션 결과"""
    policy_name: str
    matched_traces_per_day: float
    preserved_traces_per_day: float
    preserve_rate: float


def simulate(profile: TrafficProfile) -> dict:
    """Tail Sampling 정책별 보존율 시뮬레이션"""
    traces_per_day = profile.rps * 86400

    # 각 정책별 일일 보존 트레이스 수 계산
    # 주의: 트레이스가 여러 정책에 중복 매칭될 수 있음 (OR 조건)
    # 간소화: 각 카테고리를 독립적으로 가정 (실제는 겹침 있음)

    policies: List[SamplingResult] = [
        SamplingResult(
            "에러 트레이스",
            traces_per_day * profile.error_rate,
            traces_per_day * profile.error_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "고레이턴시 E2E (>5s)",
            traces_per_day * profile.high_latency_rate,
            traces_per_day * profile.high_latency_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "고TTFT LLM (>2s)",
            traces_per_day * profile.high_ttft_rate,
            traces_per_day * profile.high_ttft_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "가드레일 차단/REASK",
            traces_per_day * profile.guardrail_block_rate,
            traces_per_day * profile.guardrail_block_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "외부 API 타임아웃",
            traces_per_day * profile.external_timeout_rate,
            traces_per_day * profile.external_timeout_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "엔터프라이즈 사용자",
            traces_per_day * profile.enterprise_user_rate,
            traces_per_day * profile.enterprise_user_rate * profile.policy_preserve_rate,
            profile.policy_preserve_rate,
        ),
        SamplingResult(
            "GPU 고압 트레이스",
            traces_per_day * profile.gpu_pressure_rate,
            traces_per_day * profile.gpu_pressure_rate * profile.gpu_preserve_rate,
            profile.gpu_preserve_rate,
        ),
    ]

    # 정책 매칭 합계 (중복 제거를 위해 min 처리)
    total_policy_rate = min(
        1.0,
        profile.error_rate + profile.high_latency_rate + profile.high_ttft_rate +
        profile.guardrail_block_rate + profile.external_timeout_rate +
        profile.enterprise_user_rate + profile.gpu_pressure_rate,
    )
    remainder_rate = max(0.0, 1.0 - total_policy_rate)

    # 기준선 샘플링 (나머지 트레이스 중 일부)
    baseline = SamplingResult(
        "확률적 기준선 (나머지 5%)",
        traces_per_day * remainder_rate,
        traces_per_day * remainder_rate * profile.baseline_rate,
        profile.baseline_rate,
    )
    policies.append(baseline)

    total_preserved = sum(p.preserved_traces_per_day for p in policies)
    preservation_rate = total_preserved / traces_per_day if traces_per_day > 0 else 0

    # 월간 저장 비용 계산
    preserved_per_month = total_preserved * 30
    storage_gb_per_month = (preserved_per_month * profile.avg_trace_size_kb) / (1024 * 1024)
    cost_per_month = storage_gb_per_month * profile.storage_cost_per_gb_month

    # 샘플링 없을 때 전체 비용
    total_gb_per_month = (traces_per_day * 30 * profile.avg_trace_size_kb) / (1024 * 1024)
    total_cost_per_month = total_gb_per_month * profile.storage_cost_per_gb_month
    savings_pct = (1 - preservation_rate) * 100

    return {
        "profile": profile,
        "traces_per_day": traces_per_day,
        "policies": policies,
        "total_preserved_per_day": total_preserved,
        "preservation_rate": preservation_rate,
        "storage_gb_per_month": storage_gb_per_month,
        "cost_per_month": cost_per_month,
        "total_cost_no_sampling": total_cost_per_month,
        "savings_pct": savings_pct,
        "savings_per_month": total_cost_per_month - cost_per_month,
    }


def print_report(result: dict) -> None:
    """시뮬레이션 결과를 콘솔에 출력합니다."""
    p = result["profile"]

    print(f"\n{'='*65}")
    print(f"  Tail Sampling 비용 시뮬레이션 리포트")
    print(f"{'='*65}")
    print(f"  입력 파라미터:")
    print(f"    RPS:              {p.rps:>10.1f}")
    print(f"    일일 트레이스:    {result['traces_per_day']:>10,.0f}")
    print(f"    평균 트레이스 크기: {p.avg_trace_size_kb:>8.0f} KB")
    print()

    print(f"  ┌{'─'*40}┬{'─'*12}┬{'─'*10}┐")
    print(f"  │ {'정책 이름':<38} │ {'일일 보존':>10} │ {'보존율':>8} │")
    print(f"  ├{'─'*40}┼{'─'*12}┼{'─'*10}┤")
    for pol in result["policies"]:
        print(f"  │ {pol.policy_name:<38} │ {pol.preserved_traces_per_day:>10,.0f} │ {pol.preserve_rate:>7.0%} │")
    print(f"  ├{'─'*40}┼{'─'*12}┼{'─'*10}┤")
    print(f"  │ {'합계':.<38} │ {result['total_preserved_per_day']:>10,.0f} │ {result['preservation_rate']:>7.1%} │")
    print(f"  └{'─'*40}┴{'─'*12}┴{'─'*10}┘")

    print()
    print(f"  비용 분석 (월간, S3 ap-northeast-2 기준):")
    print(f"    샘플링 미적용 시:  ${result['total_cost_no_sampling']:>8.2f}/월  "
          f"({result['total_cost_no_sampling']/0.025*1024:.0f} GB)")
    print(f"    Tail Sampling 후:  ${result['cost_per_month']:>8.2f}/월  "
          f"({result['storage_gb_per_month']:.0f} GB)")
    print(f"    절감액:            ${result['savings_per_month']:>8.2f}/월")
    print(f"    절감율:            {result['savings_pct']:>7.1f}%")
    print(f"{'='*65}\n")


def export_csv(result: dict, path: str) -> None:
    """결과를 CSV로 내보냅니다."""
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["정책", "일일 매칭", "일일 보존", "보존율"])
        for pol in result["policies"]:
            writer.writerow([
                pol.policy_name,
                f"{pol.matched_traces_per_day:.0f}",
                f"{pol.preserved_traces_per_day:.0f}",
                f"{pol.preserve_rate:.1%}",
            ])
    print(f"CSV 저장 완료: {path}")


def main():
    parser = argparse.ArgumentParser(description="Tail Sampling 비용 시뮬레이션")
    parser.add_argument("--rps", type=float, default=100.0, help="초당 요청 수 (기본값: 100)")
    parser.add_argument("--error-rate", type=float, default=0.02, help="에러 비율 (기본값: 0.02)")
    parser.add_argument("--enterprise-rate", type=float, default=0.10, help="엔터프라이즈 사용자 비율")
    parser.add_argument("--baseline-rate", type=float, default=0.05, help="확률적 기준선 보존율")
    parser.add_argument("--export-csv", metavar="PATH", help="결과를 CSV로 저장")
    args = parser.parse_args()

    profile = TrafficProfile(
        rps=args.rps,
        error_rate=args.error_rate,
        enterprise_user_rate=args.enterprise_rate,
        baseline_rate=args.baseline_rate,
    )
    result = simulate(profile)
    print_report(result)

    if args.export_csv:
        export_csv(result, args.export_csv)


if __name__ == "__main__":
    main()
