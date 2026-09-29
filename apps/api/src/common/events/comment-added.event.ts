export const COMMENT_ADDED_EVENT = 'comment.added';

export class CommentAddedEvent {
  constructor(
    public readonly commentId: string,
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly authorId: string,
    /** Task assignee + reporter, minus the comment's own author. */
    public readonly recipientIds: string[],
  ) {}
}
