import { File, Directory, Paths } from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

const ATTACHMENTS_DIR_NAME = 'attachments';

/**
 * Get or create the persistent attachments directory.
 */
function getAttachmentsDir(): Directory {
  const dir = new Directory(Paths.document, ATTACHMENTS_DIR_NAME);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Copy a picked file from cache/temp to persistent storage.
 * Returns the new persistent URI.
 */
export function persistAttachment(
  sourceUri: string,
  fileName: string
): string {
  const dir = getAttachmentsDir();

  const ext = fileName.split('.').pop() || '';
  const persistedName = `${uuidv4()}.${ext}`;

  const sourceFile = new File(sourceUri);
  const destFile = new File(dir, persistedName);

  sourceFile.copy(destFile);
  return destFile.uri;
}

/**
 * Delete a persisted attachment file.
 */
export function deleteAttachmentFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore — file already gone
  }
}

/**
 * Get file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
