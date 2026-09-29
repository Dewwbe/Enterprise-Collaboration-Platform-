import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { WorkspaceScopeResolver } from '../common/services/workspace-scope-resolver.service';

// WorkspaceScopeResolver lives alongside PrismaService here (rather than its own
// module) so it's globally injectable into RolesGuard from any feature module's
// context, the same way PrismaService already is - see roles.guard.ts.
@Global()
@Module({
  providers: [PrismaService, WorkspaceScopeResolver],
  exports: [PrismaService, WorkspaceScopeResolver],
})
export class PrismaModule {}
