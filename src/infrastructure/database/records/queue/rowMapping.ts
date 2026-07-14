import type { QueueItem, QueueStatus } from "../../../../types";

export interface QueueRow {
  id: number;
  root_id: number | null;
  content: string;
  status: QueueStatus;
  user_message_id: number | null;
}
export function toQueueItem(row: QueueRow): QueueItem {
  return {
    content: row.content,
    id: row.id,
    root: row.root_id === row.id,
    runId: row.root_id,
    status: row.status,
    userMessageId: row.user_message_id,
  };
}
