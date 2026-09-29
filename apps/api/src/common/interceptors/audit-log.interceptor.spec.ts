import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogMetadata } from '../decorators/audit-log.decorator';

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: {
    auditLog: { create: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };

  const buildContext = (
    params: Record<string, string>,
    userId = 'user-1',
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ params, user: { userId } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const buildHandler = (result: unknown): CallHandler => ({
    handle: () => of(result),
  });

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      workspace: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogInterceptor,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    interceptor = module.get(AuditLogInterceptor);
  });

  it('passes through untouched when the route has no @AuditLog metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const observable = await interceptor.intercept(
      buildContext({}),
      buildHandler({ id: 'x' }),
    );

    expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => observable.subscribe(() => resolve()));
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('captures previousValue via idParam and newValue from the response', async () => {
    const metadata: AuditLogMetadata = {
      action: 'workspace.update',
      entityType: 'Workspace',
      idParam: 'workspaceId',
    };
    reflector.getAllAndOverride.mockReturnValue(metadata);
    prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', name: 'Old name' });

    const observable = await interceptor.intercept(
      buildContext({ workspaceId: 'ws-1' }),
      buildHandler({ id: 'ws-1', name: 'New name' }),
    );
    await new Promise<void>((resolve) => observable.subscribe(() => resolve()));
    await flush();

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'workspace.update',
        entityType: 'Workspace',
        entityId: 'ws-1',
        previousValue: { id: 'ws-1', name: 'Old name' },
        newValue: { id: 'ws-1', name: 'New name' },
      },
    });
  });

  it('falls back to the response id when there is no idParam (create actions)', async () => {
    const metadata: AuditLogMetadata = {
      action: 'project.create',
      entityType: 'Project',
    };
    reflector.getAllAndOverride.mockReturnValue(metadata);

    const observable = await interceptor.intercept(
      buildContext({}),
      buildHandler({ id: 'proj-1', name: 'New project' }),
    );
    await new Promise<void>((resolve) => observable.subscribe(() => resolve()));
    await flush();

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'project.create',
        entityType: 'Project',
        entityId: 'proj-1',
        previousValue: undefined,
        newValue: { id: 'proj-1', name: 'New project' },
      },
    });
  });

  it('does not write an audit row when no entity id can be resolved', async () => {
    const metadata: AuditLogMetadata = {
      action: 'org.inviteMember',
      entityType: 'OrganizationMember',
    };
    reflector.getAllAndOverride.mockReturnValue(metadata);

    const observable = await interceptor.intercept(
      buildContext({}),
      buildHandler(undefined),
    );
    await new Promise<void>((resolve) => observable.subscribe(() => resolve()));
    await flush();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('swallows a failed audit write instead of throwing', async () => {
    const metadata: AuditLogMetadata = {
      action: 'task.delete',
      entityType: 'Task',
      idParam: 'taskId',
    };
    reflector.getAllAndOverride.mockReturnValue(metadata);
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    const observable = await interceptor.intercept(
      buildContext({ taskId: 'task-1' }),
      buildHandler(undefined),
    );

    await expect(
      new Promise<void>((resolve) => observable.subscribe(() => resolve())),
    ).resolves.toBeUndefined();
    await flush();
  });
});
