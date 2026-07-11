import { ToolMessage } from "@langchain/core/messages";
import { HookLedger, type InvocationRow } from "./ledger";

export async function executeRecorded(
  ledger: HookLedger,
  key: string,
  invoke: () => Promise<unknown>,
) {
  try {
    const output = await ledger.withLease(key, invoke);
    if (!ToolMessage.isInstance(output)) {
      throw new Error("工具没有返回 ToolMessage");
    }
    ledger.complete(key, output);
    return output;
  } catch (error) {
    ledger.fail(key, error);
    throw error;
  }
}

export function restoreInvocation(
  ledger: HookLedger,
  existing: InvocationRow | null,
  key: string,
) {
  if (!existing) throw new Error(`工具调用记录缺失：${key}`);
  ledger.requireRunnable(existing, key);
  const output = ledger.restoredOutput(existing);
  if (!output) throw new Error(`工具调用结果缺失：${key}`);
  return output;
}
