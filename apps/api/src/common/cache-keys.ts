// Shared so the workspace-stats cache-aside read (WorkspacesService) and its
// invalidation call sites (TasksService, ProjectsService) can never drift
// into using different key formats for the same cached value.
export const workspaceStatsCacheKey = (workspaceId: string) =>
  `workspace-stats:${workspaceId}`;
