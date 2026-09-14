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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditLog } from '../common/decorators/audit-log.decorator';

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

  @Get(':id')
  @ApiOperation({ summary: 'Get an organization by id' })
  findOne(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.findOne(userId, id);
  }

  @Patch(':id')
  @AuditLog('organization.update', 'Organization', 'id')
  @ApiOperation({ summary: 'Update organization details (OWNER/ADMIN only)' })
  update(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(userId, id, dto);
  }

  @Post(':id/archive')
  @AuditLog('organization.archive', 'Organization', 'id')
  @ApiOperation({ summary: 'Archive an organization (OWNER only)' })
  archive(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.archive(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('organization.delete', 'Organization', 'id')
  @ApiOperation({ summary: 'Permanently delete an organization (OWNER only)' })
  remove(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.remove(userId, id);
  }

  @Post(':id/members')
  @AuditLog('organization.inviteMember', 'OrganizationMember')
  @ApiOperation({ summary: 'Invite or update a member of the organization' })
  inviteMember(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizationsService.inviteMember(userId, id, dto.userId, dto.role);
  }
}
