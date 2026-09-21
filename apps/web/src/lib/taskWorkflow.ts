import { TaskStatus } from '@ecp/shared-types';

// Mirrors apps/api's TASK_STATUS_TRANSITIONS (common/enums/task-status.enum.ts):
// a strictly linear workflow, one legal next status per status, no skipping.
export const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  [TaskStatus.TODO]: TaskStatus.IN_PROGRESS,
  [TaskStatus.IN_PROGRESS]: TaskStatus.REVIEW,
  [TaskStatus.REVIEW]: TaskStatus.DONE,
  [TaskStatus.DONE]: null,
};
