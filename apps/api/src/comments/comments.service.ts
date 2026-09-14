import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
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

  private async requireOwnComment(taskId: string, commentId: string, userId: string) {
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

  async findAll(userId: string, taskId: string) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
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
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
