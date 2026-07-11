import { ToolMessage, type ToolCall } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "../infrastructure/logger";
import type { HookRule, HookWhen } from "../types";
import { HookLedger, type InvocationRow } from "./ledger";
import * as callStorage from "./storage/calls";
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
      if (!Number.isInteger(rule.runLimit) || rule.runLimit < -1)
        throw new Error(`Hook ${rule.id} 的 runLimit 必须是大于等于 -1 的整数`);
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

  shouldRun(rule: HookRule, sourceId: string, threadId: string) {
    return this.ledger.canRun(
      this.sessionId,
      threadId,
      callStorage.hookCallDetails(rule, sourceId),
      rule.runLimit,
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
      if (!this.shouldRun(rule, sourceId, threadId)) continue;
      if (rule.mode !== "silent")
        throw new Error(
          `${callStorage.hookTrigger(target, when)} 不能在图外执行接管 Hook`,
        );
      await this.runSilent(rule, sourceId, threadId, signal);
    }
  }

  async resolvedCall(
    rule: HookRule,
    sourceId: string,
    threadId: string,
  ): Promise<ToolCall> {
    const details = callStorage.hookCallDetails(rule, sourceId);
    const callId = callStorage.createHookCallId(
      this.sessionId,
      threadId,
      details,
    );
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
    const trigger = callStorage.hookTrigger(rule.target, rule.when);
    const { key, existing } = this.ledger.claim(
      this.sessionId,
      threadId,
      { trigger, sourceId, hookId: rule.id },
      rule.runLimit,
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
    const rule = this.rules.find(({ id }) => id === details.hookId);
    if (!rule) throw new Error(`Hook 配置不存在：${details.hookId}`);
    return this.runRecorded(details, threadId, invoke, rule.runLimit);
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
    runLimit = -1,
  ) {
    const { key, existing } = this.ledger.claim(
      this.sessionId,
      threadId,
      details,
      runLimit,
    );
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

  private restore(existing: InvocationRow | null, key: string) {
    if (!existing) throw new Error(`工具调用记录缺失：${key}`);
    this.ledger.requireRunnable(existing, key);
    const output = this.ledger.restoredOutput(existing);
    if (!output) throw new Error(`工具调用结果缺失：${key}`);
    return output;
  }

  private requireTool(name: string, description: string) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`${description} 引用了不存在的 MCP 工具：${name}`);
    }
    return tool;
  }
}
