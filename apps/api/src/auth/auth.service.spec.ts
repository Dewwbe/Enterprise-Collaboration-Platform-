import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
      create: jest.Mock<(...args: any[]) => Promise<any>>;
      update: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    refreshToken: {
      create: jest.Mock<(...args: any[]) => Promise<any>>;
      update: jest.Mock<(...args: any[]) => Promise<any>>;
      updateMany: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    passwordResetToken: {
      create: jest.Mock<(...args: any[]) => Promise<any>>;
      findUnique: jest.Mock<(...args: any[]) => Promise<any>>;
      update: jest.Mock<(...args: any[]) => Promise<any>>;
    };
    $transaction: jest.Mock<(...args: any[]) => Promise<any>>;
  };
  let emailService: { sendMail: jest.Mock<(...args: any[]) => Promise<any>> };

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
        update: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      refreshToken: {
        create: jest.fn<(...args: any[]) => Promise<any>>(),
        update: jest.fn<(...args: any[]) => Promise<any>>(),
        updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      passwordResetToken: {
        create: jest.fn<(...args: any[]) => Promise<any>>(),
        findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
        update: jest.fn<(...args: any[]) => Promise<any>>(),
      },
      $transaction: jest.fn<(...args: any[]) => Promise<any>>((ops: any[]) =>
        Promise.all(ops),
      ),
    };
    emailService = { sendMail: jest.fn<(...args: any[]) => Promise<any>>() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string | number> = {
                'jwt.accessSecret': 'access-secret',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'refresh-secret',
                'jwt.refreshExpiresIn': '7d',
                'passwordReset.tokenTtlMinutes': 30,
                'passwordReset.frontendUrl': 'http://localhost:5173',
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

  describe('requestPasswordReset', () => {
    it('silently no-ops for an unknown email instead of revealing that', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestPasswordReset('nobody@example.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('silently no-ops for an inactive account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await service.requestPasswordReset(mockUser.email);

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('creates a hashed token and emails a reset link for a known, active user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.requestPasswordReset(mockUser.email);

      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };
      expect(createArgs.data.userId).toBe(mockUser.id);
      expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);

      expect(emailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: mockUser.email }),
      );
      const sentHtml = emailService.sendMail.mock.calls[0][0].html as string;
      const rawTokenMatch = /token=([a-f0-9]+)/.exec(sentHtml);
      expect(rawTokenMatch).not.toBeNull();
      const rawToken = rawTokenMatch![1];
      expect(createHash('sha256').update(rawToken).digest('hex')).toBe(
        createArgs.data.tokenHash,
      );
    });
  });

  describe('resetPassword', () => {
    it('throws UnauthorizedException for an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'N3wStr0ngP@ss!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword('used-token', 'N3wStr0ngP@ss!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.resetPassword('expired-token', 'N3wStr0ngP@ss!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates the password, marks the token used, and revokes refresh tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword('good-token', 'N3wStr0ngP@ss!');

      expect(prisma.$transaction).toHaveBeenCalled();
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(3);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      const passwordArgs = prisma.user.update.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(passwordArgs.data.passwordHash).not.toBe('N3wStr0ngP@ss!');
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
