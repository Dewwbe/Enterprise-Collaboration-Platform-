import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
      create: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    refreshToken: {
      create: jest.Mock<(...args: any[]) => Promise<any>>;
      update: jest.Mock<(...args: any[]) => Promise<any>>;
      updateMany: jest.Mock<(...args: any[]) => Promise<any>>;
    };
  };

  const mockUser = {
    id: 'user-1',
    email: 'dewmini@example.com',
    passwordHash: '',
    firstName: 'Dewmini',
    lastName: 'Chamodya',
    isActive: true,
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('Str0ngP@ssword!', 12);

    prisma = {
      user: {
        findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
        create: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      refreshToken: {
        create: jest.fn<(...args: any[]) => Promise<any>>(),
        update: jest.fn<(...args: any[]) => Promise<any>>(),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                'jwt.accessSecret': 'access-secret',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'refresh-secret',
                'jwt.refreshExpiresIn': '7d',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: mockUser.email,
          password: 'Str0ngP@ssword!',
          firstName: 'Dewmini',
          lastName: 'Chamodya',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a user with a bcrypt-hashed password and issues tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: mockUser.email,
        password: 'Str0ngP@ssword!',
        firstName: 'Dewmini',
        lastName: 'Chamodya',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      const createArgs = prisma.user.create.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(createArgs.data.passwordHash).not.toBe('Str0ngP@ssword!');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe(mockUser.email);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for a non-existent user without revealing that', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: mockUser.email, password: 'WrongPassword1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues an access/refresh token pair on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: mockUser.email,
        password: 'Str0ngP@ssword!',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes only the presented, still-active refresh token', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('token-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'token-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});