import * as callStorage from "./storage/calls";
import type { HookRule, HookWhen } from "../types";
import { type HookToolOutput, readToolOutput } from "./storage/outputs";
import type { Database } from "bun:sqlite";
import type { Logger } from "../infrastructure/logging/logger";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolMessage } from "@langchain/core/messages";
import { consumeHookUsage } from "./storage/usage";
import { resolveHookArgs } from "./variables";
interface RunOptions {
  previousOutput?: HookToolOutput;
  consume: (hookId: string, limit: number) => Promise<boolean>;
  invoke: (call: ReturnType<HookRuntime["resolvedCall"]>) => Promise<ToolMessage>;
}
export class HookRuntime {
  private readonly toolNames: Set<string>;
  constructor(
    readonly rules: HookRule[],
    tools: StructuredToolInterface[],
    private readonly db: Database,
    private readonly logger: Logger,
    readonly sessionId: string,
    readonly workspace: string,
  ) {
    this.toolNames = new Set(tools.map((tool) => tool.name));
    if (this.toolNames.size !== tools.length) {
      throw new Error("MCP 工具名称重复，无法编译 Hook");
    }
    for (const rule of rules) {
      if (!Number.isInteger(rule.runLimit) || rule.runLimit < -1) {
        throw new Error(`Hook ${rule.id} 的 runLimit 必须是大于等于 -1 的整数`);
      }
      this.requireTool(rule.tool, `Hook ${rule.id}`);
      if (rule.target !== "agent") {
        this.requireTool(rule.target, `Hook ${rule.id} 目标`);
      }
    }
  }
  matching(target: string, when: HookWhen) {
    return this.rules.filter((rule) => rule.target === target && rule.when === when);
  }
  consume(hookId: string, limit: number) {
    return consumeHookUsage(this.db, this.sessionId, hookId, limit);
  }
  async run(rule: HookRule, sourceId: string, threadId: string, options: RunOptions) {
    if (!(await options.consume(rule.id, rule.runLimit))) {
      return null;
    }
    const details = callStorage.hookCallDetails(rule, sourceId);
    const call = this.resolvedCall(rule, sourceId, threadId, options.previousOutput);
    this.logger.debug("执行 Hook 节点", {
      hookId: rule.id,
      mode: rule.mode,
      sourceId,
      trigger: details.trigger,
    });
    const output = await options.invoke(call);
    return { call, output, value: readToolOutput(output) };
  }
  resolvedCall(
    rule: HookRule,
    sourceId: string,
    threadId: string,
    previousOutput?: HookToolOutput,
  ) {
    const details = callStorage.hookCallDetails(rule, sourceId);
    return {
      args: resolveHookArgs(rule.args, {
        cwd: this.workspace,
        previousTool: previousOutput,
      }),
      id: callStorage.createHookCallId(this.sessionId, threadId, details),
      name: rule.tool,
      type: "tool_call" as const,
    };
  }
  private requireTool(name: string, description: string) {
    if (!this.toolNames.has(name)) {
      throw new Error(`${description} 引用了不存在的 MCP 工具：${name}`);
    }
  }
}
