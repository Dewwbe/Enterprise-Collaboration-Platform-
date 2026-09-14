import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ROLE_HIERARCHY, WorkspaceRole } from '../common/enums/workspace-role.enum';
import { COMMENT_ADDED_EVENT, CommentAddedEvent } from '../common/events';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Same join-through-project pattern as TasksService (task has no workspaceId of
  // its own) - see the note there on why this isn't using RolesGuard yet.
  private async requireTaskMembership(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: task.project.workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Task not found.');
    }
    return { task, membership };
  }

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
    const { task, membership } = await this.requireTaskMembership(taskId, userId);
    if (
      ROLE_HIERARCHY[membership.role as WorkspaceRole] <
      ROLE_HIERARCHY[WorkspaceRole.MEMBER]
    ) {
      throw new ForbiddenException('Your workspace role does not permit this action.');
    }

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
    await this.requireTaskMembership(taskId, userId);
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(userId: string, taskId: string, commentId: string, dto: UpdateCommentDto) {
    await this.requireTaskMembership(taskId, userId);
    await this.requireOwnComment(taskId, commentId, userId);
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body },
    });
  }

  async remove(userId: string, taskId: string, commentId: string) {
    await this.requireTaskMembership(taskId, userId);
    await this.requireOwnComment(taskId, commentId, userId);
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
