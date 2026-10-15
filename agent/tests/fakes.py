"""Modelo de chat falso y guionizado: emite texto y/o tool calls sin red."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator, Sequence
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field


def tool_call(name: str, args: dict[str, Any] | None = None, call_id: str = "call_1") -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args or {}, "id": call_id}])


Script = Sequence[AIMessage] | Callable[[list[BaseMessage]], AIMessage]


class ScriptedChatModel(BaseChatModel):
    """Devuelve las respuestas del guion en orden (la última se repite). Registra lo que recibe."""

    script: Any = None
    provider: str = "anthropic"
    error: Any = None  # excepción a lanzar en cada llamada
    calls: list[list[BaseMessage]] = Field(default_factory=list)
    bound_tools: list[list[str]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted-fake"

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "ScriptedChatModel":
        self.bound_tools.append([getattr(t, "name", str(t)) for t in tools])
        return self

    def _next(self, messages: list[BaseMessage]) -> AIMessage:
        if self.error is not None:
            raise self.error
        self.calls.append(list(messages))
        if callable(self.script):
            msg = self.script(messages)
        else:
            msg = self.script[min(len(self.calls) - 1, len(self.script) - 1)]
        return AIMessage(
            content=msg.content,
            tool_calls=msg.tool_calls,
            response_metadata={"model_provider": self.provider},
        )

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next(messages))])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        msg = self._next(messages)
        text = msg.content if isinstance(msg.content, str) else ""
        words = text.split(" ") if text else []
        for i, word in enumerate(words):
            piece = word if i == len(words) - 1 else word + " "
            chunk = ChatGenerationChunk(message=AIMessageChunk(content=piece))
            if run_manager:
                run_manager.on_llm_new_token(piece, chunk=chunk)
            yield chunk
        last = AIMessageChunk(
            content="",
            tool_call_chunks=[
                {"name": tc["name"], "args": json.dumps(tc["args"]), "id": tc["id"], "index": i}
                for i, tc in enumerate(msg.tool_calls)
            ],
            response_metadata={"model_provider": self.provider},
        )
        if run_manager:
            run_manager.on_llm_new_token("", chunk=ChatGenerationChunk(message=last))
        yield ChatGenerationChunk(message=last)
