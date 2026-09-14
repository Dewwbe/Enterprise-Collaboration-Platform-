import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { TASK_STATUS_TRANSITIONS, TaskStatus } from '../common/enums/task-status.enum';
import {
  TASK_ASSIGNED_EVENT,
  TaskAssignedEvent,
  TASK_COMPLETED_EVENT,
  TaskCompletedEvent,
} from '../common/events';
import { CacheService } from '../redis/cache.service';
import { workspaceStatsCacheKey } from '../common/cache-keys';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  // Tasks don't carry a workspaceId of their own, so RolesGuard (which reads
  // :workspaceId directly off the route) can't gate these nested routes -
  // every entry point instead resolves membership via WorkspaceAccessService,
  // joining through project -> workspace.
  private async requireTaskInProject(projectId: string, taskId: string, userId: string) {
    const { task, membership } = await this.workspaceAccess.requireTaskMembership(
      taskId,
      userId,
    );
    if (task.projectId !== projectId) {
      throw new NotFoundException('Task not found.');
    }
    return { task, membership };
  }

  private async requireWorkspaceMember(workspaceId: string, assigneeId: string) {
    const membership = await this.workspaceAccess.findWorkspaceMembership(
      workspaceId,
      assigneeId,
    );
    if (!membership) {
      throw new BadRequestException('Assignee must be a member of the workspace.');
    }
  }

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    const { project, membership } = await this.workspaceAccess.requireProjectMembership(
      projectId,
      userId,
    );
    this.workspaceAccess.assertMinRole(
      membership.role as WorkspaceRole,
      WorkspaceRole.MEMBER,
    );

    if (dto.assigneeId) {
      await this.requireWorkspaceMember(project.workspaceId, dto.assigneeId);
    }

    const task = await this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        labels: dto.labels ?? [],
        assigneeId: dto.assigneeId,
        reporterId: userId,
      },
    });

    if (dto.assigneeId) {
      this.eventEmitter.emit(
        TASK_ASSIGNED_EVENT,
        new TaskAssignedEvent(
          task.id,
          task.title,
          task.projectId,
          dto.assigneeId,
          userId,
        ),
      );
    }

    await this.cache.del(workspaceStatsCacheKey(project.workspaceId));

    return task;
  }

  async findAll(userId: string, projectId: string, query: QueryTasksDto) {
    await this.workspaceAccess.requireProjectMembership(projectId, userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort = query.sort ?? '-createdAt';
    const sortField = sort.replace(/^-/, '');
    const sortDirection: 'asc' | 'desc' = sort.startsWith('-') ? 'desc' : 'asc';
    // Enum fields (priority/status) sort alphabetically by their string value here,
    // not by severity/workflow order - acceptable for this phase, revisit if a
    // "sort by actual priority weight" requirement shows up.
    const orderByMap: Record<string, Prisma.TaskOrderByWithRelationInput> = {
      createdAt: { createdAt: sortDirection },
      dueDate: { dueDate: sortDirection },
      priority: { priority: sortDirection },
      status: { status: sortDirection },
      title: { title: sortDirection },
    };
    const orderBy = orderByMap[sortField] ?? orderByMap.createdAt;

    const where = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(userId: string, projectId: string, taskId: string) {
    const { task } = await this.requireTaskInProject(projectId, taskId, userId);
    return task;
  }

  async update(userId: string, projectId: string, taskId: string, dto: UpdateTaskDto) {
    const { task, membership } = await this.requireTaskInProject(
      projectId,
      taskId,
      userId,
    );
    this.workspaceAccess.assertMinRole(
      membership.role as WorkspaceRole,
      WorkspaceRole.MEMBER,
    );

    if (dto.assigneeId) {
      await this.requireWorkspaceMember(task.project.workspaceId, dto.assigneeId);
    }

    if (dto.status && dto.status !== task.status) {
      const allowedNext = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];
      if (allowedNext !== dto.status) {
        throw new BadRequestException(
          `Cannot transition task from ${task.status} to ${dto.status}.`,
        );
      }
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        labels: dto.labels,
        assigneeId: dto.assigneeId === undefined ? undefined : dto.assigneeId,
      },
    });

    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      this.eventEmitter.emit(
        TASK_ASSIGNED_EVENT,
        new TaskAssignedEvent(
          updated.id,
          updated.title,
          updated.projectId,
          dto.assigneeId,
          userId,
        ),
      );
    }

    if (dto.status === TaskStatus.DONE && task.status !== TaskStatus.DONE) {
      this.eventEmitter.emit(
        TASK_COMPLETED_EVENT,
        new TaskCompletedEvent(
          updated.id,
          updated.title,
          updated.projectId,
          task.reporterId,
          userId,
        ),
      );
    }

    if (dto.status && dto.status !== task.status) {
      await this.cache.del(workspaceStatsCacheKey(task.project.workspaceId));
    }

    return updated;
  }

  async remove(userId: string, projectId: string, taskId: string) {
    const { task, membership } = await this.requireTaskInProject(
      projectId,
      taskId,
      userId,
    );
    this.workspaceAccess.assertMinRole(
      membership.role as WorkspaceRole,
      WorkspaceRole.ADMIN,
    );
    await this.prisma.task.delete({ where: { id: taskId } });
    await this.cache.del(workspaceStatsCacheKey(task.project.workspaceId));
  }
}
