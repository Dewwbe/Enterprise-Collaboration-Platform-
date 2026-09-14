import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType } from '@prisma/client';
import { NotificationEventsListener } from './notification-events.listener';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queue.constants';
import {
  TaskAssignedEvent,
  TaskCompletedEvent,
  CommentAddedEvent,
  UserInvitedEvent,
} from '../../common/events';

describe('NotificationEventsListener', () => {
  let listener: NotificationEventsListener;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsListener,
        { provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE), useValue: queue },
      ],
    }).compile();

    listener = module.get<NotificationEventsListener>(NotificationEventsListener);
  });

  it('enqueues a TASK_ASSIGNED job for the assignee', async () => {
    await listener.onTaskAssigned(
      new TaskAssignedEvent('task-1', 'Task', 'proj-1', 'assignee-1', 'assigner-1'),
    );

    expect(queue.add).toHaveBeenCalledWith('deliver', {
      userId: 'assignee-1',
      type: NotificationType.TASK_ASSIGNED,
      payload: expect.objectContaining({ taskId: 'task-1' }),
    });
  });

  it('enqueues a TASK_COMPLETED job for the reporter', async () => {
    await listener.onTaskCompleted(
      new TaskCompletedEvent('task-1', 'Task', 'proj-1', 'reporter-1', 'completer-1'),
    );

    expect(queue.add).toHaveBeenCalledWith('deliver', {
      userId: 'reporter-1',
      type: NotificationType.TASK_COMPLETED,
      payload: expect.objectContaining({ taskId: 'task-1' }),
    });
  });

  it('enqueues one COMMENT_ADDED job per recipient', async () => {
    await listener.onCommentAdded(
      new CommentAddedEvent('c-1', 'task-1', 'Task', 'author-1', ['user-2', 'user-3']),
    );

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ userId: 'user-2', type: NotificationType.COMMENT_ADDED }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ userId: 'user-3', type: NotificationType.COMMENT_ADDED }),
    );
  });

  it('enqueues a USER_INVITED job for the invitee', async () => {
    await listener.onUserInvited(
      new UserInvitedEvent(
        'workspace',
        'ws-1',
        'Product Eng',
        'invitee-1',
        'inviter-1',
        'MEMBER',
      ),
    );

    expect(queue.add).toHaveBeenCalledWith('deliver', {
      userId: 'invitee-1',
      type: NotificationType.USER_INVITED,
      payload: expect.objectContaining({ scope: 'workspace', scopeId: 'ws-1' }),
    });
  });
});
