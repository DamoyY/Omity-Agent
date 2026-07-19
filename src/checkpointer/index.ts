import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type DeltaChannelHistory,
  type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import {
  type CheckpointRow,
  buildListQuery,
  optionalConfigString,
  requiredConfigString,
  selectCheckpoint,
} from "./sql";
import { commitCheckpoint, prepareCheckpoint } from "./write";
import { commitPendingWrites, preparePendingWrites } from "./pendingWrite";
import { queryAll, queryGet } from "../infrastructure/database/connection";
import type { Database } from "bun:sqlite";
import type { RunnableConfig } from "@langchain/core/runnables";
import { deleteThreadData } from "./lifecycle";
import { rowToTuple } from "./tuple";

export class BunSqliteSaver extends BaseCheckpointSaver {
  private readonly commitTails = new Map<string, Promise<void>>();
  constructor(
    readonly db: Database,
    private readonly sessionId?: string,
    serde?: SerializerProtocol,
  ) {
    super(serde);
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const key = operationKey(config);
    await this.commitTails.get(key);
    const threadId = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
    const checkpointNs =
      optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
    const requestedId = optionalConfigString(
      config.configurable?.["checkpoint_id"],
      "checkpoint_id",
    );
    const row = queryGet<CheckpointRow>(this.db, selectCheckpoint(), threadId, checkpointNs);
    if (!row) {
      return undefined;
    }
    if (requestedId !== undefined && requestedId !== row.checkpoint_id) {
      throw new Error(`历史 checkpoint 不可用：${requestedId}`);
    }
    const finalConfig = {
      configurable: {
        checkpoint_id: row.checkpoint_id,
        checkpoint_ns: row.checkpoint_ns,
        thread_id: row.thread_id,
      },
    };
    return this.decodeRow(row, finalConfig);
  }
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    if (options?.before) {
      throw new Error("当前恢复存储不支持 checkpoint 历史游标");
    }
    await Promise.all(this.commitTails.values());
    const { sql, args } = buildListQuery(config, options);
    for (const row of queryAll<CheckpointRow>(this.db, sql, ...args)) {
      yield await this.decodeRow(row, {
        configurable: {
          checkpoint_id: row.checkpoint_id,
          checkpoint_ns: row.checkpoint_ns,
          thread_id: row.thread_id,
        },
      });
    }
  }
  put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions?: ChannelVersions,
  ): Promise<RunnableConfig> {
    const key = operationKey(config);
    const prepared = prepareCheckpoint(
      this.serde,
      config,
      checkpoint,
      metadata,
      this.resolveSessionId(config),
      newVersions,
    );
    return this.enqueue(key, prepared, (item) => commitCheckpoint(this.db, item));
  }
  putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const key = operationKey(config);
    const prepared = preparePendingWrites(
      this.serde,
      config,
      writes,
      taskId,
      this.resolveSessionId(config),
    );
    return this.enqueue(key, prepared, (item) => commitPendingWrites(this.db, item));
  }
  async deleteThread(threadId: string): Promise<void> {
    const pending = [...this.commitTails.entries()]
      .filter(([key]) => key.startsWith(`${threadId}\0`))
      .map(([, tail]) => tail);
    await Promise.all(pending);
    deleteThreadData(this.db, threadId);
  }
  override async getDeltaChannelHistory(options: {
    config: RunnableConfig;
    channels: string[];
  }): Promise<Record<string, DeltaChannelHistory>> {
    if (options.channels.length > 0) {
      throw new Error("当前恢复存储不支持 DeltaChannel 历史");
    }
    return {};
  }
  private decodeRow(row: CheckpointRow, config: RunnableConfig): Promise<CheckpointTuple> {
    return rowToTuple(row, config, {
      db: this.db,
      serde: this.serde,
      sessionId: this.resolveSessionId(config),
    });
  }
  private enqueue<Prepared, Result>(
    key: string,
    prepared: Promise<Prepared>,
    commit: (value: Prepared) => Result,
  ): Promise<Result> {
    const previous = this.commitTails.get(key) ?? Promise.resolve();
    const result = commitAfter(previous, prepared, commit);
    const tail = waitForResult(result);
    this.commitTails.set(key, tail);
    void this.removeSettledTail(key, tail);
    return result;
  }
  private async removeSettledTail(key: string, tail: Promise<void>) {
    try {
      await tail;
    } catch {
      return;
    } finally {
      if (this.commitTails.get(key) === tail) {
        this.commitTails.delete(key);
      }
    }
  }
  private resolveSessionId(config: RunnableConfig) {
    if (this.sessionId) {
      return this.sessionId;
    }
    const threadId = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
    return threadId.split(":", 1)[0] ?? threadId;
  }
}
async function commitAfter<Prepared, Result>(
  previous: Promise<void>,
  prepared: Promise<Prepared>,
  commit: (value: Prepared) => Result,
) {
  const value = await prepared;
  await previous;
  return commit(value);
}
async function waitForResult(value: Promise<unknown>) {
  await value;
}
function operationKey(config: RunnableConfig) {
  const threadId = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
  const checkpointNs =
    optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
  return `${threadId}\0${checkpointNs}`;
}
