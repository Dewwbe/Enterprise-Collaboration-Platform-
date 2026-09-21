import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

const taskFixture = { id: 'task-1', project: { workspaceId: 'ws-1' } };
const membershipOf = (role: WorkspaceRole) => ({ role });
const attachmentFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  taskId: 'task-1',
  uploaderId: 'user-1',
  storageKey: 'key-1',
  ...overrides,
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: {
    task: { findUnique: jest.Mock };
    workspaceMember: { findUnique: jest.Mock };
    attachment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let storage: { upload: jest.Mock; getStream: jest.Mock; delete: jest.Mock };

  const baseFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('data'),
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(async () => {
    prisma = {
      task: { findUnique: jest.fn() },
      workspaceMember: { findUnique: jest.fn() },
      attachment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    storage = { upload: jest.fn(), getStream: jest.fn(), delete: jest.fn() };
    // Sane defaults - a workspace MEMBER acting on a task that exists in a
    // known workspace. Individual tests override whichever mock their
    // scenario actually needs to differ on.
    prisma.task.findUnique.mockResolvedValue(taskFixture);
    prisma.workspaceMember.findUnique.mockResolvedValue(membershipOf(WorkspaceRole.MEMBER));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        WorkspaceAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ConfigService, useValue: { get: () => 10 } },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.create('user-1', 'task-1', baseFile())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a VIEWER from uploading', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(membershipOf(WorkspaceRole.VIEWER));

      await expect(service.create('user-1', 'task-1', baseFile())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a missing file with a clean 400 instead of crashing', async () => {
      await expect(
        service.create('user-1', 'task-1', undefined as unknown as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.create(
          'user-1',
          'task-1',
          baseFile({ mimetype: 'application/x-msdownload' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('rejects a file over the configured size limit', async () => {
      await expect(
        service.create('user-1', 'task-1', baseFile({ size: 11 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('uploads and persists a valid file with a unique, sanitized storage key', async () => {
      prisma.attachment.create.mockResolvedValue({ id: 'att-1' });

      await service.create(
        'user-1',
        'task-1',
        baseFile({ originalname: '../evil name.pdf' }),
      );

      const storageKey = storage.upload.mock.calls[0][1] as string;
      expect(storageKey).not.toContain('..');
      expect(storageKey).not.toContain('/');
      expect(storageKey.endsWith('evil_name.pdf')).toBe(true);

      const createArgs = prisma.attachment.create.mock.calls[0][0];
      expect(createArgs.data.uploaderId).toBe('user-1');
      expect(createArgs.data.taskId).toBe('task-1');
      expect(createArgs.data.storageKey).toBe(storageKey);
    });
  });

  describe('remove', () => {
    it('soft deletes an attachment (sets deletedAt, keeps the stored file)', async () => {
      prisma.attachment.findUnique.mockResolvedValue(attachmentFixture());

      await service.remove('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it("allows an ADMIN to delete someone else's attachment", async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(membershipOf(WorkspaceRole.ADMIN));
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ uploaderId: 'user-2' }),
      );

      await service.remove('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.update).toHaveBeenCalled();
    });

    it("rejects a MEMBER deleting someone else's attachment", async () => {
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ uploaderId: 'user-2' }),
      );

      await expect(service.remove('user-1', 'task-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.attachment.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an already soft-deleted attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ deletedAt: new Date() }),
      );

      await expect(service.remove('user-1', 'task-1', 'att-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it("rejects a MEMBER restoring someone else's attachment", async () => {
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ uploaderId: 'user-2', deletedAt: new Date() }),
      );

      await expect(service.restore('user-1', 'task-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.attachment.update).not.toHaveBeenCalled();
    });

    it('allows the uploader to restore their own soft-deleted attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ deletedAt: new Date() }),
      );
      prisma.attachment.update.mockResolvedValue({ id: 'att-1', deletedAt: null });

      await service.restore('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { deletedAt: null },
      });
    });

    it("allows an ADMIN to restore someone else's attachment", async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(membershipOf(WorkspaceRole.ADMIN));
      prisma.attachment.findUnique.mockResolvedValue(
        attachmentFixture({ uploaderId: 'user-2', deletedAt: new Date() }),
      );
      prisma.attachment.update.mockResolvedValue({ id: 'att-1', deletedAt: null });

      await service.restore('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.update).toHaveBeenCalled();
    });
  });

  describe('getDownload', () => {
    it('returns the attachment and a readable stream', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(membershipOf(WorkspaceRole.VIEWER));
      prisma.attachment.findUnique.mockResolvedValue(attachmentFixture());
      const stream = new Readable();
      storage.getStream.mockReturnValue(stream);

      const result = await service.getDownload('user-1', 'task-1', 'att-1');

      expect(result.stream).toBe(stream);
      expect(storage.getStream).toHaveBeenCalledWith('key-1');
    });
  });
});
