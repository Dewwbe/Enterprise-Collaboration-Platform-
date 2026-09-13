import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // Workspace membership/role is already enforced by RolesGuard before this runs
  // (see projects.controller.ts). This only guards against a :projectId that
  // exists but belongs to a different workspace than the :workspaceId in the route.
  private async findWithinWorkspace(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.workspaceId !== workspaceId) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  async create(workspaceId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: { name: dto.name, description: dto.description, workspaceId },
    });
  }

  async findAll(workspaceId: string, query: QueryProjectsDto) {
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

  async findOne(workspaceId: string, projectId: string) {
    return this.findWithinWorkspace(workspaceId, projectId);
  }

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
