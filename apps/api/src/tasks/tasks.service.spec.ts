import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '../common/enums/task-status.enum';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    workspaceMember: { findUnique: jest.Mock };
    task: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      workspaceMember: { findUnique: jest.fn() },
      task: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('rejects an assignee who is not a workspace member', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'proj-1', 'ws-1', {
          title: 'Task',
          assigneeId: 'user-2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the task with the caller as reporter', async () => {
      prisma.task.create.mockResolvedValue({ id: 'task-1' });

      await service.create('user-1', 'proj-1', 'ws-1', { title: 'Task' });

      const args = prisma.task.create.mock.calls[0][0];
      expect(args.data.reporterId).toBe('user-1');
      expect(args.data.projectId).toBe('proj-1');
    });
  });

  describe('update - status transitions', () => {
    const baseTask = { id: 'task-1', projectId: 'proj-1', status: TaskStatus.TODO };

    it('allows the next legal transition', async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.task.update.mockResolvedValue({
        ...baseTask,
        status: TaskStatus.IN_PROGRESS,
      });

      await service.update('task-1', 'ws-1', { status: TaskStatus.IN_PROGRESS });

      expect(prisma.task.update).toHaveBeenCalled();
    });

    it('rejects skipping a step in the workflow', async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);

      await expect(
        service.update('task-1', 'ws-1', { status: TaskStatus.DONE }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a backward transition', async () => {
      prisma.task.findUnique.mockResolvedValue({
        ...baseTask,
        status: TaskStatus.REVIEW,
      });

      await expect(
        service.update('task-1', 'ws-1', { status: TaskStatus.IN_PROGRESS }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any transition out of the terminal DONE status', async () => {
      prisma.task.findUnique.mockResolvedValue({ ...baseTask, status: TaskStatus.DONE });

      await expect(
        service.update('task-1', 'ws-1', { status: TaskStatus.TODO }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne / remove', () => {
    it('throws NotFoundException when the task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne('task-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the task when it exists', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.remove('task-1');

      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    });
  });
});
