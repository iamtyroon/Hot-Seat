import assert from 'node:assert/strict';
import {
  aggregateAudience,
  allocatePublisherShare,
  audienceTierMultiplier,
  decideHeartbeat,
  eligibleLeaseNetSpendCents,
  getPublisherPayoutGate,
  quoteFiveMinuteLeaseCents,
  toCreativeManifest,
} from '../src/gameAds/domain';
import { isValidFirebaseClaims } from '../src/server/firebaseIdToken';
import { createPayPalPublisherPayoutBatch, decryptPublisherEmail, encryptPublisherEmail, publisherPayoutWebhookStatus } from '../src/server/publisherPayouts';

assert.equal(audienceTierMultiplier(0), 1);
assert.equal(audienceTierMultiplier(99), 1);
assert.equal(audienceTierMultiplier(100), 1.25);
assert.equal(audienceTierMultiplier(499), 1.25);
assert.equal(audienceTierMultiplier(500), 1.5);
assert.equal(audienceTierMultiplier(1_999), 1.5);
assert.equal(audienceTierMultiplier(2_000), 2);
assert.equal(audienceTierMultiplier(9_999), 2);
assert.equal(audienceTierMultiplier(10_000), 2.5);
assert.equal(audienceTierMultiplier(20_000), 3);
assert.equal(audienceTierMultiplier(30_000), 3.5);
assert.equal(quoteFiveMinuteLeaseCents(20, 50), 100);
assert.equal(quoteFiveMinuteLeaseCents(20, 100), 125);
assert.equal(quoteFiveMinuteLeaseCents(20, 30_000), 350);
assert.equal(quoteFiveMinuteLeaseCents(0, 0), 100);
assert.equal(quoteFiveMinuteLeaseCents(1_000_000, 30_000), 3_500_000);

const nowMs = 1_000_000;
assert.deepEqual(
  decideHeartbeat({ activePlayers: 12, observedAt: nowMs, maxPlayersPerServer: 20, receivedAtMs: nowMs }),
  { accepted: true, flagged: false, expiresAtMs: nowMs + 90_000 }
);
assert.deepEqual(
  decideHeartbeat({ activePlayers: 21, observedAt: nowMs, maxPlayersPerServer: 20, receivedAtMs: nowMs }),
  { accepted: false, reason: 'above_server_cap' }
);
assert.deepEqual(
  decideHeartbeat({ activePlayers: 1.5, observedAt: nowMs, maxPlayersPerServer: 20, receivedAtMs: nowMs }),
  { accepted: false, reason: 'invalid_count' }
);
assert.deepEqual(
  decideHeartbeat({
    activePlayers: 41,
    observedAt: nowMs,
    maxPlayersPerServer: 100,
    previousAcceptedPlayers: 10,
    previousAcceptedAtMs: nowMs - 30_000,
    receivedAtMs: nowMs,
  }),
  { accepted: true, flagged: true, expiresAtMs: nowMs + 60_000, reason: 'sudden_increase' }
);
assert.equal(
  decideHeartbeat({
    activePlayers: 41,
    observedAt: nowMs,
    maxPlayersPerServer: 100,
    previousAcceptedPlayers: 10,
    previousAcceptedAtMs: nowMs - 61_000,
    receivedAtMs: nowMs,
  }).accepted,
  true
);

assert.deepEqual(
  aggregateAudience({
    browserSessionIds: ['same', 'same', 'other'],
    gamePresence: [
      { acceptedPlayers: 7, expiresAtMs: nowMs + 1, flagged: true },
      { acceptedPlayers: 50, expiresAtMs: nowMs, flagged: false },
    ],
    nowMs,
  }),
  { activeWebsiteSessions: 2, activeGamePlayers: 7, combinedAudience: 9 }
);

const share = allocatePublisherShare(100, [
  { publisherId: 'a', verified: true, playerHours: 1 },
  { publisherId: 'b', verified: true, playerHours: 2 },
  { publisherId: 'pending', verified: false, playerHours: 100 },
]);
assert.equal(share.poolCents, 20);
assert.ok(Math.abs(share.allocations[0].amountCents - 20 / 3) < 1e-9);
assert.ok(Math.abs(share.allocations[1].amountCents - 40 / 3) < 1e-9);
assert.equal(allocatePublisherShare(500, []).returnedToHotSeatCents, 100);
assert.equal(eligibleLeaseNetSpendCents({ collectedCents: 1000, refundedCents: 200, chargebackCents: 100, remittanceTaxCents: 50 }), 650);
assert.equal(eligibleLeaseNetSpendCents({ collectedCents: 100, refundedCents: 200, chargebackCents: 0, remittanceTaxCents: 0 }), 0);

