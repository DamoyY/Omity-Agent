import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { HookRule } from "../types";
import type { HookLedger } from "./ledger";
import * as callStorage from "./storage/calls";

export class HookInvocationIdentity {
  constructor(
    private readonly ledger: HookLedger,
    private readonly sessionId: string,
  ) {}

  hook(rule: HookRule, sourceId: string, threadId: string) {
    return this.ledger.invocationKey(
      this.sessionId,
      threadId,
      callStorage.hookCallDetails(rule, sourceId),
    );
  }

  agentTool(toolName: string, callId: string, threadId: string) {
    return this.ledger.invocationKey(this.sessionId, threadId, {
      trigger: "agent_tool",
      sourceId: callId,
      hookId: toolName,
    });
  }

  last(messages: BaseMessage[], threadId: string) {
    const output = messages.findLast((message) =>
      ToolMessage.isInstance(message),
    );
    if (!(output instanceof ToolMessage)) return undefined;
    const callId = output.tool_call_id;
    if (callStorage.isHookCallId(callId)) {
      const details = this.ledger.requireCall(callId, this.sessionId, threadId);
      return this.ledger.invocationKey(this.sessionId, threadId, details);
    }
    const call = messages
      .filter((message) => message instanceof AIMessage)
      .flatMap((message) => message.tool_calls ?? [])
      .find((candidate) => candidate.id === callId);
    return call ? this.agentTool(call.name, callId, threadId) : undefined;
  }
}
