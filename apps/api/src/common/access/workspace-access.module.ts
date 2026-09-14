import { Global, Module } from '@nestjs/common';
import { WorkspaceAccessService } from './workspace-access.service';

// Global like PrismaModule/RedisModule: every feature module needs membership
// resolution, so requiring each one to import this explicitly would just be
// boilerplate without adding any real encapsulation.
@Global()
@Module({
  providers: [WorkspaceAccessService],
  exports: [WorkspaceAccessService],
})
export class WorkspaceAccessModule {}