assert.equal(
  getPublisherPayoutGate({
    durableStorage: true,
    signedWebhooks: true,
    kenyaCorridorReady: true,
    taxReady: true,
    providerCredentialsReady: true,
    recipientEncryptionReady: true,
    explicitlyEnabled: false,
  }).enabled,
  false
);

const manifest = toCreativeManifest({
  placementId: 'placement-1', creativeId: 'creative-1', revision: 'rev-1',
  assetUrl: 'https://example.test/ad.png', aspectRatio: 2, companyName: 'Hot Seat',
  headline: 'Play safe', validUntil: new Date(nowMs + 60_000).toISOString(),
});
assert.deepEqual(Object.keys(manifest).sort(), [
  'aspectRatio', 'companyName', 'creativeId', 'format', 'headline', 'placementId',
  'platformAsset', 'refreshAfterSeconds', 'revision', 'schemaVersion', 'validUntil',
].sort());
assert.equal(manifest.format, 'image');

const firebaseClaims = {
  aud: 'fleet-line-6bcxw',
  iss: 'https://securetoken.google.com/fleet-line-6bcxw',
  sub: 'publisher-uid',
  iat: 900,
  auth_time: 900,
  exp: 2_000,
};
assert.equal(isValidFirebaseClaims(firebaseClaims, 'fleet-line-6bcxw', 1_000), true);
assert.equal(isValidFirebaseClaims({ ...firebaseClaims, aud: 'other-project' }, 'fleet-line-6bcxw', 1_000), false);
assert.equal(isValidFirebaseClaims({ ...firebaseClaims, exp: 999 }, 'fleet-line-6bcxw', 1_000), false);
assert.equal(isValidFirebaseClaims({ ...firebaseClaims, sub: '' }, 'fleet-line-6bcxw', 1_000), false);

const piiKey = Buffer.alloc(32, 17);
const encryptedEmail = encryptPublisherEmail('publisher@example.ke', piiKey);
assert.equal(encryptedEmail.includes('publisher@example.ke'), false);
assert.equal(decryptPublisherEmail(encryptedEmail, piiKey), 'publisher@example.ke');
assert.throws(() => decryptPublisherEmail(encryptedEmail, Buffer.alloc(32, 18)));
assert.equal(publisherPayoutWebhookStatus('PAYMENT.PAYOUTS-ITEM.SUCCEEDED'), 'paid');
assert.equal(publisherPayoutWebhookStatus('PAYMENT.PAYOUTS-ITEM.UNCLAIMED'), 'unclaimed');
assert.equal(publisherPayoutWebhookStatus('PAYMENT.CAPTURE.COMPLETED'), null);

