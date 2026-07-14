import { Database } from "bun:sqlite";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  buildListQuery,
  selectCheckpoint,
  setupSql,
  optionalConfigString,
  requiredConfigString,
  type CheckpointRow,
  type SqlBinding,
} from "./sql";
import { rowToTuple } from "./tuple";
import { putCheckpoint, putPendingWrites } from "./write";
import { deleteThreadData } from "./lifecycle";
export class BunSqliteSaver extends BaseCheckpointSaver {
  private isSetup = false;
  constructor(
    readonly db: Database,
    private readonly sessionId?: string,
    serde?: SerializerProtocol,
  ) {
    super(serde);
  }
  protected setup() {
    if (this.isSetup) return;
    for (const sql of setupSql) {
      this.db.run(sql);
    }
    this.isSetup = true;
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    this.setup();
    const thread_id = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
    const checkpoint_ns =
      optionalConfigString(config.configurable?.["checkpoint_ns"], "checkpoint_ns") ?? "";
    const checkpoint_id = optionalConfigString(
      config.configurable?.["checkpoint_id"],
      "checkpoint_id",
    );
    const sql = selectCheckpoint(Boolean(checkpoint_id));
    const query = this.db.query<CheckpointRow, SqlBinding[]>(sql);
    const row = checkpoint_id
      ? query.get(thread_id, checkpoint_ns, checkpoint_id)
      : query.get(thread_id, checkpoint_ns);
    if (!row) return undefined;
    const finalConfig = checkpoint_id
      ? config
      : {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        };
    return this.decodeRow(row, finalConfig);
  }
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    this.setup();
    const { sql, args } = buildListQuery(config, options);
    for (const row of this.db.query<CheckpointRow, SqlBinding[]>(sql).all(...args)) {
      yield await this.decodeRow(row, {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      });
    }
  }
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    this.setup();
    return putCheckpoint(
      this.db,
      this.serde,
      config,
      checkpoint,
      metadata,
      this.resolveSessionId(config),
    );
  }
  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    this.setup();
    await putPendingWrites(this.db, this.serde, config, writes, taskId);
  }
  deleteThread(threadId: string): Promise<void> {
    this.setup();
    deleteThreadData(this.db, threadId);
    return Promise.resolve();
  }
  private decodeRow(row: CheckpointRow, config: RunnableConfig): Promise<CheckpointTuple> {
    return rowToTuple(row, config, {
      db: this.db,
      serde: this.serde,
    });
  }
  private resolveSessionId(config: RunnableConfig) {
    if (this.sessionId) return this.sessionId;
    const threadId = requiredConfigString(config.configurable?.["thread_id"], "thread_id");
    return threadId.split(":", 1)[0] ?? threadId;
  }
}
