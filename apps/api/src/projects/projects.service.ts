import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // Membership (not just a valid workspace id) gates every route here, including
  // reads - this is what keeps one workspace's projects invisible to another's
  // members (requirement doc Section 15, workspace data leakage).
  private async requireMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Workspace not found.');
    }
    return membership;
  }

  private async findWithinWorkspace(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.workspaceId !== workspaceId) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  async create(userId: string, workspaceId: string, dto: CreateProjectDto) {
    await this.requireMembership(workspaceId, userId);
    return this.prisma.project.create({
      data: { name: dto.name, description: dto.description, workspaceId },
    });
  }

  async findAll(userId: string, workspaceId: string, query: QueryProjectsDto) {
    await this.requireMembership(workspaceId, userId);
    return this.prisma.project.findMany({
      where: {
        workspaceId,
        ...(query.includeArchived ? {} : { isArchived: false }),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, workspaceId: string, projectId: string) {
    await this.requireMembership(workspaceId, userId);
    return this.findWithinWorkspace(workspaceId, projectId);
  }

  // Called after RolesGuard has already verified the caller's minimum role,
  // so this only needs to perform the write.
  async update(workspaceId: string, projectId: string, dto: UpdateProjectDto) {
    await this.findWithinWorkspace(workspaceId, projectId);
    return this.prisma.project.update({ where: { id: projectId }, data: dto });
  }

  async archive(workspaceId: string, projectId: string) {
    await this.findWithinWorkspace(workspaceId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true },
    });
  }

  async restore(workspaceId: string, projectId: string) {
    await this.findWithinWorkspace(workspaceId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { isArchived: false },
    });
  }

  async remove(workspaceId: string, projectId: string) {
    await this.findWithinWorkspace(workspaceId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }
}
