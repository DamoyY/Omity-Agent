import { ToolMessage, type ToolCall } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "../infrastructure/logger";
import type { HookRule } from "../types";
import { decodeHookCallId, encodeHookCallId } from "./callId";
import { HookLedger } from "./ledger";
import { resolveHookArgs } from "./variables";

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
    readonly workspace: string,
  ) {
    this.rules = rules;
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.tools.size !== tools.length) {
      throw new Error("MCP 工具名称重复，无法编译 Hook");
    }
    for (const rule of rules) {
      this.requireTool(rule.tool, `Hook ${rule.id}`);
      if (rule.matchTool) {
        this.requireTool(rule.matchTool, `Hook ${rule.id} 匹配`);
      }
    }
  }

  matching(trigger: HookTrigger, matchTool?: string) {
    return this.rules.filter(
      (rule) =>
        rule.on === trigger &&
        (matchTool === undefined || rule.matchTool === matchTool),
    );
  }

  async runSilentChain(
    trigger: HookTrigger,
    sourceId: string,
    threadId: string,
    options: { matchTool?: string; signal?: AbortSignal } = {},
  ) {
    for (const rule of this.matching(trigger, options.matchTool)) {
      if (rule.mode !== "silent") {
        throw new Error(`${trigger} 触发器不能在图外执行接管 Hook`);
      }
      await this.runSilent(rule, trigger, sourceId, threadId, options.signal);
    }
  }

  async resolvedCall(
    rule: HookRule,
    trigger: HookTrigger,
    sourceId: string,
    threadId: string,
  ): Promise<ToolCall> {
    return {
      name: rule.tool,
      args: resolveHookArgs(rule.args, {
        cwd: this.workspace,
        previousTool: this.ledger.latestOutput(threadId),
      }),
      id: encodeHookCallId({ trigger, sourceId, hookId: rule.id }),
      type: "tool_call",
    };
  }

  async runSilent(
    rule: HookRule,
    trigger: HookTrigger,
    sourceId: string,
    threadId: string,
    signal?: AbortSignal,
  ) {
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
      const call = await this.resolvedCall(rule, trigger, sourceId, threadId);
      const output = await this.requireTool(
        rule.tool,
        `Hook ${rule.id}`,
      ).invoke(call, {
        callbacks: [],
        tags: ["omity-hook"],
        metadata: { hook: true, hookId: rule.id },
        signal,
      });
      if (!ToolMessage.isInstance(output)) {
        throw new Error("静默 Hook 工具没有返回 ToolMessage");
      }
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
    const details = decodeHookCallId(callId);
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
      if (!ToolMessage.isInstance(output)) {
        throw new Error("工具没有返回 ToolMessage");
      }
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
