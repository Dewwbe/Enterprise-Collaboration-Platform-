import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedWorkspaceScope {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
}

/**
 * Resolves which workspace a request is scoped to, regardless of which route
 * param actually carries that context - directly via :workspaceId (Workspaces,
 * Projects), or indirectly by joining through :projectId -> Project (Tasks) or
 * :taskId -> Task -> Project (Comments). This is what lets RolesGuard enforce
 * workspace RBAC uniformly across nested resources instead of each module
 * re-implementing the same project/task -> workspace membership lookup.
 *
 * 404s (not 403) when a referenced project/task doesn't exist, or when it
 * doesn't belong to the :projectId also present on the route, so a stale or
 * cross-workspace id can't be used to probe for existence.
 */
@Injectable()
export class WorkspaceScopeResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    params: Record<string, string | undefined>,
  ): Promise<ResolvedWorkspaceScope> {
    if (params.workspaceId) {
      return { workspaceId: params.workspaceId };
    }

    if (params.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: params.taskId },
        select: { projectId: true, project: { select: { workspaceId: true } } },
      });
      if (!task) {
        throw new NotFoundException('Task not found.');
      }
      if (params.projectId && task.projectId !== params.projectId) {
        throw new NotFoundException('Task not found.');
      }
      return {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: params.taskId,
      };
    }

    if (params.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: params.projectId },
        select: { workspaceId: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found.');
      }
      return { workspaceId: project.workspaceId, projectId: params.projectId };
    }

    throw new NotFoundException(
      'Workspace context could not be resolved for this route.',
    );
  }
}
