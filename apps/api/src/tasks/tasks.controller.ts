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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditLog } from '../common/decorators/audit-log.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.MEMBER)
  @AuditLog('task.create', 'Task')
  @ApiOperation({ summary: 'Create a task in a project (MEMBER or above)' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(userId, projectId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List tasks in a project',
    description: 'Supports ?status=&priority=&assigneeId=&sort=&page=&limit=',
  })
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.findAll(userId, projectId, query);
  }

  @Get(':taskId')
  @ApiOperation({ summary: 'Get a task by id' })
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.findOne(userId, projectId, taskId);
  }

  @Patch(':taskId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.MEMBER)
  @AuditLog('task.update', 'Task', 'taskId')
  @ApiOperation({
    summary: 'Update a task (MEMBER or above)',
    description:
      'Status changes must follow TODO -> IN_PROGRESS -> REVIEW -> DONE; illegal transitions are rejected.',
  })
  update(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(userId, projectId, taskId, dto);
  }

  @Delete(':taskId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('task.delete', 'Task', 'taskId')
  @ApiOperation({
    summary: 'Delete a task (ADMIN or OWNER only)',
    description:
      'Soft delete - the task is hidden but recoverable via POST /:taskId/restore.',
  })
  remove(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.remove(userId, projectId, taskId);
  }

  @Post(':taskId/restore')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @AuditLog('task.restore', 'Task', 'taskId')
  @ApiOperation({ summary: 'Restore a soft-deleted task (ADMIN or OWNER only)' })
  restore(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.restore(userId, projectId, taskId);
  }
}
