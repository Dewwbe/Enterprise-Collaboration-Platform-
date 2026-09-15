import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceAccessService } from '../access/workspace-access.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLE_HIERARCHY, WorkspaceRole } from '../enums/workspace-role.enum';

/**
 * Enforces workspace-level RBAC. Resolves the caller's membership role from
 * whichever route param identifies the resource, walking the join chain via
 * WorkspaceAccessService when the route doesn't carry `workspaceId` directly:
 *   - `:workspaceId`    -> direct workspace membership
 *   - `:organizationId` -> organization membership (same role enum/hierarchy)
 *   - `:projectId`      -> project -> workspace membership
 *   - `:taskId`         -> task -> project -> workspace membership
 * checked in that order, then compares the resolved role against the minimum
 * role set via @Roles(...).
 *
 * Fails closed with a 404 (not 403) when the caller isn't a member - matching
 * every other membership check in the app (WorkspacesService.findOne,
 * ProjectsService, WorkspaceAccessService) so a non-member can never tell a
 * real resource id from a made-up one just by the status code they get back.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException(
        'Workspace context is required to evaluate access for this route.',
      );
    }

    const membership = await this.resolveMembership(request.params ?? {}, userId);

    const minimumRequired = Math.min(
      ...requiredRoles.map((role) => ROLE_HIERARCHY[role]),
    );
    const callerLevel = ROLE_HIERARCHY[membership.role as WorkspaceRole];

    if (callerLevel < minimumRequired) {
      throw new ForbiddenException('Your workspace role does not permit this action.');
    }

    // Attach for downstream handlers/services that want the resolved role
    // without a second lookup.
    request.workspaceMembership = membership;
    return true;
  }

  private async resolveMembership(
    params: Record<string, string | undefined>,
    userId: string,
  ) {
    if (params.workspaceId) {
      return this.workspaceAccess.requireWorkspaceMembership(
        params.workspaceId,
        userId,
        'Workspace not found.',
      );
    }
    if (params.organizationId) {
      return this.workspaceAccess.requireOrganizationMembership(
        params.organizationId,
        userId,
        'Organization not found.',
      );
    }
    if (params.projectId) {
      const { membership } = await this.workspaceAccess.requireProjectMembership(
        params.projectId,
        userId,
      );
      return membership;
    }
    if (params.taskId) {
      const { membership } = await this.workspaceAccess.requireTaskMembership(
        params.taskId,
        userId,
      );
      return membership;
    }
    throw new ForbiddenException(
      'Workspace context is required to evaluate access for this route.',
    );
  }
}