const payoutCalls: Array<{ url: string; init?: RequestInit }> = [];
const payoutFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  payoutCalls.push({ url, init });
  if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
  return new Response(JSON.stringify({ batch_header: { payout_batch_id: 'batch-123', batch_status: 'PENDING' } }), { status: 201 });
};
const payout = await createPayPalPublisherPayoutBatch({
  clientId: 'test-client', clientSecret: 'test-secret', environment: 'SANDBOX',
  senderBatchId: 'hs-attempt-batch-123',
  items: [
    { recipientEmail: 'publisher@example.ke', amountCents: 1234, senderItemId: 'attempt-123' },
    { recipientEmail: 'other@example.ke', amountCents: 1000, senderItemId: 'attempt-456' },
  ],
}, payoutFetch);
assert.deepEqual(payout, { payoutBatchId: 'batch-123', batchStatus: 'PENDING' });
assert.equal(payoutCalls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
assert.equal(payoutCalls[1].url, 'https://api-m.sandbox.paypal.com/v1/payments/payouts');
assert.equal(new Headers(payoutCalls[1].init?.headers).get('PayPal-Request-Id'), 'hs-attempt-batch-123');
const payoutPayload = JSON.parse(String(payoutCalls[1].init?.body));
assert.equal(payoutPayload.items[0].amount.value, '12.34');
assert.equal(payoutPayload.items[0].amount.currency, 'USD');
assert.equal(payoutPayload.items[0].sender_item_id, 'attempt-123');
assert.equal(payoutPayload.items[1].amount.value, '10.00');

assert.equal(
  Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL),
  false,
  'focused checks must never connect to a configured external database'
);
const storage = await import('../src/server/storage');
assert.equal(storage.hasDurableStorage, false);
await storage.initializeStorage('');
try {
  const { reconcileMonthlyRevenue } = await import('../src/gameAds/routes');
  const leaseStart = Date.UTC(2026, 9, 15);
  await storage.db.prepare(`INSERT INTO publishers
    (id, firebase_uid, email, display_name, country_code, status, created_at_ms)
    VALUES (?, ?, ?, ?, 'KE', 'verified', ?)`).run('publisher-a', 'uid-a', 'a@example.ke', 'Publisher A', leaseStart);
  await storage.db.prepare(`INSERT INTO publishers
    (id, firebase_uid, email, display_name, country_code, status, created_at_ms)
    VALUES (?, ?, ?, ?, 'KE', 'verified', ?)`).run('publisher-b', 'uid-b', 'b@example.ke', 'Publisher B', leaseStart);
  await storage.db.prepare(`INSERT INTO game_ad_leases
    (id, agent_id, company_name, quote_cents, collected_cents, refunded_cents, chargeback_cents,
     remittance_tax_cents, collection_status, started_at_ms, expires_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`).run(
      'lease-shared', 'agent-1', 'Lease Test', 10_000, 10_000, 1_000, 500, 200, leaseStart, leaseStart + 300_000
    );
  await storage.db.prepare(`INSERT INTO game_ad_leases
    (id, agent_id, company_name, quote_cents, collected_cents, refunded_cents, chargeback_cents,
     remittance_tax_cents, collection_status, started_at_ms, expires_at_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`).run(
      'lease-empty', 'agent-1', 'Lease Test', 5_000, 5_000, 0, 0, 0, leaseStart + 1, leaseStart + 300_001
    );
  await storage.db.prepare(`INSERT INTO publisher_lease_hours
    (publisher_id, lease_id, lease_month, player_hours, last_sample_at_ms) VALUES (?, ?, ?, ?, ?)`).run(
      'publisher-a', 'lease-shared', '2026-10-01', 1, leaseStart
    );
  await storage.db.prepare(`INSERT INTO publisher_lease_hours
    (publisher_id, lease_id, lease_month, player_hours, last_sample_at_ms) VALUES (?, ?, ?, ?, ?)`).run(
      'publisher-b', 'lease-shared', '2026-10-01', 3, leaseStart
    );

  const firstPass = await reconcileMonthlyRevenue(new Date('2026-11-15T00:00:00.000Z'));
  const secondPass = await reconcileMonthlyRevenue(new Date('2026-11-15T00:00:00.000Z'));
  assert.equal(firstPass.newPools, 2);
  assert.equal(secondPass.newPools, 0);
  assert.equal(firstPass.payoutGate.enabled, false);
  const pools = await storage.db.prepare(`SELECT lease_id, eligible_net_spend_cents, publisher_pool_cents,
    returned_to_hotseat_cents FROM publisher_revenue_pools ORDER BY lease_id`).all() as Array<{
      lease_id: string; eligible_net_spend_cents: number; publisher_pool_cents: number; returned_to_hotseat_cents: number;
    }>;
  assert.equal(pools.length, 2);
  assert.deepEqual(pools.find((pool) => pool.lease_id === 'lease-shared'), {
    lease_id: 'lease-shared', eligible_net_spend_cents: 8_300, publisher_pool_cents: 1_660, returned_to_hotseat_cents: 0,
  });
  assert.deepEqual(pools.find((pool) => pool.lease_id === 'lease-empty'), {
    lease_id: 'lease-empty', eligible_net_spend_cents: 5_000, publisher_pool_cents: 1_000, returned_to_hotseat_cents: 1_000,
  });
  const accrualCount = await storage.db.prepare('SELECT COUNT(*) AS count FROM publisher_share_accruals').get() as { count: number };
  const payoutItemCount = await storage.db.prepare('SELECT COUNT(*) AS count FROM publisher_payout_items').get() as { count: number };
  assert.equal(Number(accrualCount.count), 2);
  assert.equal(Number(payoutItemCount.count), 2);
} finally {
  await storage.closeStorage();
}

console.log('game-ad focused checks passed');
