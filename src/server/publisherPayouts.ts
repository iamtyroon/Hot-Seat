import crypto from 'node:crypto';

export class PayPalPayoutError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function publisherPayoutWebhookStatus(eventType: string) {
  const statuses: Record<string, string> = {
    'PAYMENT.PAYOUTSBATCH.DENIED': 'failed',
    'PAYMENT.PAYOUTSBATCH.PROCESSING': 'pending',
    'PAYMENT.PAYOUTSBATCH.SUCCESS': 'pending',
    'PAYMENT.PAYOUTS-ITEM.BLOCKED': 'blocked',
    'PAYMENT.PAYOUTS-ITEM.CANCELED': 'returned',
    'PAYMENT.PAYOUTS-ITEM.FAILED': 'failed',
    'PAYMENT.PAYOUTS-ITEM.HELD': 'pending',
    'PAYMENT.PAYOUTS-ITEM.REFUNDED': 'returned',
    'PAYMENT.PAYOUTS-ITEM.RETURNED': 'returned',
    'PAYMENT.PAYOUTS-ITEM.SUCCEEDED': 'paid',
    'PAYMENT.PAYOUTS-ITEM.UNCLAIMED': 'unclaimed',
  };
  return statuses[eventType] || null;
}

export function publisherPiiKey(value = process.env.PUBLISHER_PII_ENCRYPTION_KEY) {
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptPublisherText(value: string, key = publisherPiiKey()) {
  if (!key) throw new Error('Publisher PII encryption is not configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function encryptPublisherEmail(email: string, key = publisherPiiKey()) {
  return encryptPublisherText(email, key);
}

export function decryptPublisherEmail(value: string, key = publisherPiiKey()) {
  if (!key) throw new Error('Publisher payout email encryption is not configured.');
  const [version, ivText, tagText, ciphertextText, ...extra] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra.length) throw new Error('Publisher payout recipient record is invalid.');
  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Publisher payout recipient record is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}

export async function createPayPalPublisherPayoutBatch(input: {
  clientId: string;
  clientSecret: string;
  environment: string;
  senderBatchId: string;
  items: Array<{ recipientEmail: string; amountCents: number; senderItemId: string }>;
}, fetcher: typeof fetch = fetch) {
  if (!input.clientId || !input.clientSecret) throw new Error('PayPal payout credentials are not configured.');
  if (!input.senderBatchId || input.senderBatchId.length > 256 || input.items.length < 1 || input.items.length > 50 ||
    input.items.some((item) => !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !item.senderItemId || item.senderItemId.length > 63)) {
    throw new Error('PayPal payout idempotency identifiers are invalid.');
  }
  const baseUrl = input.environment.toUpperCase() === 'SANDBOX'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  const tokenResponse = await fetcher(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenResponse.ok) throw new PayPalPayoutError('PayPal payout authorization failed.', tokenResponse.status);
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) throw new Error('PayPal payout authorization returned no access token.');

  const response = await fetcher(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': input.senderBatchId,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: 'Your Hot Seat publisher payout',
        email_message: 'Your monthly Hot Seat publisher revenue share is being sent in USD.',
      },
      items: input.items.map((item) => ({
        recipient_type: 'EMAIL',
        amount: { value: (item.amountCents / 100).toFixed(2), currency: 'USD' },
        receiver: item.recipientEmail,
        note: 'Hot Seat monthly publisher revenue share',
        sender_item_id: item.senderItemId,
      })),
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => ({})) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
  if (!response.ok) throw new PayPalPayoutError('PayPal rejected the publisher payout request.', response.status);
  const payoutBatchId = result.batch_header?.payout_batch_id;
  const batchStatus = result.batch_header?.batch_status;
  if (!payoutBatchId || !batchStatus) throw new Error('PayPal payout response is incomplete.');
  return { payoutBatchId, batchStatus };
}
