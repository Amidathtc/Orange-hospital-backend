import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    // Resend's shared test address works with zero setup, before you own a
    // verified domain — swap this for "Orange Health Ajo <no-reply@yourdomain.com>"
    // once the real domain is live.
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
  }

  private async send(to: string, subject: string, html: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Deliberately doesn't throw — a flaky email provider shouldn't be able
      // to break signup or password reset outright. It's logged so it's
      // visible, not silently swallowed.
      this.logger.error(`Failed to send email to ${to}: ${res.status} ${body}`);
    }
  }

  async sendVerificationEmail(to: string, fullName: string, link: string) {
    await this.send(
      to,
      'Verify your email — Orange Health Ajo',
      `<p>Hi ${fullName},</p>
       <p>Confirm your email to finish setting up your Orange Health Ajo account:</p>
       <p><a href="${link}">${link}</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, fullName: string, link: string) {
    await this.send(
      to,
      'Reset your password — Orange Health Ajo',
      `<p>Hi ${fullName},</p>
       <p>Someone requested a password reset for this account. If that was you, set a new password here:</p>
       <p><a href="${link}">${link}</a></p>
       <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
    );
  }
}
