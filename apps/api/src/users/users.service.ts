import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  createdAt: true,
} as const;

// Short TTL, no explicit invalidation: there's no user-update endpoint yet,
// so profile data only ever changes via direct DB access, which a short
// expiry already covers safely.
const PROFILE_CACHE_TTL_SECONDS = 120;
const profileCacheKey = (id: string) => `user-profile:${id}`;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findById(id: string) {
    const cached = await this.cache.get(profileCacheKey(id));
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.cache.set(profileCacheKey(id), user, PROFILE_CACHE_TTL_SECONDS);
    return user;
  }

  /** Used when inviting collaborators by email instead of raw user id. */
  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('No user exists with that email.');
    }
    return user;
  }
}
