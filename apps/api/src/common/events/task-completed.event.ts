export const TASK_COMPLETED_EVENT = 'task.completed';

export class TaskCompletedEvent {
  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly projectId: string,
    public readonly reporterId: string,
    public readonly completedById: string,
  ) {}
}
