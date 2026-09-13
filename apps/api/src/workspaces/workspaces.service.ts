import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const orgMembership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: dto.organizationId, userId } },
    });
    if (!orgMembership) {
      throw new ForbiddenException('You do not belong to this organization.');
    }
    if (
      ![WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(
        orgMembership.role as WorkspaceRole,
      )
    ) {
      throw new ForbiddenException(
        'Only organization owners/admins can create workspaces.',
      );
    }

    const existing = await this.prisma.workspace.findUnique({
      where: {
        organizationId_slug: { organizationId: dto.organizationId, slug: dto.slug },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A workspace with this slug already exists in the organization.',
      );
    }

    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        organizationId: dto.organizationId,
        members: {
          create: { userId, role: WorkspaceRole.OWNER, joinedAt: new Date() },
        },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Called after RolesGuard has already verified the caller's membership, so
  // this only needs to check the workspace itself still exists.
  async findOne(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }
    return workspace;
  }

  // Called after RolesGuard has already verified the caller's minimum role,
  // so this only needs to perform the write.
  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: dto });
  }

  async archive(workspaceId: string) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { isArchived: true },
    });
  }

  async remove(workspaceId: string) {
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  async inviteMember(workspaceId: string, inviteeUserId: string, role: WorkspaceRole) {
    const invitee = await this.prisma.user.findUnique({ where: { id: inviteeUserId } });
    if (!invitee) {
      throw new NotFoundException('Invited user does not exist.');
    }

    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: inviteeUserId } },
      update: { role },
      create: { workspaceId, userId: inviteeUserId, role, joinedAt: new Date() },
    });
  }
}
