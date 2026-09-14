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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteWorkspaceMemberDto } from './dto/invite-workspace-member.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { AuditLog } from '../common/decorators/audit-log.decorator';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a workspace inside an organization' })
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the caller belongs to' })
  findAll(@CurrentUser('userId') userId: string) {
    return this.workspacesService.findAllForUser(userId);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get a workspace by id' })
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspacesService.findOne(userId, workspaceId);
  }

  @Get(':workspaceId/stats')
  @ApiOperation({
    summary: 'Get workspace statistics (member/project counts, tasks by status)',
    description:
      'Cached for 60s; invalidated on project archive/restore/create/delete and task create/delete/status-change within this workspace.',
  })
  getStats(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspacesService.getStats(userId, workspaceId);
  }

  @Patch(':workspaceId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @AuditLog('workspace.update', 'Workspace', 'workspaceId')
  @ApiOperation({ summary: 'Update workspace details (ADMIN or OWNER only)' })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(workspaceId, dto);
  }

  @Post(':workspaceId/archive')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @AuditLog('workspace.archive', 'Workspace', 'workspaceId')
  @ApiOperation({ summary: 'Archive a workspace (OWNER only)' })
  archive(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspacesService.archive(workspaceId);
  }

  @Delete(':workspaceId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('workspace.delete', 'Workspace', 'workspaceId')
  @ApiOperation({ summary: 'Permanently delete a workspace (OWNER only)' })
  remove(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspacesService.remove(workspaceId);
  }

  @Post(':workspaceId/members')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @AuditLog('workspace.inviteMember', 'WorkspaceMember')
  @ApiOperation({ summary: 'Invite or update a workspace member (ADMIN or OWNER only)' })
  inviteMember(
    @CurrentUser('userId') userId: string,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: InviteWorkspaceMemberDto,
  ) {
    return this.workspacesService.inviteMember(workspaceId, userId, dto.userId, dto.role);
  }
}
