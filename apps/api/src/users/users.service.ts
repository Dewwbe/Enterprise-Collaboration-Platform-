import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { TaskStatus } from '../common/enums/task-status.enum';
import { dashboardCacheKey } from '../common/cache-keys';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  createdAt: true,
} as const;

// Short TTL, no explicit invalidation: there's no user-update endpoint yet,
// so profile data only ever changes via direct DB access, which a short
// expiry already covers safely.
const PROFILE_CACHE_TTL_SECONDS = 120;
const profileCacheKey = (id: string) => `user-profile:${id}`;

// Matches the workspace-stats cache TTL (WorkspacesService); invalidated from
// TasksService whenever a task assigned to this user changes.
const DASHBOARD_CACHE_TTL_SECONDS = 60;
const RECENT_TASKS_LIMIT = 5;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findById(id: string) {
    const cached = await this.cache.get(profileCacheKey(id));
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.cache.set(profileCacheKey(id), user, PROFILE_CACHE_TTL_SECONDS);
    return user;
  }

  /** Used when inviting collaborators by email instead of raw user id. */
  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('No user exists with that email.');
    }
    return user;
  }

  /**
   * Personal cross-workspace summary: how many workspaces/projects the caller
   * belongs to, their assigned-task workload by status, overdue tasks, and
   * their most recently updated tasks. Cache-aside like getStats
   * (WorkspacesService); TasksService invalidates it whenever a task assigned
   * to this user changes.
   */
  async getDashboard(userId: string) {
    const cached = await this.cache.get(dashboardCacheKey(userId));
    if (cached) {
      return cached;
    }

    const [
      workspaceCount,
      projectCount,
      taskCountsRaw,
      overdueTaskCount,
      recentTasks,
    ] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { userId } }),
      this.prisma.project.count({
        where: { workspace: { members: { some: { userId } } }, isArchived: false },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: userId },
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          assigneeId: userId,
          status: { not: TaskStatus.DONE },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.findMany({
        where: { OR: [{ assigneeId: userId }, { reporterId: userId }] },
        orderBy: { updatedAt: 'desc' },
        take: RECENT_TASKS_LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          projectId: true,
          updatedAt: true,
        },
      }),
    ]);

    const tasksByStatus: Record<TaskStatus, number> = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.REVIEW]: 0,
      [TaskStatus.DONE]: 0,
    };
    for (const row of taskCountsRaw) {
      tasksByStatus[row.status as TaskStatus] = row._count._all;
    }

    const dashboard = {
      workspaceCount,
      projectCount,
      tasksByStatus,
      overdueTaskCount,
      recentTasks,
    };
    await this.cache.set(dashboardCacheKey(userId), dashboard, DASHBOARD_CACHE_TTL_SECONDS);
    return dashboard;
  }
}
