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
    id: row.id,
    runId: row.root_id,
    content: row.content,
    status: row.status,
    userMessageId: row.user_message_id,
    root: row.root_id === row.id,
  };
}
