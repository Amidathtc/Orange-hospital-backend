import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface MonnifyInitResult {
  checkoutUrl: string;
  transactionReference: string;
  paymentReference: string;
}

@Injectable()
export class MonnifyService {
  private readonly logger = new Logger(MonnifyService.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly contractCode: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('MONNIFY_API_KEY') ?? '';
    this.secretKey = this.config.get<string>('MONNIFY_SECRET_KEY') ?? '';
    this.contractCode = this.config.get<string>('MONNIFY_CONTRACT_CODE') ?? '';
    this.baseUrl =
      this.config.get<string>('MONNIFY_BASE_URL') ?? 'https://api.monnify.com';
  }

  private async getAccessToken(): Promise<string> {
    const authHeader = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');

    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    if (!res.ok || !data.requestSuccessful) {
      throw new InternalServerErrorException(
        `Monnify login failed: ${data.responseMessage ?? 'Authentication failed'}`,
      );
    }

    return data.responseBody.accessToken;
  }

  async initializeTransaction(
    customerName: string,
    customerEmail: string,
    amountKobo: number,
    reference: string,
    callbackUrl: string,
  ): Promise<MonnifyInitResult> {
    const token = await this.getAccessToken();
    const amountNaira = amountKobo / 100;

    const res = await fetch(`${this.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountNaira,
        customerName,
        customerEmail,
        paymentReference: reference,
        paymentDescription: 'Orange Health Ajo Contribution',
        currencyCode: 'NGN',
        contractCode: this.contractCode,
        redirectUrl: callbackUrl,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.requestSuccessful) {
      throw new InternalServerErrorException(
        `Monnify initialization failed: ${data.responseMessage ?? 'unknown error'}`,
      );
    }

    return {
      checkoutUrl: data.responseBody.checkoutUrl,
      transactionReference: data.responseBody.transactionReference,
      paymentReference: data.responseBody.paymentReference,
    };
  }

  // Monnify webhook hash verification:
  // SHA512(secretKey + "|" + paymentReference + "|" + amountPaid + "|" + paidOn + "|" + transactionReference)
  verifyWebhookHash(
    paymentReference: string,
    amountPaid: number | string,
    paidOn: string,
    transactionReference: string,
    receivedHash: string,
  ): boolean {
    if (!receivedHash || !this.secretKey) return false;

    const computedHash = crypto
      .createHash('sha512')
      .update(`${this.secretKey}|${paymentReference}|${amountPaid}|${paidOn}|${transactionReference}`)
      .digest('hex');

    return computedHash.toLowerCase() === receivedHash.toLowerCase();
  }
}
