import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { TaskStatus } from '../common/enums/task-status.enum';
import { TASK_ASSIGNED_EVENT, TASK_COMPLETED_EVENT } from '../common/events';
import { CacheService } from '../redis/cache.service';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    project: { findUnique: jest.Mock };
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
  let eventEmitter: { emit: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findUnique: jest.fn() },
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
    eventEmitter = { emit: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        WorkspaceAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'proj-1', { title: 'Task' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the caller is not a workspace member', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'proj-1', { title: 'Task' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a VIEWER from creating a task', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique.mockResolvedValueOnce({
        role: WorkspaceRole.VIEWER,
      });

      await expect(
        service.create('user-1', 'proj-1', { title: 'Task' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an assignee who is not a workspace member', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique
        .mockResolvedValueOnce({ role: WorkspaceRole.MEMBER })
        .mockResolvedValueOnce(null);

      await expect(
        service.create('user-1', 'proj-1', { title: 'Task', assigneeId: 'user-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the task with the caller as reporter', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.create.mockResolvedValue({ id: 'task-1' });

      await service.create('user-1', 'proj-1', { title: 'Task' });

      const args = prisma.task.create.mock.calls[0][0];
      expect(args.data.reporterId).toBe('user-1');
      expect(args.data.projectId).toBe('proj-1');
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });

    it('emits TaskAssignedEvent when created with an assignee', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.create.mockResolvedValue({
        id: 'task-1',
        title: 'Task',
        projectId: 'proj-1',
      });

      await service.create('user-1', 'proj-1', { title: 'Task', assigneeId: 'user-2' });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TASK_ASSIGNED_EVENT,
        expect.objectContaining({ taskId: 'task-1', assigneeId: 'user-2' }),
      );
    });

    it('does not emit TaskAssignedEvent when created without an assignee', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.create.mockResolvedValue({
        id: 'task-1',
        title: 'Task',
        projectId: 'proj-1',
      });

      await service.create('user-1', 'proj-1', { title: 'Task' });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('update - status transitions', () => {
    const baseTask = {
      id: 'task-1',
      projectId: 'proj-1',
      status: TaskStatus.TODO,
      project: { id: 'proj-1', workspaceId: 'ws-1' },
    };

    it('allows the next legal transition', async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.update.mockResolvedValue({
        ...baseTask,
        status: TaskStatus.IN_PROGRESS,
      });

      await service.update('user-1', 'proj-1', 'task-1', {
        status: TaskStatus.IN_PROGRESS,
      });

      expect(prisma.task.update).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });

    it('does not invalidate the workspace stats cache for a non-status update', async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.update.mockResolvedValue({ ...baseTask, title: 'Renamed' });

      await service.update('user-1', 'proj-1', 'task-1', { title: 'Renamed' });

      expect(cache.del).not.toHaveBeenCalled();
    });

    it('emits TaskCompletedEvent when a task transitions into DONE', async () => {
      const reviewTask = {
        ...baseTask,
        status: TaskStatus.REVIEW,
        reporterId: 'reporter-1',
      };
      prisma.task.findUnique.mockResolvedValue(reviewTask);
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.task.update.mockResolvedValue({ ...reviewTask, status: TaskStatus.DONE });

      await service.update('user-1', 'proj-1', 'task-1', { status: TaskStatus.DONE });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TASK_COMPLETED_EVENT,
        expect.objectContaining({ taskId: 'task-1', reporterId: 'reporter-1' }),
      );
    });

    it('rejects skipping a step in the workflow', async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(
        service.update('user-1', 'proj-1', 'task-1', { status: TaskStatus.DONE }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('rejects a backward transition', async () => {
      prisma.task.findUnique.mockResolvedValue({
        ...baseTask,
        status: TaskStatus.REVIEW,
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(
        service.update('user-1', 'proj-1', 'task-1', { status: TaskStatus.IN_PROGRESS }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any transition out of the terminal DONE status', async () => {
      prisma.task.findUnique.mockResolvedValue({ ...baseTask, status: TaskStatus.DONE });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(
        service.update('user-1', 'proj-1', 'task-1', { status: TaskStatus.TODO }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('rejects a MEMBER from deleting a task', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        projectId: 'proj-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

      await expect(service.remove('user-1', 'proj-1', 'task-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to delete a task', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        projectId: 'proj-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });

      await service.remove('user-1', 'proj-1', 'task-1');

      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });

    it('throws NotFoundException for a task outside the given project', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        projectId: 'proj-2',
        project: { workspaceId: 'ws-1' },
      });

      await expect(service.remove('user-1', 'proj-1', 'task-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
