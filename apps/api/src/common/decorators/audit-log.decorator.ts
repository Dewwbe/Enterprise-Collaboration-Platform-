import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export interface AuditLogMetadata {
  /** Dot-namespaced action name, e.g. "workspace.update". */
  action: string;
  /** Matches a Prisma model name (PascalCase), e.g. "Workspace". */
  entityType: string;
  /**
   * Route param holding the entity's id, e.g. "workspaceId". Omit for
   * create actions (no id exists until the handler runs) or for
   * composite-key entities the interceptor can't generically look up
   * (e.g. workspace/organization memberships) - previousValue is simply
   * null in those cases, newValue still gets recorded from the response.
   */
  idParam?: string;
}

/**
 * Marks a route as audit-worthy. AuditLogInterceptor (registered globally)
 * no-ops for any route without this decorator, mirroring how @Roles/RolesGuard
 * only apply where explicitly opted in.
 */
export const AuditLog = (action: string, entityType: string, idParam?: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, entityType, idParam } satisfies AuditLogMetadata);
