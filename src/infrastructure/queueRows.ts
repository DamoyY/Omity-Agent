import type { QueueItem, QueueStatus } from "../types";

export interface QueueRow {
  id: number;
  run_id: number | null;
  content: string;
  status: QueueStatus;
  user_message_id: number | null;
  root_queue_id: number | null;
}

export function toQueueItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    runId: row.run_id,
    content: row.content,
    status: row.status,
    userMessageId: row.user_message_id,
    root: row.root_queue_id === row.id,
  };
}
