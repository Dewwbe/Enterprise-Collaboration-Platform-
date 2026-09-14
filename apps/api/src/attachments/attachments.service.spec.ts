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

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: {
    task: { findUnique: jest.Mock };
    workspaceMember: { findUnique: jest.Mock };
    attachment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
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
        delete: jest.fn(),
      },
    };
    storage = { upload: jest.fn(), getStream: jest.fn(), delete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
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
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.VIEWER });

      await expect(service.create('user-1', 'task-1', baseFile())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a missing file with a clean 400 instead of crashing', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(
        service.create('user-1', 'task-1', undefined as unknown as Express.Multer.File),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a disallowed MIME type', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

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
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(
        service.create('user-1', 'task-1', baseFile({ size: 11 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('uploads and persists a valid file with a unique, sanitized storage key', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
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
    const membershipOf = (role: WorkspaceRole) => ({ role });

    it('allows the uploader to delete their own attachment', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue(
        membershipOf(WorkspaceRole.MEMBER),
      );
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'att-1',
        taskId: 'task-1',
        uploaderId: 'user-1',
        storageKey: 'key-1',
      });

      await service.remove('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(storage.delete).toHaveBeenCalledWith('key-1');
    });

    it("allows an ADMIN to delete someone else's attachment", async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue(
        membershipOf(WorkspaceRole.ADMIN),
      );
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'att-1',
        taskId: 'task-1',
        uploaderId: 'user-2',
        storageKey: 'key-1',
      });

      await service.remove('user-1', 'task-1', 'att-1');

      expect(prisma.attachment.delete).toHaveBeenCalled();
    });

    it("rejects a MEMBER deleting someone else's attachment", async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue(
        membershipOf(WorkspaceRole.MEMBER),
      );
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'att-1',
        taskId: 'task-1',
        uploaderId: 'user-2',
        storageKey: 'key-1',
      });

      await expect(service.remove('user-1', 'task-1', 'att-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
    });
  });

  describe('getDownload', () => {
    it('returns the attachment and a readable stream', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.VIEWER });
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'att-1',
        taskId: 'task-1',
        storageKey: 'key-1',
      });
      const stream = new Readable();
      storage.getStream.mockReturnValue(stream);

      const result = await service.getDownload('user-1', 'task-1', 'att-1');

      expect(result.stream).toBe(stream);
      expect(storage.getStream).toHaveBeenCalledWith('key-1');
    });
  });
});
