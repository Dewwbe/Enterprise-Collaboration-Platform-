import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { TASK_STATUS_TRANSITIONS, TaskStatus } from '../common/enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // Workspace membership/role is already enforced by RolesGuard before this runs
  // (see tasks.controller.ts, which resolves :projectId/:taskId via
  // WorkspaceScopeResolver). This only validates that a given assignee actually
  // belongs to the same workspace as the task.
  private async requireWorkspaceMember(workspaceId: string, assigneeId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
    });
    if (!membership) {
      throw new BadRequestException('Assignee must be a member of the workspace.');
    }
  }

  async create(
    userId: string,
    projectId: string,
    workspaceId: string,
    dto: CreateTaskDto,
  ) {
    if (dto.assigneeId) {
      await this.requireWorkspaceMember(workspaceId, dto.assigneeId);
    }

    return this.prisma.task.create({
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
  }

  async findAll(projectId: string, query: QueryTasksDto) {
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

  async findOne(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  async update(taskId: string, workspaceId: string, dto: UpdateTaskDto) {
    const task = await this.findOne(taskId);

    if (dto.assigneeId) {
      await this.requireWorkspaceMember(workspaceId, dto.assigneeId);
    }

    if (dto.status && dto.status !== task.status) {
      const allowedNext = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];
      if (allowedNext !== dto.status) {
        throw new BadRequestException(
          `Cannot transition task from ${task.status} to ${dto.status}.`,
        );
      }
    }

    return this.prisma.task.update({
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
  }

  async remove(taskId: string) {
    await this.findOne(taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
  }
}
