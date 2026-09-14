import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalDiskStorageService } from './local-disk-storage.service';

describe('LocalDiskStorageService', () => {
  let service: LocalDiskStorageService;
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecp-uploads-test-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalDiskStorageService,
        { provide: ConfigService, useValue: { get: () => uploadDir } },
      ],
    }).compile();

    service = module.get<LocalDiskStorageService>(LocalDiskStorageService);
    service.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('writes and reads back an uploaded file', async () => {
    await service.upload(Buffer.from('hello world'), 'a-key.txt');

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = service.getStream('a-key.txt');
      stream.on('data', (chunk) => chunks.push(chunk as Buffer));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe('hello world');
  });

  it('delete() is a no-op for a file that does not exist', async () => {
    await expect(service.delete('does-not-exist.txt')).resolves.toBeUndefined();
  });

  it('deletes a file that exists', async () => {
    await service.upload(Buffer.from('x'), 'to-delete.txt');

    await service.delete('to-delete.txt');

    expect(fs.existsSync(path.join(uploadDir, 'to-delete.txt'))).toBe(false);
  });

  it('rejects a storage key that would escape the upload directory', async () => {
    await expect(
      service.upload(Buffer.from('x'), '../../etc/passwd'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
