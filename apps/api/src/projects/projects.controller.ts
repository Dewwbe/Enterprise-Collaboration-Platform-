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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.MEMBER)
  @ApiOperation({ summary: 'Create a project in a workspace (MEMBER or above)' })
  create(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(userId, workspaceId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects in a workspace' })
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: QueryProjectsDto,
  ) {
    return this.projectsService.findAll(userId, workspaceId, query);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project by id' })
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectsService.findOne(userId, workspaceId, projectId);
  }

  @Patch(':projectId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update project details (ADMIN or OWNER only)' })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(workspaceId, projectId, dto);
  }

  @Post(':projectId/archive')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Archive a project (ADMIN or OWNER only)' })
  archive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectsService.archive(workspaceId, projectId);
  }

  @Post(':projectId/restore')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Restore an archived project (ADMIN or OWNER only)' })
  restore(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectsService.restore(workspaceId, projectId);
  }

  @Delete(':projectId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a project (OWNER only)' })
  remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.projectsService.remove(workspaceId, projectId);
  }
}
