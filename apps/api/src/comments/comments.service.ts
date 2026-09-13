import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Workspace membership/role is already enforced by RolesGuard before this runs
  // (see comments.controller.ts). This only enforces the "own comments only"
  // rule, which is per-resource and not something a role check can express.
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
    return this.prisma.comment.create({
      data: { taskId, authorId: userId, body: dto.body },
    });
  }

  async findAll(taskId: string) {
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(userId: string, taskId: string, commentId: string, dto: UpdateCommentDto) {
    await this.requireOwnComment(taskId, commentId, userId);
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body },
    });
  }

  async remove(userId: string, taskId: string, commentId: string) {
    await this.requireOwnComment(taskId, commentId, userId);
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
