import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { QueryCommentsDto } from './dto/query-comments.dto';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { COMMENT_ADDED_EVENT, CommentAddedEvent } from '../common/events';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  // Workspace membership/role is already enforced by RolesGuard before this runs
  // (see comments.controller.ts). This only enforces the "own comments only"
  // rule, which is per-resource and not something a role check can express.
  private async requireOwnComment(taskId: string, commentId: string, userId: string) {
  private async requireOwnComment(taskId: string, commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId || comment.deletedAt) {
      throw new NotFoundException('Comment not found.');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only modify your own comments.');
    }
    return comment;
  }

  // Restore needs to find a comment requireOwnComment would now 404 on (it's
  // soft-deleted), so it looks the row up directly instead.
  private async requireOwnDeletedComment(
    taskId: string,
    commentId: string,
    userId: string,
  ) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundException('Comment not found.');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only modify your own comments.');
    }
    return comment;
  }

  async create(userId: string, taskId: string, dto: CreateCommentDto) {
    return this.prisma.comment.create({
    const { task, membership } = await this.workspaceAccess.requireTaskMembership(
      taskId,
      userId,
    );
    this.workspaceAccess.assertMinRole(
      membership.role as WorkspaceRole,
      WorkspaceRole.MEMBER,
    );

    const comment = await this.prisma.comment.create({
      data: { taskId, authorId: userId, body: dto.body },
    });

    const recipientIds = [...new Set([task.assigneeId, task.reporterId])].filter(
      (id): id is string => !!id && id !== userId,
    );
    if (recipientIds.length > 0) {
      this.eventEmitter.emit(
        COMMENT_ADDED_EVENT,
        new CommentAddedEvent(comment.id, taskId, task.title, userId, recipientIds),
      );
    }

    return comment;
  }

  async findAll(taskId: string) {
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(userId: string, taskId: string, commentId: string, dto: UpdateCommentDto) {
  async findAll(userId: string, taskId: string, query: QueryCommentsDto) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { taskId, deletedAt: null };

    const [items, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async update(userId: string, taskId: string, commentId: string, dto: UpdateCommentDto) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    await this.requireOwnComment(taskId, commentId, userId);
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body },
    });
  }

  async remove(userId: string, taskId: string, commentId: string) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    await this.requireOwnComment(taskId, commentId, userId);
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  async restore(userId: string, taskId: string, commentId: string) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    await this.requireOwnDeletedComment(taskId, commentId, userId);
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: null },
    });
  }
}
