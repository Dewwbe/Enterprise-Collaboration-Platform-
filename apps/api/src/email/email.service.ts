import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Thin wrapper around Nodemailer. If SMTP_HOST isn't configured (e.g. local
 * dev/CI without real credentials), sendMail() logs a warning once and every
 * call after that silently no-ops - the rest of the app must keep working
 * without real email delivery until the user supplies SMTP credentials.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('smtp.from')!;
  }

  onModuleInit() {
    const host = this.configService.get<string>('smtp.host');
    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not set - EmailService will log and no-op instead of sending mail.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.configService.get<number>('smtp.port'),
      secure: this.configService.get<boolean>('smtp.secure'),
      auth: {
        user: this.configService.get<string>('smtp.user'),
        pass: this.configService.get<string>('smtp.password'),
      },
    });
  }

  async sendMail(input: SendMailInput): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(
        `SMTP not configured, skipping email to ${input.to}: ${input.subject}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
    } catch (error) {
      // Email delivery is best-effort - a broken SMTP config must never fail
      // the request/job that triggered it.
      this.logger.error(
        `Failed to send email to ${input.to}: ${(error as Error).message}`,
      );
    }
  }
}
