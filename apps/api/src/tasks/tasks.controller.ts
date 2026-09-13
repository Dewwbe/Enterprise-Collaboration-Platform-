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
import { WorkspaceScope } from '../common/decorators/workspace-scope.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Create a task in a project (MEMBER or above)' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @WorkspaceScope('workspaceId') workspaceId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(userId, projectId, workspaceId, dto);
  }

  @Get()
  @Roles(WorkspaceRole.VIEWER)
  @ApiOperation({
    summary: 'List tasks in a project',
    description: 'Supports ?status=&priority=&assigneeId=&sort=&page=&limit=',
  })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.findAll(projectId, query);
  }

  @Get(':taskId')
  @Roles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Get a task by id' })
  findOne(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.findOne(taskId);
  }

  @Patch(':taskId')
  @Roles(WorkspaceRole.MEMBER)
  @ApiOperation({
    summary: 'Update a task (MEMBER or above)',
    description:
      'Status changes must follow TODO -> IN_PROGRESS -> REVIEW -> DONE; illegal transitions are rejected.',
  })
  update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @WorkspaceScope('workspaceId') workspaceId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, workspaceId, dto);
  }

  @Delete(':taskId')
  @Roles(WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task (ADMIN or OWNER only)' })
  remove(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasksService.remove(taskId);
  }
}
