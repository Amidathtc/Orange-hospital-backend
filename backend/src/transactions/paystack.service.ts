import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

@Injectable()
export class PaystackService {
  private readonly secretKey: string;

  constructor(private config: ConfigService) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  // amountKobo: Paystack takes amounts in kobo already, matching how we store balances.
  async initializeTransaction(
    email: string,
    amountKobo: number,
    reference: string,
    callbackUrl: string,
  ): Promise<InitializeResult> {
    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        callback_url: callbackUrl,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.status) {
      throw new InternalServerErrorException(
        `Paystack initialization failed: ${data.message ?? 'unknown error'}`,
      );
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  // Paystack signs webhook payloads with HMAC SHA512 of the RAW request body,
  // using your secret key. Must compare against the raw bytes, not the parsed JSON,
  // or valid webhooks will fail verification.
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;

    const expected = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    return expected === signatureHeader;
  }
}
