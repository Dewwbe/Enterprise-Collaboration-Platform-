import { Readable } from 'stream';

export const STORAGE_SERVICE = 'STORAGE_SERVICE';

/**
 * Storage abstraction (requirement doc Section 4/13): the Attachments module
 * talks only to this interface, never to the filesystem directly, so a
 * future S3-compatible implementation is a provider swap in storage.module.ts,
 * not a rewrite of AttachmentsService.
 */
export interface StorageService {
  /** Persists a file and returns its unique storage key. */
  upload(buffer: Buffer, storageKey: string): Promise<void>;

  /** Returns a readable stream for a previously-uploaded file. */
  getStream(storageKey: string): Readable;

  /** Deletes a previously-uploaded file. Safe to call on a missing file. */
  delete(storageKey: string): Promise<void>;
}
