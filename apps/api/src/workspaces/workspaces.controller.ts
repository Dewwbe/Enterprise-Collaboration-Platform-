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

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(RolesGuard)
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
  @Roles(WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'Get a workspace by id' })
  findOne(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspacesService.findOne(workspaceId);
  }

  @Patch(':workspaceId')
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update workspace details (ADMIN or OWNER only)' })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(workspaceId, dto);
  }

  @Post(':workspaceId/archive')
  @Roles(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Archive a workspace (OWNER only)' })
  archive(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspacesService.archive(workspaceId);
  }

  @Delete(':workspaceId')
  @Roles(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a workspace (OWNER only)' })
  remove(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspacesService.remove(workspaceId);
  }

  @Post(':workspaceId/members')
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Invite or update a workspace member (ADMIN or OWNER only)' })
  inviteMember(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: InviteWorkspaceMemberDto,
  ) {
    return this.workspacesService.inviteMember(workspaceId, dto.userId, dto.role);
  }
}
