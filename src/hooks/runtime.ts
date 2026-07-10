import { ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "../infrastructure/logger";
import type { HookRule } from "../types";
import { decodeHookCallId, encodeHookCallId } from "./callId";
import { HookLedger } from "./ledger";

export type HookTrigger = HookRule["on"];

export class HookRuntime {
  readonly rules: HookRule[];
  private readonly tools: Map<string, StructuredToolInterface>;

  constructor(
    rules: HookRule[],
    tools: StructuredToolInterface[],
    private readonly ledger: HookLedger,
    private readonly logger: Logger,
    readonly sessionId: string,
  ) {
    this.rules = rules;
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.tools.size !== tools.length) {
      throw new Error("MCP 工具名称重复，无法编译 Hook");
    }
    for (const rule of rules) {
      this.requireTool(rule.tool, `Hook ${rule.id}`);
      if (rule.matchTool)
        this.requireTool(rule.matchTool, `Hook ${rule.id} 匹配`);
    }
  }

  matching(trigger: HookTrigger, matchTool?: string, mode?: HookRule["mode"]) {
    return this.rules.filter(
      (rule) =>
        rule.on === trigger &&
        (matchTool === undefined || rule.matchTool === matchTool) &&
        (mode === undefined || rule.mode === mode),
    );
  }

  async runSilent(
    trigger: HookTrigger,
    sourceId: string,
    threadId: string,
    options: { matchTool?: string; signal?: AbortSignal } = {},
  ) {
    for (const rule of this.matching(trigger, options.matchTool, "silent")) {
      await this.invokeSilent(rule, sourceId, threadId, options.signal);
    }
  }

  createCall(rule: HookRule, trigger: HookTrigger, sourceId: string) {
    const details = { trigger, sourceId, hookId: rule.id };
    return {
      name: rule.tool,
      args: rule.args,
      id: encodeHookCallId(details),
      type: "tool_call" as const,
    };
  }

  async runTakeover(
    callId: string,
    threadId: string,
    invoke: () => Promise<unknown>,
  ) {
    const details = decodeHookCallId(callId);
    const key = this.invocationKey(details, threadId);
    const existing = this.ledger.claim({
      key,
      sessionId: this.sessionId,
      threadId,
      hookId: details.hookId,
      trigger: details.trigger,
      sourceId: details.sourceId,
    });
    if (existing) {
      this.ledger.requireRunnable(existing, key);
      const output = this.ledger.restoredOutput(existing);
      if (!output) throw new Error(`Hook 接管结果缺失：${key}`);
      return output;
    }
    try {
      const output = await invoke();
      if (!ToolMessage.isInstance(output)) {
        throw new Error("Hook 接管工具没有返回 ToolMessage");
      }
      this.ledger.complete(key, output);
      return output;
    } catch (error) {
      this.ledger.fail(key, error);
      throw error;
    }
  }

  async runAgentTool(
    toolName: string,
    callId: string,
    threadId: string,
    invoke: () => Promise<unknown>,
  ) {
    const details = {
      trigger: "agent_tool",
      sourceId: callId,
      hookId: toolName,
    };
    const key = this.invocationKey(details, threadId);
    const existing = this.ledger.claim({
      key,
      sessionId: this.sessionId,
      threadId,
      hookId: toolName,
      trigger: details.trigger,
      sourceId: callId,
    });
    if (existing) {
      this.ledger.requireRunnable(existing, key);
      const output = this.ledger.restoredOutput(existing);
      if (!output) throw new Error(`工具调用结果缺失：${key}`);
      return output;
    }
    try {
      const output = await invoke();
      if (!ToolMessage.isInstance(output)) {
        throw new Error("MCP 工具没有返回 ToolMessage");
      }
      this.ledger.complete(key, output);
      return output;
    } catch (error) {
      this.ledger.fail(key, error);
      throw error;
    }
  }

  private async invokeSilent(
    rule: HookRule,
    sourceId: string,
    threadId: string,
    signal?: AbortSignal,
  ) {
    const details = { trigger: rule.on, sourceId, hookId: rule.id };
    const key = this.invocationKey(details, threadId);
    const existing = this.ledger.claim({
      key,
      sessionId: this.sessionId,
      threadId,
      hookId: rule.id,
      trigger: rule.on,
      sourceId,
    });
    if (existing) {
      this.ledger.requireRunnable(existing, key);
      return;
    }
    this.logger.debug("执行静默 Hook", {
      hookId: rule.id,
      trigger: rule.on,
      sourceId,
    });
    try {
      await this.requireTool(rule.tool, `Hook ${rule.id}`).invoke(rule.args, {
        callbacks: [],
        tags: ["omity-hook"],
        metadata: { hook: true, hookId: rule.id },
        signal,
      });
      this.ledger.complete(key);
    } catch (error) {
      this.ledger.fail(key, error);
      throw error;
    }
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
    if (!tool)
      throw new Error(`${description} 引用了不存在的 MCP 工具：${name}`);
    return tool;
  }
}
