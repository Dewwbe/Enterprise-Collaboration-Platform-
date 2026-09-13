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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @Roles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Add a comment to a task (MEMBER or above)' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(userId, taskId, dto);
  }

  @Get()
  @Roles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'List comments on a task' })
  findAll(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.commentsService.findAll(taskId);
  }

  @Patch(':commentId')
  @Roles(WorkspaceRole.MEMBER)
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
  @Roles(WorkspaceRole.MEMBER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your own comment' })
  remove(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.commentsService.remove(userId, taskId, commentId);
  }
}
