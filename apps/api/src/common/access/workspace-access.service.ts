import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_HIERARCHY, WorkspaceRole } from '../enums/workspace-role.enum';

/**
 * Single source of truth for workspace/organization membership resolution and
 * role enforcement. Previously each of TasksService, CommentsService,
 * AttachmentsService, OrganizationsService and RolesGuard carried its own copy
 * of this join-and-check logic; consolidating it here keeps the "404 (not
 * 403) for non-members, so cross-workspace ids never leak" rule enforced in
 * exactly one place instead of four+.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async findWorkspaceMembership(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  async requireWorkspaceMembership(
    workspaceId: string,
    userId: string,
    notFoundMessage = 'Workspace not found.',
  ) {
    const membership = await this.findWorkspaceMembership(workspaceId, userId);
    if (!membership) {
      throw new NotFoundException(notFoundMessage);
    }
    return membership;
  }

  async requireOrganizationMembership(
    organizationId: string,
    userId: string,
    notFoundMessage = 'Organization not found.',
  ) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException(notFoundMessage);
    }
    return membership;
  }

  /** Resolves membership by joining project -> workspace (a task/comment/attachment carries no workspaceId of its own). */
  async requireProjectMembership(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    const membership = await this.requireWorkspaceMembership(
      project.workspaceId,
      userId,
      'Project not found.',
    );
    return { project, membership };
  }

  /** Resolves membership by joining task -> project -> workspace. A soft-deleted task is treated as not found, same as a missing one. */
  async requireTaskMembership(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found.');
    }
    const membership = await this.requireWorkspaceMembership(
      task.project.workspaceId,
      userId,
      'Task not found.',
    );
    return { task, membership };
  }

  assertMinRole(
    role: WorkspaceRole,
    minimum: WorkspaceRole,
    message = 'Your workspace role does not permit this action.',
  ) {
    if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minimum]) {
      throw new ForbiddenException(message);
    }
  }

  assertRoleIn(
    role: WorkspaceRole,
    allowed: WorkspaceRole[],
    message = 'Your role does not permit this action.',
  ) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException(message);
    }
  }
}
