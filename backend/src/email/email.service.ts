import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly apiKey: string = '';
  private readonly from: string = '';

  constructor(private config: ConfigService) {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.from = this.config.get<string>('EMAIL_FROM') ?? `Orange Health Ajo <${smtpUser}>`;
    } else {
      this.apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
      this.from = this.config.get<string>('EMAIL_FROM') ?? 'onboarding@resend.dev';
    }
  }

  private async send(to: string, subject: string, html: string) {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          html,
        });
        return;
      } catch (err: any) {
        this.logger.error(`SMTP Send error to ${to}: ${err.message}`);
        throw new BadRequestException(`Failed to send email via SMTP: ${err.message}`);
      }
    }

    if (!this.apiKey) {
      this.logger.error(`Cannot send email to ${to}: Neither SMTP_USER/SMTP_PASS nor RESEND_API_KEY is configured.`);
      throw new BadRequestException('Email service is not configured. Add SMTP_USER/SMTP_PASS in backend environment.');
    }

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
      this.logger.error(`Failed to send email to ${to}: ${res.status} ${body}`);
      throw new BadRequestException(`Failed to send email (${res.status}): ${body}`);
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

