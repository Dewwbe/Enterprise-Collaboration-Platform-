import { Test, TestingModule } from '@nestjs/testing';
import { CleanupExpiredTokensProcessor } from './cleanup-expired-tokens.processor';
import { PrismaService } from '../../prisma/prisma.service';

describe('CleanupExpiredTokensProcessor', () => {
  let processor: CleanupExpiredTokensProcessor;
  let prisma: { refreshToken: { deleteMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { refreshToken: { deleteMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupExpiredTokensProcessor,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    processor = module.get(CleanupExpiredTokensProcessor);
  });

  it('deletes tokens that are expired or long-revoked', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    await processor.process();

    const where = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ expiresAt: { lt: expect.any(Date) } });
    expect(where.OR[1]).toEqual({ revokedAt: { lt: expect.any(Date) } });
  });
});
