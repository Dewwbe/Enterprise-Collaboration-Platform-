import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceScopeResolver } from '../services/workspace-scope-resolver.service';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { WorkspaceAccessService } from '../access/workspace-access.service';
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
  let workspaceAccess: {
    requireWorkspaceMembership: jest.Mock;
    requireOrganizationMembership: jest.Mock;
    requireProjectMembership: jest.Mock;
    requireTaskMembership: jest.Mock;
  };

  const makeContext = (params: Record<string, string>, user?: { userId: string }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params, user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    workspaceAccess = {
      requireWorkspaceMembership: jest.fn(),
      requireOrganizationMembership: jest.fn(),
      requireProjectMembership: jest.fn(),
      requireTaskMembership: jest.fn(),
    };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  it('allows the request through when the route has no @Roles() requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(makeContext({ workspaceId: 'ws-1' }, { userId: 'user-1' })),
    ).resolves.toBe(true);
    expect(workspaceAccess.requireWorkspaceMembership).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when workspaceId or user is missing from the request', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.MEMBER]);

    await expect(
      guard.canActivate(makeContext({}, { userId: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propagates NotFoundException for a non-member instead of leaking existence via 403', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.MEMBER]);
    workspaceAccess.requireWorkspaceMembership.mockRejectedValue(
      new NotFoundException('Workspace not found.'),
    );

    await expect(
      guard.canActivate(makeContext({ workspaceId: 'ws-1' }, { userId: 'user-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException when the member role is below the required minimum', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.ADMIN]);
    workspaceAccess.requireWorkspaceMembership.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
    });

    await expect(
      guard.canActivate(makeContext({ workspaceId: 'ws-1' }, { userId: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the request through and attaches membership when the role is sufficient', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.MEMBER]);
    const membership = { role: WorkspaceRole.ADMIN };
    workspaceAccess.requireWorkspaceMembership.mockResolvedValue(membership);
    const request: Record<string, unknown> = {
      params: { workspaceId: 'ws-1' },
      user: { userId: 'user-1' },
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.workspaceMembership).toBe(membership);
  });

  it('resolves membership via :organizationId when there is no :workspaceId', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.ADMIN]);
    workspaceAccess.requireOrganizationMembership.mockResolvedValue({
      role: WorkspaceRole.OWNER,
    });

    await expect(
      guard.canActivate(makeContext({ organizationId: 'org-1' }, { userId: 'user-1' })),
    ).resolves.toBe(true);
    expect(workspaceAccess.requireOrganizationMembership).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'Organization not found.',
    );
  });

  it('resolves membership via :projectId -> workspace when there is no :workspaceId', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.MEMBER]);
    workspaceAccess.requireProjectMembership.mockResolvedValue({
      project: { id: 'proj-1' },
      membership: { role: WorkspaceRole.MEMBER },
    });

    await expect(
      guard.canActivate(makeContext({ projectId: 'proj-1' }, { userId: 'user-1' })),
    ).resolves.toBe(true);
    expect(workspaceAccess.requireProjectMembership).toHaveBeenCalledWith(
      'proj-1',
      'user-1',
    );
  });

  it('resolves membership via :taskId -> project -> workspace when no other id is present', async () => {
    reflector.getAllAndOverride.mockReturnValue([WorkspaceRole.ADMIN]);
    workspaceAccess.requireTaskMembership.mockResolvedValue({
      task: { id: 'task-1' },
      membership: { role: WorkspaceRole.VIEWER },
    });

    await expect(
      guard.canActivate(makeContext({ taskId: 'task-1' }, { userId: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaceAccess.requireTaskMembership).toHaveBeenCalledWith(
      'task-1',
      'user-1',
    );
  });
});
