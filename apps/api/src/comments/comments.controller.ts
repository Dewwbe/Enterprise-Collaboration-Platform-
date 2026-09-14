import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditLog } from '../common/decorators/audit-log.decorator';

@ApiTags('comments')
@ApiBearerAuth()
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @AuditLog('comment.create', 'Comment')
  @ApiOperation({ summary: 'Add a comment to a task (MEMBER or above)' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(userId, taskId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List comments on a task' })
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.commentsService.findAll(userId, taskId);
  }

  @Patch(':commentId')
  @AuditLog('comment.update', 'Comment', 'commentId')
  @ApiOperation({ summary: 'Edit your own comment' })
  update(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(userId, taskId, commentId, dto);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('comment.delete', 'Comment', 'commentId')
  @ApiOperation({ summary: 'Delete your own comment' })
  remove(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.commentsService.remove(userId, taskId, commentId);
  }
}
