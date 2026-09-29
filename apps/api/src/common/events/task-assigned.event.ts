export const TASK_ASSIGNED_EVENT = 'task.assigned';

export class TaskAssignedEvent {
  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly projectId: string,
    public readonly assigneeId: string,
    public readonly assignedById: string,
  ) {}
}
