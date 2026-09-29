import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_LOG_KEY, AuditLogMetadata } from '../decorators/audit-log.decorator';

type PrismaDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<unknown>;
};

/**
 * Writes one AuditLog row per @AuditLog-decorated request that completes
 * successfully (requirement doc Section 14: user, action, timestamp, entity,
 * previous/new values). No-ops when the route carries no @AuditLog metadata.
 *
 * Must run *after* TransformInterceptor in app.module.ts's APP_INTERCEPTOR
 * list (interceptors registered later sit closer to the controller), so
 * `result` here is the handler's raw return value, not the {success,data}
 * envelope.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const metadata = this.reflector.getAllAndOverride<AuditLogMetadata | undefined>(
      AUDIT_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    const entityIdFromRoute: string | undefined = metadata.idParam
      ? request.params?.[metadata.idParam]
      : undefined;

    const previousValue = entityIdFromRoute
      ? await this.fetchEntity(metadata.entityType, entityIdFromRoute)
      : null;

    return next.handle().pipe(
      tap((result: unknown) => {
        const entityId = entityIdFromRoute ?? (result as { id?: string } | undefined)?.id;
        if (!entityId) {
          return;
        }
        this.prisma.auditLog
          .create({
            data: {
              userId,
              action: metadata.action,
              entityType: metadata.entityType,
              entityId,
              previousValue: (previousValue ?? undefined) as Prisma.InputJsonValue,
              newValue: (result ?? undefined) as Prisma.InputJsonValue,
            },
          })
          .catch((error: Error) => {
            // Audit logging is best-effort observability, not a transactional
            // guarantee - a write failure here must never surface to the caller.
            this.logger.error(`Failed to write audit log: ${error.message}`);
          });
      }),
    );
  }

  private async fetchEntity(entityType: string, id: string): Promise<unknown> {
    const delegateName = entityType.charAt(0).toLowerCase() + entityType.slice(1);
    const delegate = (this.prisma as unknown as Record<string, PrismaDelegate>)[
      delegateName
    ];
    if (!delegate) {
      return null;
    }
    try {
      return await delegate.findUnique({ where: { id } });
    } catch {
      return null;
    }
  }
}
