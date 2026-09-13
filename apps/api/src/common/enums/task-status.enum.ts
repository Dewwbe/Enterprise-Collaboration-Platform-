// Mirrors the Prisma TaskStatus enum (kept as a plain TS enum for the same reason
// as WorkspaceRole - see workspace-role.enum.ts).
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

// Linear workflow per requirement doc Section 4 (Todo -> In Progress -> Review -> Done).
// Each status maps to the single status it may move forward to; anything else
// (skipping a step, moving backward, or a no-op) is rejected in the service layer.
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus | null> = {
  [TaskStatus.TODO]: TaskStatus.IN_PROGRESS,
  [TaskStatus.IN_PROGRESS]: TaskStatus.REVIEW,
  [TaskStatus.REVIEW]: TaskStatus.DONE,
  [TaskStatus.DONE]: null,
};
