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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditLog } from '../common/decorators/audit-log.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization (caller becomes OWNER)' })
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations the caller belongs to' })
  findAll(@CurrentUser('userId') userId: string) {
    return this.organizationsService.findAllForUser(userId);
  }

  @Get(':organizationId')
  @ApiOperation({ summary: 'Get an organization by id' })
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) id: string,
  ) {
    return this.organizationsService.findOne(userId, id);
  }

  @Patch(':organizationId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @AuditLog('organization.update', 'Organization', 'organizationId')
  @ApiOperation({ summary: 'Update organization details (OWNER/ADMIN only)' })
  update(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(userId, id, dto);
  }

  @Post(':organizationId/archive')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @AuditLog('organization.archive', 'Organization', 'organizationId')
  @ApiOperation({ summary: 'Archive an organization (OWNER only)' })
  archive(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) id: string,
  ) {
    return this.organizationsService.archive(userId, id);
  }

  @Delete(':organizationId')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('organization.delete', 'Organization', 'organizationId')
  @ApiOperation({ summary: 'Permanently delete an organization (OWNER only)' })
  remove(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) id: string,
  ) {
    return this.organizationsService.remove(userId, id);
  }

  @Post(':organizationId/members')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.ADMIN)
  @AuditLog('organization.inviteMember', 'OrganizationMember')
  @ApiOperation({ summary: 'Invite or update a member of the organization' })
  inviteMember(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizationsService.inviteMember(userId, id, dto.userId, dto.role);
  }
}
