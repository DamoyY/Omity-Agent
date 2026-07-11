import { ToolMessage, type ToolCall } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "../infrastructure/logger";
import type { HookRule, HookWhen } from "../types";
import { HookLedger } from "./ledger";
import { createHookCallId, hookTrigger } from "./storage/calls";
import { resolveHookArgs } from "./variables";

export class HookRuntime {
  readonly rules: HookRule[];
  private readonly tools: Map<string, StructuredToolInterface>;

  constructor(
    rules: HookRule[],
    tools: StructuredToolInterface[],
    private readonly ledger: HookLedger,
    private readonly logger: Logger,
    readonly sessionId: string,
    readonly workspace: string,
  ) {
    this.rules = rules;
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.tools.size !== tools.length)
      throw new Error("MCP 工具名称重复，无法编译 Hook");
    for (const rule of rules) {
      this.requireTool(rule.tool, `Hook ${rule.id}`);
      if (rule.target !== "agent")
        this.requireTool(rule.target, `Hook ${rule.id} 目标`);
    }
  }

  matching(target: string, when: HookWhen) {
    return this.rules.filter(
      (rule) => rule.target === target && rule.when === when,
    );
  }

  async runSilentChain(
    target: string,
    when: HookWhen,
    sourceId: string,
    threadId: string,
    signal?: AbortSignal,
  ) {
    for (const rule of this.matching(target, when)) {
      if (rule.mode !== "silent")
        throw new Error(`${hookTrigger(target, when)} 不能在图外执行接管 Hook`);
      await this.runSilent(rule, sourceId, threadId, signal);
    }
  }

  async resolvedCall(
    rule: HookRule,
    sourceId: string,
    threadId: string,
  ): Promise<ToolCall> {
    const details = {
      trigger: hookTrigger(rule.target, rule.when),
      sourceId,
      hookId: rule.id,
    };
    const callId = createHookCallId(this.sessionId, threadId, details);
    if (rule.mode === "takeover")
      this.ledger.registerCall(callId, this.sessionId, threadId, details);
    return {
      name: rule.tool,
      args: resolveHookArgs(rule.args, {
        cwd: this.workspace,
        previousTool: this.ledger.latestOutput(threadId),
      }),
      id: callId,
      type: "tool_call",
    };
  }

  async runSilent(
    rule: HookRule,
    sourceId: string,
    threadId: string,
    signal?: AbortSignal,
  ) {
    const trigger = hookTrigger(rule.target, rule.when);
    const { key, existing } = this.claim(
      { trigger, sourceId, hookId: rule.id },
      threadId,
    );
    if (existing) return this.restore(existing, key);
    this.logger.debug("执行静默 Hook", {
      hookId: rule.id,
      trigger,
      sourceId,
    });
    try {
      const call = await this.resolvedCall(rule, sourceId, threadId);
      const output = await this.requireTool(
        rule.tool,
        `Hook ${rule.id}`,
      ).invoke(call, {
        callbacks: [],
        tags: ["omity-hook"],
        metadata: { hook: true, hookId: rule.id },
        signal,
      });
      if (!ToolMessage.isInstance(output))
        throw new Error("静默 Hook 工具没有返回 ToolMessage");
      this.ledger.complete(key, output);
      return output;
    } catch (error) {
      this.ledger.fail(key, error);
      throw error;
    }
  }

  async runTakeover(
    callId: string,
    threadId: string,
    invoke: () => Promise<unknown>,
  ) {
    const details = this.ledger.requireCall(callId, this.sessionId, threadId);
    return this.runRecorded(details, threadId, invoke);
  }

  async runAgentTool(
    toolName: string,
    callId: string,
    threadId: string,
    invoke: () => Promise<unknown>,
  ) {
    return this.runRecorded(
      { trigger: "agent_tool", sourceId: callId, hookId: toolName },
      threadId,
      invoke,
    );
  }

  private async runRecorded(
    details: { trigger: string; sourceId: string; hookId: string },
    threadId: string,
    invoke: () => Promise<unknown>,
  ) {
    const { key, existing } = this.claim(details, threadId);
    if (existing) return this.restore(existing, key);
    try {
      const output = await invoke();
      if (!ToolMessage.isInstance(output))
        throw new Error("工具没有返回 ToolMessage");
      this.ledger.complete(key, output);
      return output;
    } catch (error) {
      this.ledger.fail(key, error);
      throw error;
    }
  }

  private claim(
    details: { trigger: string; sourceId: string; hookId: string },
    threadId: string,
  ) {
    const key = this.invocationKey(details, threadId);
    return {
      key,
      existing: this.ledger.claim({
        key,
        sessionId: this.sessionId,
        threadId,
        ...details,
      }),
    };
  }

  private restore(existing: ReturnType<HookLedger["claim"]>, key: string) {
    if (!existing) throw new Error(`工具调用记录缺失：${key}`);
    this.ledger.requireRunnable(existing, key);
    const output = this.ledger.restoredOutput(existing);
    if (!output) throw new Error(`工具调用结果缺失：${key}`);
    return output;
  }

  private invocationKey(
    details: { trigger: string; sourceId: string; hookId: string },
    threadId: string,
  ) {
    return [
      this.sessionId,
      threadId,
      details.trigger,
      details.sourceId,
      details.hookId,
    ].join("\u001f");
  }

  private requireTool(name: string, description: string) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`${description} 引用了不存在的 MCP 工具：${name}`);
    }
    return tool;
  }
}
