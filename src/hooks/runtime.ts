import type { ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "../infrastructure/logging/logger";
import type { HookRule, HookWhen } from "../types";
import { executeRecorded, restoreInvocation } from "./execution";
import { HookLedger } from "./ledger";
import * as callStorage from "./storage/calls";
import { resolveHookArgs } from "./variables";

interface RunOptions {
  previousInvocationKey?: string;
  invoke: (
    call: ReturnType<HookRuntime["resolvedCall"]>,
  ) => Promise<ToolMessage>;
}

export class HookRuntime {
  private readonly toolNames: Set<string>;

  constructor(
    readonly rules: HookRule[],
    tools: StructuredToolInterface[],
    private readonly ledger: HookLedger,
    private readonly logger: Logger,
    readonly sessionId: string,
    readonly workspace: string,
  ) {
    this.toolNames = new Set(tools.map((tool) => tool.name));
    if (this.toolNames.size !== tools.length)
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

  agentToolKey(toolName: string, callId: string, threadId: string) {
    return this.ledger.invocationKey(this.sessionId, threadId, {
      trigger: "agent_tool",
      sourceId: callId,
      hookId: toolName,
    });
  }

  async run(
    rule: HookRule,
    sourceId: string,
    threadId: string,
    options: RunOptions,
  ) {
    const details = callStorage.hookCallDetails(rule, sourceId);
    const claim = this.ledger.claim(
      this.sessionId,
      threadId,
      details,
      rule.runLimit,
    );
    if (claim.kind === "skip") return null;
    let call: ReturnType<HookRuntime["resolvedCall"]>;
    try {
      call = this.resolvedCall(
        rule,
        sourceId,
        threadId,
        options.previousInvocationKey,
      );
    } catch (error) {
      if (claim.kind === "execute") this.ledger.fail(claim.key, error);
      throw error;
    }
    const output =
      claim.kind === "restore"
        ? restoreInvocation(this.ledger, claim.row, claim.key)
        : await this.execute(
            rule,
            details.trigger,
            sourceId,
            claim.key,
            call,
            options,
          );
    return { call, output, invocationKey: claim.key };
  }

  resolvedCall(
    rule: HookRule,
    sourceId: string,
    threadId: string,
    previousInvocationKey?: string,
  ) {
    const details = callStorage.hookCallDetails(rule, sourceId);
    return {
      name: rule.tool,
      args: resolveHookArgs(rule.args, {
        cwd: this.workspace,
        previousTool: previousInvocationKey
          ? this.ledger.output(previousInvocationKey)
          : undefined,
      }),
      id: callStorage.createHookCallId(this.sessionId, threadId, details),
      type: "tool_call" as const,
    };
  }

  async runAgentTool(
    toolName: string,
    callId: string,
    threadId: string,
    invoke: () => Promise<ToolMessage>,
  ) {
    const claim = this.ledger.claim(
      this.sessionId,
      threadId,
      { trigger: "agent_tool", sourceId: callId, hookId: toolName },
      -1,
    );
    if (claim.kind === "skip") {
      throw new Error(`Agent 工具调用无法取得执行权：${callId}`);
    }
    return claim.kind === "restore"
      ? restoreInvocation(this.ledger, claim.row, claim.key)
      : executeRecorded(this.ledger, claim.key, invoke);
  }

  private execute(
    rule: HookRule,
    trigger: string,
    sourceId: string,
    key: string,
    call: ReturnType<HookRuntime["resolvedCall"]>,
    options: RunOptions,
  ) {
    this.logger.debug("执行 Hook 节点", {
      hookId: rule.id,
      mode: rule.mode,
      trigger,
      sourceId,
    });
    return executeRecorded(this.ledger, key, () => options.invoke(call));
  }

  private requireTool(name: string, description: string) {
    if (!this.toolNames.has(name)) {
      throw new Error(`${description} 引用了不存在的 MCP 工具：${name}`);
    }
  }
}
