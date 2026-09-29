import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { EmailService } from '../../email/email.service';
import { NotificationDeliveryJobData } from '../queue.constants';

describe('NotificationDeliveryProcessor', () => {
  let processor: NotificationDeliveryProcessor;
  let prisma: { user: { findUnique: jest.Mock } };
  let notificationsService: { create: jest.Mock };
  let gateway: { pushToUser: jest.Mock };
  let emailService: { sendMail: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    notificationsService = { create: jest.fn() };
    gateway = { pushToUser: jest.fn() };
    emailService = { sendMail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    processor = module.get(NotificationDeliveryProcessor);
  });

  const job = (data: NotificationDeliveryJobData) =>
    ({ data }) as Job<NotificationDeliveryJobData>;

  it('persists and pushes a notification, and emails for TASK_ASSIGNED', async () => {
    notificationsService.create.mockResolvedValue({ id: 'n-1' });
    prisma.user.findUnique.mockResolvedValue({ email: 'user@example.com' });

    await processor.process(
      job({
        userId: 'user-1',
        type: NotificationType.TASK_ASSIGNED,
        payload: { taskTitle: 'Ship it' },
      }),
    );

    expect(notificationsService.create).toHaveBeenCalledWith(
      'user-1',
      NotificationType.TASK_ASSIGNED,
      { taskTitle: 'Ship it' },
    );
    expect(gateway.pushToUser).toHaveBeenCalledWith('user-1', { id: 'n-1' });
    expect(emailService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });

  it('does not email for COMMENT_ADDED', async () => {
    notificationsService.create.mockResolvedValue({ id: 'n-1' });

    await processor.process(
      job({ userId: 'user-1', type: NotificationType.COMMENT_ADDED, payload: {} }),
    );

    expect(emailService.sendMail).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
