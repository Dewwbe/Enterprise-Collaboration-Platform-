import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { USER_INVITED_EVENT, UserInvitedEvent } from '../common/events';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('An organization with this slug already exists.');
    }

    // Creator becomes OWNER in the same transaction so the org is never left
    // without an owner, even if a later step fails.
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        members: {
          create: { userId, role: WorkspaceRole.OWNER },
        },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    // Same "not found" response whether the org is missing or the caller
    // simply isn't a member - avoids leaking which organization IDs exist.
    if (!org || !org.members.some((m: { userId: string }) => m.userId === userId)) {
      throw new NotFoundException('Organization not found.');
    }
    return org;
  }

  async update(userId: string, id: string, dto: UpdateOrganizationDto) {
    await this.assertOrgRole(id, userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  async archive(userId: string, id: string) {
    await this.assertOrgRole(id, userId, [WorkspaceRole.OWNER]);
    return this.prisma.organization.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOrgRole(id, userId, [WorkspaceRole.OWNER]);
    await this.prisma.organization.delete({ where: { id } });
  }

  async inviteMember(
    userId: string,
    organizationId: string,
    inviteeUserId: string,
    role: WorkspaceRole,
  ) {
    await this.assertOrgRole(organizationId, userId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const invitee = await this.prisma.user.findUnique({ where: { id: inviteeUserId } });
    if (!invitee) {
      throw new NotFoundException('Invited user does not exist.');
    }

    const membership = await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: inviteeUserId } },
      update: { role },
      create: { organizationId, userId: inviteeUserId, role },
    });

    this.eventEmitter.emit(
      USER_INVITED_EVENT,
      new UserInvitedEvent(
        'organization',
        organizationId,
        // assertRole above already confirmed the caller's membership in this
        // organization, so the row is guaranteed to still exist here.
        organization!.name,
        inviteeUserId,
        userId,
        role,
      ),
    );

    return membership;
  }

  private async assertOrgRole(
    organizationId: string,
    userId: string,
    allowed: WorkspaceRole[],
  ): Promise<void> {
    const membership = await this.workspaceAccess.requireOrganizationMembership(
      organizationId,
      userId,
    );
    this.workspaceAccess.assertRoleIn(membership.role as WorkspaceRole, allowed);
  }
}
