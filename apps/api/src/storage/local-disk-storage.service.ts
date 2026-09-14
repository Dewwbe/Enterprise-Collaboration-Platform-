import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { StorageService } from './storage.interface';

@Injectable()
export class LocalDiskStorageService implements StorageService, OnModuleInit {
  private readonly rootDir: string;

  constructor(private readonly configService: ConfigService) {
    const configuredDir = this.configService.get<string>('upload.dir')!;
    // Relative UPLOAD_DIR resolves under the api package root (cwd when the
    // app boots), not the compiled dist/ output.
    this.rootDir = path.isAbsolute(configuredDir)
      ? configuredDir
      : path.join(process.cwd(), configuredDir);
  }

  onModuleInit() {
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  async upload(buffer: Buffer, storageKey: string): Promise<void> {
    await fs.promises.writeFile(this.resolveSafePath(storageKey), buffer);
  }

  getStream(storageKey: string): Readable {
    return fs.createReadStream(this.resolveSafePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolveSafePath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Resolves storageKey against rootDir and rejects anything that would
   * escape it - defense in depth on top of AttachmentsService always
   * generating storage keys itself (uuid + sanitized extension), never from
   * raw client input.
   */
  private resolveSafePath(storageKey: string): string {
    const resolved = path.resolve(this.rootDir, storageKey);
    if (!resolved.startsWith(this.rootDir + path.sep)) {
      throw new BadRequestException('Invalid storage key.');
    }
    return resolved;
  }
}
