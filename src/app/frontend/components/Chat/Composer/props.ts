import type { AttachmentSettings, PendingAttachment } from "../../../../attachments/contract";
import type { TokenUsage } from "../../../../timeline";
import type { ComposerDraftTarget } from "../../../services/composerDrafts";
type ControlState = "pause" | "pausing" | "resume";
export interface ComposerProps {
  disabled: boolean;
  attachmentSettings?: AttachmentSettings;
  draft?: string;
  draftSaveDelayMs?: number;
  draftTarget: ComposerDraftTarget;
  userMessages: readonly string[];
  controlDisabled?: boolean;
  controlState?: ControlState;
  deleteDisabled?: boolean;
  usage?: TokenUsage | null;
  onControl?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onSend: (
    content: string,
    draftRevision: number,
    attachments: PendingAttachment[],
  ) => Promise<void>;
}
