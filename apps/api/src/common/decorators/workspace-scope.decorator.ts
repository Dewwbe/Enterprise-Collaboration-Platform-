import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ResolvedWorkspaceScope } from '../services/workspace-scope-resolver.service';

/**
 * Extracts the workspace scope resolved by RolesGuard (request.workspaceScope),
 * so handlers/services that need the workspace id for a :projectId/:taskId route
 * don't repeat the lookup RolesGuard already did. Only populated on routes that
 * carry @Roles(...) + @UseGuards(RolesGuard).
 */
export const WorkspaceScope = createParamDecorator(
  (data: keyof ResolvedWorkspaceScope | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const scope: ResolvedWorkspaceScope | undefined = request.workspaceScope;
    return data ? scope?.[data] : scope;
  },
);
