import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { ROLE_HIERARCHY, WorkspaceRole } from '../common/enums/workspace-role.enum';
import { TASK_STATUS_TRANSITIONS, TaskStatus } from '../common/enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // Tasks don't carry a workspaceId of their own (see PROJECT_PLAN.md - RBAC
  // hardening generalizes this resolution into a shared guard later). Until then,
  // every entry point resolves membership by joining through project -> workspace,
  // and 404s (not 403) on a missing membership so cross-workspace ids don't leak.
  private async requireProjectMembership(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Project not found.');
    }
    return { project, membership };
  }

  private async requireTaskMembership(projectId: string, taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.projectId !== projectId) {
      throw new NotFoundException('Task not found.');
    }
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: task.project.workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Task not found.');
    }
    return { task, membership };
  }

  private requireMinRole(role: WorkspaceRole, minimum: WorkspaceRole) {
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minimum]) {
      throw new ForbiddenException('Your workspace role does not permit this action.');
    }
  }

  private async requireWorkspaceMember(workspaceId: string, assigneeId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
    });
    if (!membership) {
      throw new BadRequestException('Assignee must be a member of the workspace.');
    }
  }

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    const { project, membership } = await this.requireProjectMembership(
      projectId,
      userId,
    );
    this.requireMinRole(membership.role as WorkspaceRole, WorkspaceRole.MEMBER);

    if (dto.assigneeId) {
      await this.requireWorkspaceMember(project.workspaceId, dto.assigneeId);
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

  async findAll(userId: string, projectId: string, query: QueryTasksDto) {
    await this.requireProjectMembership(projectId, userId);

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
    const { task } = await this.requireTaskMembership(projectId, taskId, userId);
    return task;
  }

  async update(userId: string, projectId: string, taskId: string, dto: UpdateTaskDto) {
    const { task, membership } = await this.requireTaskMembership(
      projectId,
      taskId,
      userId,
    );
    this.requireMinRole(membership.role as WorkspaceRole, WorkspaceRole.MEMBER);

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

  async remove(userId: string, projectId: string, taskId: string) {
    const { membership } = await this.requireTaskMembership(projectId, taskId, userId);
    this.requireMinRole(membership.role as WorkspaceRole, WorkspaceRole.ADMIN);
    await this.prisma.task.delete({ where: { id: taskId } });
  }
}
