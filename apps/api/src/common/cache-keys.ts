// Shared so the workspace-stats cache-aside read (WorkspacesService) and its
// invalidation call sites (TasksService, ProjectsService) can never drift
// into using different key formats for the same cached value.
export const workspaceStatsCacheKey = (workspaceId: string) =>
  `workspace-stats:${workspaceId}`;

// Same cache-aside pattern for a user's personal dashboard (UsersService),
// invalidated from TasksService whenever a task assigned to that user changes.
export const dashboardCacheKey = (userId: string) => `dashboard:${userId}`;
