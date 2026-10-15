"""Grafo LangGraph del asistente: una cascada de etapas con aristas condicionales.

    guard_input ─(inválido)──────────────────────────────► END
         │
         ▼
       agent ─(tool calls, < máx.)─► tools ─► agent        (bucle de herramientas)
         │   ─(tool calls, = máx.)─► limit_reached ─┐
         │   ─(respuesta final)─────────────────────┤
         ▼                                          ▼
                       guard_output ──────────────► END

El `uid` y el repositorio viajan en `config["configurable"]`, nunca en el estado que ve el LLM.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from app.guards import (
    EMPTY_REPLY,
    GENERIC_BLOCKED_REPLY,
    ITERATION_LIMIT_REPLY,
    InputError,
    InputLimits,
    find_leak,
    message_text,
    prepare_history,
)
from app.llm import ChatModels, provider_of
from app.prompts import build_system_prompt
from app.tools import ALL_TOOLS, tools_for

logger = logging.getLogger(__name__)

TOOL_ERROR_MESSAGE = "No se ha podido consultar la información en este momento."


class ChatState(TypedDict, total=False):
    input: list[dict[str, Any]]  # conversación cruda del cliente (solo la lee guard_input)
    messages: Annotated[list[AnyMessage], add_messages]
    tool_iterations: int
    provider: str | None
    rejected: str | None  # código de error si guard_input rechaza la entrada
    limit_reached: bool
    final_text: str
    replaced: bool  # True si guard_output cambió el texto que se había emitido en streaming
    blocked_reason: str | None


def _uid(config: RunnableConfig) -> str | None:
    uid = config.get("configurable", {}).get("uid")
    return uid if isinstance(uid, str) and uid else None


def _handle_tool_error(exc: Exception) -> str:
    logger.error("tool_error", extra={"exc_type": type(exc).__name__})
    return TOOL_ERROR_MESSAGE


def build_graph(models: ChatModels, *, limits: InputLimits | None = None, max_tool_iterations: int = 5):
    limits = limits or InputLimits()

    def guard_input(state: ChatState) -> dict[str, Any]:
        """Valida roles, longitud y vacío; recorta el historial a los últimos N mensajes."""
        try:
            history = prepare_history(state.get("input") or [], limits)
        except InputError as exc:
            return {"rejected": exc.code}
        return {"messages": history, "tool_iterations": 0, "rejected": None, "limit_reached": False}

    async def agent(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
        """Llama al LLM con el system prompt del servidor y las tools permitidas para la sesión."""
        authenticated = _uid(config) is not None
        runnable = models.bind(tools_for(authenticated))
        prompt = [SystemMessage(build_system_prompt(authenticated)), *state["messages"]]
        response = await runnable.ainvoke(prompt, config)
        update: dict[str, Any] = {"messages": [response], "provider": provider_of(response)}
        if getattr(response, "tool_calls", None):
            update["tool_iterations"] = state.get("tool_iterations", 0) + 1
        return update

    def route_after_agent(state: ChatState) -> Literal["tools", "limit_reached", "guard_output"]:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            if state.get("tool_iterations", 0) > max_tool_iterations:
                return "limit_reached"
            return "tools"
        return "guard_output"

    def limit_reached(state: ChatState) -> dict[str, Any]:
        """Corta el bucle de tools con un mensaje controlado."""
        logger.warning("tool_iteration_limit", extra={"iterations": state.get("tool_iterations")})
        return {"limit_reached": True}

    def guard_output(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
        """Revisa la respuesta final: sin fugas del prompt, uid, ids de Stripe ni secretos."""
        if state.get("limit_reached"):
            return {"final_text": ITERATION_LIMIT_REPLY, "replaced": True, "blocked_reason": None}
        last = state["messages"][-1]
        text = message_text(last).strip() if isinstance(last, AIMessage) else ""
        if not text:
            return {"final_text": EMPTY_REPLY, "replaced": True, "blocked_reason": None}
        uid = _uid(config)
        reason = find_leak(text, uid=uid, system_prompt=build_system_prompt(uid is not None))
        if reason:
            logger.warning("output_blocked", extra={"reason": reason})
            return {"final_text": GENERIC_BLOCKED_REPLY, "replaced": True, "blocked_reason": reason}
        return {"final_text": text, "replaced": False, "blocked_reason": None}

    def route_after_input(state: ChatState) -> Literal["agent", "__end__"]:
        return END if state.get("rejected") else "agent"

    graph = StateGraph(ChatState)
    graph.add_node("guard_input", guard_input)
    graph.add_node("agent", agent)
    # Todas las tools están en el nodo; las de pedidos solo se ENLAZAN al modelo con sesión,
    # y además cada una comprueba el uid del config (defensa en profundidad).
    graph.add_node("tools", ToolNode(ALL_TOOLS, handle_tool_errors=_handle_tool_error))
    graph.add_node("limit_reached", limit_reached)
    graph.add_node("guard_output", guard_output)

    graph.add_edge(START, "guard_input")
    graph.add_conditional_edges("guard_input", route_after_input, ["agent", END])
    graph.add_conditional_edges("agent", route_after_agent, ["tools", "limit_reached", "guard_output"])
    graph.add_edge("tools", "agent")
    graph.add_edge("limit_reached", "guard_output")
    graph.add_edge("guard_output", END)
    return graph.compile()


def make_config(uid: str | None, repo: Any) -> RunnableConfig:
    return {"configurable": {"uid": uid, "repo": repo}, "recursion_limit": 40}


async def stream_chat(
    graph: Any,
    messages: list[dict[str, Any]],
    *,
    uid: str | None,
    repo: Any,
    max_tool_iterations: int = 5,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Ejecuta el grafo y produce eventos `(tipo, datos)` para SSE.

    Tipos: token, tool_start, replace, done, error (ver README).
    """
    provider: str | None = None
    tools_used: list[str] = []
    # Cada llamada al modelo produce un mensaje con su propio id. Si el modelo escribe texto, consulta
    # una tool y vuelve a escribir, los dos textos se separan para que no salgan pegados en la UI.
    text_message_id: str | None = None
    async for mode, chunk in graph.astream(
        {"input": messages}, make_config(uid, repo), stream_mode=["messages", "updates"]
    ):
        if mode == "messages":
            msg, meta = chunk
            if meta.get("langgraph_node") == "agent" and isinstance(msg, AIMessage):
                text = message_text(msg)
                if text:
                    if text_message_id is not None and msg.id != text_message_id:
                        text = "\n\n" + text.lstrip()
                    text_message_id = msg.id
                    yield "token", {"text": text}
            continue

        for node, update in (chunk or {}).items():
            if not update:
                continue
            if node == "guard_input" and update.get("rejected"):
                yield "error", {"code": "invalid_input", "message": "La petición no es válida."}
                return
            if node == "agent":
                provider = update.get("provider") or provider
                if update.get("tool_iterations", 0) > max_tool_iterations:
                    continue  # no se ejecutarán: limit_reached corta el bucle
                for message in update.get("messages", []):
                    for call in getattr(message, "tool_calls", None) or []:
                        tools_used.append(call["name"])
                        yield "tool_start", {"name": call["name"]}
            if node == "guard_output" and update.get("replaced"):
                yield "replace", {"text": update["final_text"]}

    logger.info(
        "chat_completed",
        extra={"provider": provider, "tools": tools_used, "authenticated": uid is not None},
    )
    yield "done", {"provider": provider}
