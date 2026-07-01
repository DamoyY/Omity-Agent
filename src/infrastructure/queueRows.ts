import type { QueueItem, QueueStatus } from "../types";

export type QueueRow = {
  id: number;
  content: string;
  status: QueueStatus;
  user_message_id: number | null;
};

export function toQueueItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    userMessageId: row.user_message_id,
  };
}
