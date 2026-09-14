import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { TaskStatus } from '../common/enums/task-status.enum';
import { USER_INVITED_EVENT, UserInvitedEvent } from '../common/events';
import { CacheService } from '../redis/cache.service';
import { workspaceStatsCacheKey } from '../common/cache-keys';

const WORKSPACE_STATS_CACHE_TTL_SECONDS = 60;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const orgMembership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: dto.organizationId, userId } },
    });
    if (!orgMembership) {
      throw new ForbiddenException('You do not belong to this organization.');
    }
    if (
      ![WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(
        orgMembership.role as WorkspaceRole,
      )
    ) {
      throw new ForbiddenException(
        'Only organization owners/admins can create workspaces.',
      );
    }

    const existing = await this.prisma.workspace.findUnique({
      where: {
        organizationId_slug: { organizationId: dto.organizationId, slug: dto.slug },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A workspace with this slug already exists in the organization.',
      );
    }

    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        organizationId: dto.organizationId,
        members: {
          create: { userId, role: WorkspaceRole.OWNER, joinedAt: new Date() },
        },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (
      !workspace ||
      !workspace.members.some((m: { userId: string }) => m.userId === userId)
    ) {
      throw new NotFoundException('Workspace not found.');
    }
    return workspace;
  }

  async getStats(userId: string, workspaceId: string) {
    // Reuses findOne's membership check (throws NotFoundException the same
    // way) so a non-member gets the same response whether the workspace
    // exists or not, before ever touching the cache.
    await this.findOne(userId, workspaceId);

    const cacheKey = workspaceStatsCacheKey(workspaceId);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [memberCount, projectCount, taskCountsRaw] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
      this.prisma.project.count({ where: { workspaceId, isArchived: false } }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { project: { workspaceId } },
        _count: { _all: true },
      }),
    ]);

    const taskCounts: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.REVIEW]: 0,
      [TaskStatus.DONE]: 0,
    };
    for (const row of taskCountsRaw) {
      taskCounts[row.status as TaskStatus] = row._count._all;
    }

    const stats = { memberCount, projectCount, taskCounts };
    await this.cache.set(cacheKey, stats, WORKSPACE_STATS_CACHE_TTL_SECONDS);
    return stats;
  }

  // Called after RolesGuard has already verified the caller's minimum role,
  // so this only needs to perform the write.
  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: dto });
  }

  async archive(workspaceId: string) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { isArchived: true },
    });
  }

  async remove(workspaceId: string) {
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  async inviteMember(
    workspaceId: string,
    invitedById: string,
    inviteeUserId: string,
    role: WorkspaceRole,
  ) {
    const invitee = await this.prisma.user.findUnique({ where: { id: inviteeUserId } });
    if (!invitee) {
      throw new NotFoundException('Invited user does not exist.');
    }

    const { workspace, ...membership } = await this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: inviteeUserId } },
      update: { role },
      create: { workspaceId, userId: inviteeUserId, role, joinedAt: new Date() },
      include: { workspace: { select: { name: true } } },
    });

    this.eventEmitter.emit(
      USER_INVITED_EVENT,
      new UserInvitedEvent(
        'workspace',
        workspaceId,
        workspace.name,
        inviteeUserId,
        invitedById,
        role,
      ),
    );

    return membership;
  }
}
