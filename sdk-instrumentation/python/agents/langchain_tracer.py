"""
LangChain / LangGraph — OTel 콜백 핸들러

LangChain의 BaseCallbackHandler를 구현하여 체인 실행 흐름을
OTel Span 계층으로 변환합니다. LangGraph의 노드 전환과 재귀 깊이도
추적하여 에이전트 무한 루프를 조기에 탐지합니다.

사용법:
    from sdk_instrumentation.python.agents.langchain_tracer import OtelCallbackHandler

    handler = OtelCallbackHandler()
    chain = LLMChain(llm=llm, prompt=prompt, callbacks=[handler])
    # 또는
    graph.compile(callbacks=[handler])
"""

import time
import uuid
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from opentelemetry import metrics, trace
from opentelemetry.trace import SpanKind, StatusCode

try:
    from langchain.callbacks.base import BaseCallbackHandler
    from langchain.schema import AgentAction, AgentFinish, LLMResult
except ImportError:
    raise ImportError("langchain이 설치되어 있지 않습니다: pip install langchain")

tracer = trace.get_tracer("ai.agent.langchain", "1.0.0")
meter  = metrics.get_meter("ai.agent.langchain", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

chain_duration = meter.create_histogram(
    name="agent.chain.step.duration",
    description="LangChain 체인 단계별 처리 시간",
    unit="ms",
)
tool_call_counter = meter.create_counter(
    name="agent.tool.call.total",
    description="에이전트 도구 호출 총 횟수",
    unit="1",
)
tool_error_counter = meter.create_counter(
    name="agent.tool.error.total",
    description="에이전트 도구 호출 실패 횟수",
    unit="1",
)
tool_duration = meter.create_histogram(
    name="agent.tool.duration",
    description="각 도구(Tool) 호출에 소요된 시간",
    unit="ms",
)
graph_node_duration = meter.create_histogram(
    name="agent.graph.node.duration",
    description="LangGraph 노드별 처리 시간",
    unit="ms",
)
graph_transitions = meter.create_counter(
    name="agent.graph.state_transitions.total",
    description="LangGraph 상태 전환 횟수",
    unit="1",
)
recursion_depth_histogram = meter.create_histogram(
    name="agent.graph.recursion_depth",
    description="LangGraph 재귀 깊이 (무한 루프 탐지용)",
    unit="1",
)
llm_call_duration = meter.create_histogram(
    name="agent.llm.call.duration",
    description="LangChain 내부 LLM 호출 시간 (vLLM 외 직접 호출 시)",
    unit="ms",
)


class OtelCallbackHandler(BaseCallbackHandler):
    """
    LangChain/LangGraph 콜백 이벤트를 OTel Span으로 변환하는 핸들러.

    각 chain/tool/llm/graph 이벤트에 대응하는 Span을 생성하여
    에이전트 실행의 전 과정을 분산 추적 시스템에서 가시화합니다.
    """

    def __init__(self, service_name: str = "langchain-agent"):
        super().__init__()
        self.service_name = service_name
        # run_id → (span, ctx_token, start_time) 맵핑
        self._span_registry: Dict[str, tuple] = {}
        self._timing_registry: Dict[str, float] = {}
        # LangGraph 상태 추적
        self._graph_depth: Dict[str, int] = {}
        self._prev_node: Dict[str, str] = {}

    # ── Chain 이벤트 ─────────────────────────────────────────────────

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_name = (
            serialized.get("name")
            or serialized.get("id", ["unknown"])[-1]
            or "unknown_chain"
        )
        key = str(run_id)
        span = tracer.start_span(
            f"agent.chain.{chain_name}",
            kind=SpanKind.INTERNAL,
            attributes={
                "agent.chain.name": chain_name,
                "agent.chain.run_id": key,
                "agent.chain.parent_run_id": str(parent_run_id) if parent_run_id else "",
                "agent.input.char_length": len(str(inputs)),
                "agent.input.keys": str(list(inputs.keys())),
            },
        )
        ctx_token = trace.use_span(span, end_on_exit=False).__enter__()
        self._span_registry[key] = (span, ctx_token)
        self._timing_registry[key] = time.perf_counter()

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, None)
        if not entry or not start:
            return
        span, ctx_token = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        chain_name = span.name.replace("agent.chain.", "")
        span.set_attributes({
            "agent.chain.duration_ms": elapsed_ms,
            "agent.output.char_length": len(str(outputs)),
            "agent.output.keys": str(list(outputs.keys())),
        })
        chain_duration.record(elapsed_ms, {"chain": chain_name, "status": "success"})
        span.end()

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, None)
        if not entry or not start:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        chain_name = span.name.replace("agent.chain.", "")
        span.record_exception(error)
        span.set_status(StatusCode.ERROR, str(error))
        span.set_attribute("agent.chain.duration_ms", elapsed_ms)
        chain_duration.record(elapsed_ms, {"chain": chain_name, "status": "error"})
        span.end()

    # ── Tool 이벤트 ──────────────────────────────────────────────────

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        tool_name = serialized.get("name", "unknown_tool")
        key = f"tool_{run_id}"
        span = tracer.start_span(
            f"agent.tool.{tool_name}",
            kind=SpanKind.INTERNAL,
            attributes={
                "agent.tool.name": tool_name,
                "agent.tool.run_id": str(run_id),
                "agent.tool.input": input_str[:500],
                "agent.tool.input_length": len(input_str),
            },
        )
        self._span_registry[key] = (span, None)
        self._timing_registry[key] = time.perf_counter()
        tool_call_counter.add(1, {"tool": tool_name})

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = f"tool_{run_id}"
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, None)
        if not entry or not start:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        tool_name = span.name.replace("agent.tool.", "")
        span.set_attributes({
            "agent.tool.duration_ms": elapsed_ms,
            "agent.tool.success": True,
            "agent.tool.output_length": len(str(output)),
            "agent.tool.output_snippet": str(output)[:200],
        })
        tool_duration.record(elapsed_ms, {"tool": tool_name, "status": "success"})
        span.end()

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = f"tool_{run_id}"
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, time.perf_counter())
        if not entry:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        tool_name = span.name.replace("agent.tool.", "")
        span.record_exception(error)
        span.set_status(StatusCode.ERROR, str(error))
        span.set_attributes({
            "agent.tool.duration_ms": elapsed_ms,
            "agent.tool.success": False,
            "agent.tool.error_type": type(error).__name__,
        })
        tool_duration.record(elapsed_ms, {"tool": tool_name, "status": "error"})
        tool_error_counter.add(1, {"tool": tool_name, "error_type": type(error).__name__})
        span.end()

    # ── Agent Action / Finish ─────────────────────────────────────────

    def on_agent_action(
        self,
        action: "AgentAction",
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """에이전트가 도구를 선택한 순간 — 현재 활성 Span에 이벤트 추가"""
        current_span = trace.get_current_span()
        current_span.add_event(
            "agent.action.selected",
            {
                "agent.action.tool": action.tool,
                "agent.action.input": str(action.tool_input)[:500],
                "agent.action.log": (action.log or "")[:300],
            },
        )

    def on_agent_finish(
        self,
        finish: "AgentFinish",
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """에이전트 실행 완료 — 최종 출력 기록"""
        current_span = trace.get_current_span()
        current_span.add_event(
            "agent.finish",
            {
                "agent.finish.output_keys": str(list(finish.return_values.keys())),
                "agent.finish.log": (finish.log or "")[:300],
            },
        )

    # ── LLM 이벤트 (LangChain 내부 LLM 직접 호출 시) ─────────────────

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        llm_name = serialized.get("name", "unknown_llm")
        key = f"llm_{run_id}"
        span = tracer.start_span(
            f"agent.llm.call.{llm_name}",
            kind=SpanKind.INTERNAL,
            attributes={
                "llm.provider": llm_name,
                "llm.prompt_count": len(prompts),
                "llm.prompt_total_length": sum(len(p) for p in prompts),
            },
        )
        self._span_registry[key] = (span, None)
        self._timing_registry[key] = time.perf_counter()

    def on_llm_end(
        self,
        response: "LLMResult",
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = f"llm_{run_id}"
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, None)
        if not entry or not start:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        llm_name = span.name.split(".")[-1]
        total_tokens = 0
        if response.llm_output:
            usage = response.llm_output.get("token_usage", {})
            total_tokens = usage.get("total_tokens", 0)
            span.set_attributes({
                "llm.prompt_tokens": usage.get("prompt_tokens", 0),
                "llm.completion_tokens": usage.get("completion_tokens", 0),
                "llm.total_tokens": total_tokens,
            })

        span.set_attributes({
            "llm.duration_ms": elapsed_ms,
            "llm.generation_count": len(response.generations),
        })
        llm_call_duration.record(elapsed_ms, {"provider": llm_name})
        span.end()

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        key = f"llm_{run_id}"
        entry = self._span_registry.pop(key, None)
        start  = self._timing_registry.pop(key, time.perf_counter())
        if not entry:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000
        span.record_exception(error)
        span.set_status(StatusCode.ERROR, str(error))
        span.set_attribute("llm.duration_ms", elapsed_ms)
        llm_call_duration.record(elapsed_ms, {"provider": "error"})
        span.end()

    # ── LangGraph 전용 이벤트 ────────────────────────────────────────

    def on_graph_node_start(
        self,
        node_name: str,
        state: Dict[str, Any],
        graph_id: str,
        **kwargs: Any,
    ) -> None:
        """LangGraph 노드 진입 시 호출 (커스텀 이벤트)"""
        run_key = f"graph_{graph_id}_{node_name}"

        # 재귀 깊이 추적
        depth = self._graph_depth.get(graph_id, 0) + 1
        self._graph_depth[graph_id] = depth

        # 상태 전환 기록
        prev = self._prev_node.get(graph_id, "START")
        graph_transitions.add(1, {"from_node": prev, "to_node": node_name, "graph": graph_id})
        self._prev_node[graph_id] = node_name

        span = tracer.start_span(
            f"langgraph.node.{node_name}",
            kind=SpanKind.INTERNAL,
            attributes={
                "graph.node.name": node_name,
                "graph.id": graph_id,
                "graph.recursion_depth": depth,
                "graph.state.key_count": len(state),
                "graph.state.keys": str(list(state.keys()))[:300],
                "graph.prev_node": prev,
            },
        )
        self._span_registry[run_key] = (span, None)
        self._timing_registry[run_key] = time.perf_counter()

        # 재귀 깊이 경보 (Span 이벤트 — Tail Sampling 트리거)
        if depth > 15:
            span.add_event(
                "graph.recursion.warning",
                {
                    "graph.recursion_depth": depth,
                    "graph.node.name": node_name,
                    "message": f"재귀 깊이 {depth}회 초과. 무한 루프 가능성 점검 필요.",
                },
            )

    def on_graph_node_end(
        self,
        node_name: str,
        state: Dict[str, Any],
        graph_id: str,
        **kwargs: Any,
    ) -> None:
        """LangGraph 노드 종료 시 호출"""
        run_key = f"graph_{graph_id}_{node_name}"
        entry = self._span_registry.pop(run_key, None)
        start  = self._timing_registry.pop(run_key, None)
        if not entry or not start:
            return
        span, _ = entry
        elapsed_ms = (time.perf_counter() - start) * 1000

        depth = self._graph_depth.get(graph_id, 0)
        span.set_attributes({
            "graph.node.duration_ms": elapsed_ms,
            "graph.recursion_depth": depth,
        })
        graph_node_duration.record(elapsed_ms, {"node": node_name, "graph": graph_id})
        recursion_depth_histogram.record(depth, {"graph": graph_id})

        # 깊이 감소 (노드 완료)
        self._graph_depth[graph_id] = max(0, depth - 1)
        span.end()

    def on_graph_end(self, graph_id: str, **kwargs: Any) -> None:
        """LangGraph 실행 전체 완료"""
        self._graph_depth.pop(graph_id, None)
        self._prev_node.pop(graph_id, None)
