import {
  type AttachmentSettings,
  type PendingAttachment,
  attachmentIds,
  attachmentPlaceholder,
  validateAttachmentBatch,
} from "../../../../attachments/contract";
import { claimShortId } from "../../../../../infrastructure/randomId";
import { reportError } from "../../../services/errors";

export class PendingAttachments {
  private readonly entries = new Map<string, PendingAttachment>();
  constructor(private settings?: AttachmentSettings) {}
  configure(settings?: AttachmentSettings) {
    this.settings = settings;
  }
  paste(files: File[], content: string) {
    try {
      return this.add(files, content);
    } catch (error) {
      reportError(error);
      return undefined;
    }
  }
  private add(files: File[], content: string) {
    if (!this.settings) {
      return undefined;
    }
    const retained = this.values(content).map(({ file }) => file);
    validateAttachmentBatch([...retained, ...files], this.settings);
    return files
      .map((file) => {
        const id = claimShortId((candidate) => {
          if (this.entries.has(candidate)) {
            return false;
          }
          this.entries.set(candidate, { file, id: candidate });
          return true;
        });
        return attachmentPlaceholder(id, file.name);
      })
      .join("\n");
  }
  values(content: string) {
    const referenced = attachmentIds(content);
    return [...this.entries.values()].filter(({ id }) => referenced.has(id));
  }
  clear() {
    this.entries.clear();
  }
}
