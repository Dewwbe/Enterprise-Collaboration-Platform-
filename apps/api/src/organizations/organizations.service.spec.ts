import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';
import { USER_INVITED_EVENT } from '../common/events';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    organizationMember: { findUnique: jest.Mock; upsert: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      organizationMember: { findUnique: jest.fn(), upsert: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        WorkspaceAccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    it('rejects a duplicate slug', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

      await expect(
        service.create('user-1', { name: 'EFutures', slug: 'efutures' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the org with the caller as OWNER', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1' });

      await service.create('user-1', { name: 'EFutures', slug: 'efutures' });

      const createArgs = prisma.organization.create.mock.calls[0][0];
      expect(createArgs.data.members.create).toEqual({
        userId: 'user-1',
        role: WorkspaceRole.OWNER,
      });
    });
  });

  describe('update', () => {
    it('denies a MEMBER from updating organization details', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      });

      await expect(
        service.update('user-1', 'org-1', { name: 'New name' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an ADMIN to update organization details', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.ADMIN,
      });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'New name' });

      const result = await service.update('user-1', 'org-1', { name: 'New name' });

      expect(result.name).toBe('New name');
    });

    it('throws NotFoundException when the caller has no membership', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'org-1', { name: 'New name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('inviteMember', () => {
    it('emits UserInvitedEvent scoped to the organization', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });
      prisma.organization.findUnique.mockResolvedValue({ name: 'EFutures' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      prisma.organizationMember.upsert.mockResolvedValue({
        id: 'mem-1',
        role: WorkspaceRole.MEMBER,
      });

      await service.inviteMember('user-1', 'org-1', 'user-2', WorkspaceRole.MEMBER);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        USER_INVITED_EVENT,
        expect.objectContaining({
          scope: 'organization',
          scopeId: 'org-1',
          invitedUserId: 'user-2',
          invitedById: 'user-1',
        }),
      );
    });

    it('throws NotFoundException when the invitee does not exist', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });
      prisma.organization.findUnique.mockResolvedValue({ name: 'EFutures' });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteMember('user-1', 'org-1', 'user-2', WorkspaceRole.MEMBER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('only allows an OWNER to delete the organization', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.ADMIN,
      });

      await expect(service.remove('user-1', 'org-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
