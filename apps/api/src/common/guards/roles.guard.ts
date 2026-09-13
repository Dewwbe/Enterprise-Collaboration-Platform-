import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLE_HIERARCHY, WorkspaceRole } from '../enums/workspace-role.enum';
import { WorkspaceScopeResolver } from '../services/workspace-scope-resolver.service';

/**
 * Enforces workspace-level RBAC. Resolves the caller's workspace membership via
 * WorkspaceScopeResolver, which accepts :workspaceId directly or indirectly via
 * :projectId/:taskId - so the same guard covers Workspaces, Projects, Tasks, and
 * Comments routes without each module re-deriving workspace context itself.
 * Fails closed: no membership => 403, unresolvable/foreign scope => 404.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly scopeResolver: WorkspaceScopeResolver,
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
        'Authentication is required to evaluate access for this route.',
      );
    }

    const scope = await this.scopeResolver.resolve(request.params);

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: scope.workspaceId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }

    const minimumRequired = Math.min(
      ...requiredRoles.map((role) => ROLE_HIERARCHY[role]),
    );
    const callerLevel = ROLE_HIERARCHY[membership.role as WorkspaceRole];

    if (callerLevel < minimumRequired) {
      throw new ForbiddenException('Your workspace role does not permit this action.');
    }

    // Attach for downstream handlers/services that want the resolved scope/role
    // without a second lookup.
    request.workspaceScope = scope;
    request.workspaceMembership = membership;
    return true;
  }
}
