import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceScopeResolver } from '../services/workspace-scope-resolver.service';
import { WorkspaceRole } from '../enums/workspace-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { workspaceMember: { findUnique: jest.Mock } };
  let scopeResolver: { resolve: jest.Mock };

  const makeContext = (
    params: Record<string, string>,
    userId?: string,
  ): ExecutionContext => {
    const request = { params, user: userId ? { userId } : undefined };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { workspaceMember: { findUnique: jest.fn() } };
    scopeResolver = { resolve: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
        { provide: WorkspaceScopeResolver, useValue: scopeResolver },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  it('allows the request through when the route has no @Roles', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(
      makeContext({ workspaceId: 'ws-1' }, 'user-1'),
    );

    expect(result).toBe(true);
    expect(scopeResolver.resolve).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request even with a matching route param', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.VIEWER]);

    await expect(
      guard.canActivate(makeContext({ workspaceId: 'ws-1' }, undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the caller has no membership in the resolved workspace', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.VIEWER]);
    scopeResolver.resolve.mockResolvedValue({ workspaceId: 'ws-1' });
    prisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext({ workspaceId: 'ws-1' }, 'user-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the caller role is below the minimum required', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.ADMIN]);
    scopeResolver.resolve.mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' });
    prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });

    await expect(
      guard.canActivate(makeContext({ projectId: 'proj-1' }, 'user-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows access and attaches the resolved scope/membership to the request', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.MEMBER]);
    const scope = { workspaceId: 'ws-1', projectId: 'proj-1', taskId: 'task-1' };
    scopeResolver.resolve.mockResolvedValue(scope);
    const membership = { role: WorkspaceRole.ADMIN };
    prisma.workspaceMember.findUnique.mockResolvedValue(membership);

    const context = makeContext({ projectId: 'proj-1', taskId: 'task-1' }, 'user-1');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest();
    expect(request.workspaceScope).toEqual(scope);
    expect(request.workspaceMembership).toEqual(membership);
  });

  it('resolves scope using the route params passed through to the resolver', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.VIEWER]);
    scopeResolver.resolve.mockResolvedValue({ workspaceId: 'ws-1', taskId: 'task-1' });
    prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.VIEWER });

    await guard.canActivate(makeContext({ taskId: 'task-1' }, 'user-1'));

    expect(scopeResolver.resolve).toHaveBeenCalledWith({ taskId: 'task-1' });
  });
});
