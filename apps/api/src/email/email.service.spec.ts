import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const buildService = async (config: Record<string, unknown>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  it('no-ops sendMail when SMTP_HOST is not configured', async () => {
    const service = await buildService({ 'smtp.host': '', 'smtp.from': 'a@b.com' });
    service.onModuleInit();

    await expect(
      service.sendMail({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' }),
    ).resolves.toBeUndefined();
  });
});
