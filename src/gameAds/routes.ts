import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import sharp from 'sharp';
import { db, hasDurableStorage, tryAcquirePublisherPayoutLock, tryAcquireRevenueReconciliationLock } from '../server/storage';
import { isPlatformAdmin, verifyFirebaseIdToken, type FirebaseIdentity } from '../server/firebaseIdToken';
import { createPayPalPublisherPayoutBatch, decryptPublisherEmail, encryptPublisherEmail, encryptPublisherText, PayPalPayoutError, publisherPiiKey } from '../server/publisherPayouts';
import { aggregateAudience, type AudiencePricingTier, allocateIntegerPublisherShare, CREATIVE_REFRESH_SECONDS, decideHeartbeat, DEFAULT_AUDIENCE_PRICING_TIERS, eligibleLeaseNetSpendCents, getPublisherPayoutGate, isAudiencePricingTiers, toCreativeManifest } from './domain';

const PRESENCE_RATE_LIMIT = 10;
const BROWSER_SESSION_CREATION_RATE_LIMIT = 50;
const MONTHLY_PAYOUT_MINIMUM_CENTS = 1_000;
const randomId = () => crypto.randomUUID();
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
type Audience = ReturnType<typeof aggregateAudience>;

export async function getAudiencePricingTiers(): Promise<AudiencePricingTier[]> {
  const row = await db.prepare('SELECT tiers_json FROM game_ads_pricing_config WHERE id = 1').get() as { tiers_json: string } | undefined;
  if (!row) return DEFAULT_AUDIENCE_PRICING_TIERS;
  try {
    const tiers = JSON.parse(row.tiers_json);
    return isAudiencePricingTiers(tiers) ? tiers : DEFAULT_AUDIENCE_PRICING_TIERS;
  } catch {
    return DEFAULT_AUDIENCE_PRICING_TIERS;
  }
}

function clientAddress(req: Request) {
  const forwarded = (req.header('x-forwarded-for') || '').split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded[forwarded.length - 1] || req.ip || req.socket.remoteAddress || 'unknown';
}

export async function getLiveAudience(nowMs = Date.now()): Promise<Audience> {
  const [browserRows, gameRows] = await Promise.all([
    db.prepare('SELECT session_id FROM browser_presence WHERE expires_at_ms > ?').all(nowMs),
    db.prepare(`SELECT gp.accepted_players, gp.expires_at_ms, gp.flagged_at_ms
      FROM game_presence gp JOIN games g ON g.id = gp.game_id AND g.status = 'verified'
      JOIN publishers p ON p.id = gp.publisher_id AND p.status = 'verified'
      WHERE gp.expires_at_ms > ? AND EXISTS (SELECT 1 FROM placements pl WHERE pl.game_id = g.id AND pl.enabled = 1)`).all(nowMs),
  ]);
  return aggregateAudience({
    browserSessionIds: (browserRows as Array<{ session_id: string }>).map((row) => row.session_id),
    gamePresence: (gameRows as Array<{ accepted_players: number; expires_at_ms: number; flagged_at_ms: number | null }>).map((row) => ({
      acceptedPlayers: Number(row.accepted_players), expiresAtMs: Number(row.expires_at_ms), flagged: row.flagged_at_ms !== null,
    })),
    nowMs,
  });
}

async function getIdentity(req: Request, res: Response, admin = false): Promise<FirebaseIdentity | null> {
  const match = /^Bearer\s+([\w.-]+)$/i.exec(req.header('authorization') || '');
  if (!match) { res.status(401).json({ error: 'A Firebase sign-in token is required.' }); return null; }
  const identity = await verifyFirebaseIdToken(match[1]);
  if (!identity) { res.status(401).json({ error: 'Firebase sign-in token is invalid or expired.' }); return null; }
  if (!identity.emailVerified || !identity.email) { res.status(403).json({ error: 'Verify your Google account email before continuing.' }); return null; }
  if (admin && !isPlatformAdmin(identity)) { res.status(403).json({ error: 'Platform administrator access is required.' }); return null; }
  return identity;
}

async function getPublisher(identity: FirebaseIdentity) {
  return await db.prepare('SELECT * FROM publishers WHERE firebase_uid = ?').get(identity.uid) as any;
}

function cookieValue(req: Request, name: string) {
  const prefix = `${name}=`;
  return (req.header('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

function escapeXml(value: string) {
  const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return value.replace(/[&<>"']/g, (character) => escaped[character]);
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

async function renderCreative(input: { companyName: string; headline: string; sprayColor: string; textColor: string }) {
  const company = escapeXml(input.companyName.slice(0, 60));
  const headline = escapeXml(input.headline.slice(0, 90));
  const background = safeColor(input.sprayColor, '#161616');
  const foreground = safeColor(input.textColor, '#ffffff');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="${background}"/><rect x="30" y="30" width="1140" height="540" fill="none" stroke="${foreground}" stroke-width="8"/><text x="80" y="150" fill="${foreground}" font-family="Arial,sans-serif" font-size="44" font-weight="700">${company}</text><text x="80" y="320" fill="${foreground}" font-family="Arial,sans-serif" font-size="72" font-weight="800">${headline}</text><text x="80" y="500" fill="${foreground}" font-family="Arial,sans-serif" font-size="28">HOT SEAT - LIVE GAME ADS</text></svg>`);
  const output = await sharp(svg).png().toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.format !== 'png' || metadata.width !== 1200 || metadata.height !== 600) throw new Error('Creative image failed raster validation.');
  return output;
}

async function updateAccrualEntitlement(input: {
  accrualId: string;
  publisherId: string;
  playerHours: number;
  grossCents: number;
  withholdingCents: number;
  netCents: number;
  nowMs: number;
}) {
  const linked = await db.prepare(`SELECT i.payout_id, i.amount_cents, p.status AS payout_status
    FROM publisher_payout_items i JOIN publisher_payouts p ON p.id = i.payout_id
    WHERE i.accrual_id = ?`).get(input.accrualId) as { payout_id: string; amount_cents: number; payout_status: string } | undefined;
  const current = await db.prepare('SELECT net_payable_cents FROM publisher_share_accruals WHERE id = ?')
    .get(input.accrualId) as { net_payable_cents: number } | undefined;
  if (!current) return;
  if (linked?.payout_status === 'pending') return;

  const previousNet = Number(current.net_payable_cents);
  await db.prepare(`UPDATE publisher_share_accruals SET player_hours = ?, gross_share_cents = ?, withholding_cents = ?, net_payable_cents = ?
    WHERE id = ?`).run(input.playerHours, input.grossCents, input.withholdingCents, input.netCents, input.accrualId);
  if (linked?.payout_status === 'paid') {
    const adjustment = input.netCents - previousNet;
    if (adjustment !== 0) {
      await db.prepare(`INSERT INTO publisher_share_adjustments (id, publisher_id, accrual_id, amount_cents, created_at_ms)
        VALUES (?, ?, ?, ?, ?)`).run(randomId(), input.publisherId, input.accrualId, adjustment, input.nowMs);
    }
  } else if (linked) {
    const adjustment = input.netCents - Number(linked.amount_cents);
    await db.prepare('UPDATE publisher_payout_items SET amount_cents = ? WHERE accrual_id = ?')
      .run(input.netCents, input.accrualId);
    if (adjustment !== 0) {
      await db.prepare('UPDATE publisher_payouts SET amount_cents = amount_cents + ?, updated_at_ms = ? WHERE id = ?')
        .run(adjustment, input.nowMs, linked.payout_id);
    }
  }
}

async function publisherTaxRateBps(publisherId: string) {
  const row = await db.prepare(`SELECT s.withholding_bps FROM publisher_tax_settings s
    JOIN publisher_tax_profiles t ON t.publisher_id = s.publisher_id
    WHERE s.publisher_id = ? AND t.status = 'verified' AND t.tax_details_ciphertext <> ''`).get(publisherId) as { withholding_bps: number } | undefined;
  return row ? Number(row.withholding_bps) : 0;
}

async function payoutGate() {
  const event = await db.prepare(`SELECT event_id FROM paypal_webhook_events WHERE verified = 1
    AND event_type = 'PAYMENT.CAPTURE.COMPLETED' AND processed_at_ms IS NOT NULL
    AND EXISTS (SELECT 1 FROM wallet_funding_lots) LIMIT 1`).get() as { event_id: string } | undefined;
  const unresolvedTaxProfile = await db.prepare(`SELECT 1 FROM publisher_share_accruals a
    JOIN publishers p ON p.id = a.publisher_id
    LEFT JOIN publisher_tax_profiles t ON t.publisher_id = p.id
    LEFT JOIN publisher_tax_settings s ON s.publisher_id = p.id
    LEFT JOIN publisher_payout_items i ON i.accrual_id = a.id
    LEFT JOIN publisher_payouts pay ON pay.id = i.payout_id
    WHERE a.net_payable_cents > 0
      AND (i.accrual_id IS NULL OR pay.status <> 'paid')
      AND (COALESCE(t.status, 'unresolved') <> 'verified' OR s.publisher_id IS NULL OR COALESCE(t.tax_details_ciphertext, '') = '') LIMIT 1`).get();
  return getPublisherPayoutGate({
    durableStorage: hasDurableStorage, signedWebhooks: Boolean(event && process.env.PAYPAL_WEBHOOK_ID),
    kenyaCorridorReady: process.env.PAYPAL_KE_CORRIDOR_READY === 'true',
    taxReady: process.env.KENYA_TAX_REQUIREMENTS_RESOLVED === 'true' && !unresolvedTaxProfile,
    providerCredentialsReady: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    recipientEncryptionReady: Boolean(publisherPiiKey()),
    explicitlyEnabled: process.env.ENABLE_PUBLISHER_PAYOUTS === 'true',
  });
}

async function refreshOpenPublisherPayoutStatuses(gate: Awaited<ReturnType<typeof payoutGate>>, nowMs: number) {
  const payouts = await db.prepare(`SELECT id, publisher_id, amount_cents FROM publisher_payouts
    WHERE status IN ('unclaimed', 'blocked', 'payable', 'rolled_forward')`).all() as Array<{ id: string; publisher_id: string; amount_cents: number }>;
  for (const payout of payouts) {
    const publisher = await db.prepare(`SELECT p.status, p.paypal_email_ciphertext, t.status AS tax_status,
        t.tax_details_ciphertext, s.withholding_bps
      FROM publishers p LEFT JOIN publisher_tax_profiles t ON t.publisher_id = p.id
      LEFT JOIN publisher_tax_settings s ON s.publisher_id = p.id WHERE p.id = ?`)
      .get(payout.publisher_id) as { status: string; paypal_email_ciphertext: string; tax_status: string | null; tax_details_ciphertext: string | null; withholding_bps: number | null } | undefined;
    const ready = gate.enabled && publisher?.status === 'verified' && Boolean(publisher.paypal_email_ciphertext)
      && publisher.tax_status === 'verified' && Boolean(publisher.tax_details_ciphertext) && publisher.withholding_bps !== null;
    const amountCents = Number(payout.amount_cents);
    const status = amountCents < MONTHLY_PAYOUT_MINIMUM_CENTS ? 'unclaimed' : ready ? 'payable' : 'blocked';
    await db.prepare('UPDATE publisher_payouts SET status = ?, updated_at_ms = ? WHERE id = ?')
      .run(status, nowMs, payout.id);
  }
}

function nowMonth(timeMs: number) {
  const date = new Date(timeMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function monthlyLeaseKey(leaseId: string, month: string) {
  return `publisher-share:${leaseId}:${month}`;
}
export async function samplePublisherLeaseHours(nowMs = Date.now()) {
  const lease = await db.prepare('SELECT id FROM game_ad_leases WHERE expires_at_ms > ? ORDER BY started_at_ms DESC LIMIT 1').get(nowMs) as { id: string } | undefined;
  if (!lease) {
    await db.prepare('DELETE FROM browser_presence WHERE expires_at_ms <= ?').run(nowMs);
    await db.prepare('DELETE FROM game_presence WHERE expires_at_ms <= ?').run(nowMs);
    await db.prepare('DELETE FROM game_heartbeat_limits WHERE window_started_at_ms <= ?').run(nowMs - 86_400_000);
    await db.prepare('DELETE FROM browser_presence_creation_limits WHERE window_started_at_ms <= ?').run(nowMs - 120_000);
    return;
  }
  const rows = await db.prepare(`SELECT gp.publisher_id, SUM(gp.accepted_players) AS active_players
    FROM game_presence gp JOIN games g ON g.id = gp.game_id AND g.status = 'verified'
    JOIN publishers p ON p.id = gp.publisher_id AND p.status = 'verified'
    WHERE gp.expires_at_ms > ? AND EXISTS (SELECT 1 FROM placements pl WHERE pl.game_id = g.id AND pl.enabled = 1)
    GROUP BY gp.publisher_id`).all(nowMs) as Array<{ publisher_id: string; active_players: number }>;
  const month = nowMonth(nowMs);
  await db.transaction(async () => {
    for (const row of rows) {
      const previous = await db.prepare(`SELECT last_sample_at_ms FROM publisher_lease_hours
        WHERE publisher_id = ? AND lease_id = ? AND lease_month = ?`).get(row.publisher_id, lease.id, month) as { last_sample_at_ms: number } | undefined;
      const lastSampleAtMs = previous ? Number(previous.last_sample_at_ms) : nowMs;
      const elapsedMs = Math.min(30_000, Math.max(0, nowMs - lastSampleAtMs));
      const playerHours = Math.max(0, Number(row.active_players)) * elapsedMs / 3_600_000;
      await db.prepare(`INSERT INTO publisher_lease_hours (publisher_id, lease_id, lease_month, player_hours, last_sample_at_ms)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (publisher_id, lease_id, lease_month)
        DO UPDATE SET player_hours = publisher_lease_hours.player_hours + excluded.player_hours,
                      last_sample_at_ms = excluded.last_sample_at_ms`).run(row.publisher_id, lease.id, month, playerHours, nowMs);
    }
    const activePublisherIds = rows.map((row) => row.publisher_id);
    if (activePublisherIds.length) {
      const placeholders = activePublisherIds.map(() => '?').join(', ');
      await db.prepare(`UPDATE publisher_lease_hours SET last_sample_at_ms = ?
        WHERE lease_id = ? AND lease_month = ? AND publisher_id NOT IN (${placeholders})`)
        .run(nowMs, lease.id, month, ...activePublisherIds);
    } else {
      await db.prepare('UPDATE publisher_lease_hours SET last_sample_at_ms = ? WHERE lease_id = ? AND lease_month = ?')
        .run(nowMs, lease.id, month);
    }
    await db.prepare('UPDATE arena_worker_state SET last_tick_at_ms = ? WHERE id = 1').run(nowMs);
    await db.prepare('DELETE FROM browser_presence WHERE expires_at_ms <= ?').run(nowMs);
    await db.prepare('DELETE FROM game_presence WHERE expires_at_ms <= ?').run(nowMs);
    await db.prepare('DELETE FROM game_heartbeat_limits WHERE window_started_at_ms <= ?').run(nowMs - 86_400_000);
    await db.prepare('DELETE FROM browser_presence_creation_limits WHERE window_started_at_ms <= ?').run(nowMs - 120_000);
  })();
}

function previousMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

export async function reconcileMonthlyRevenue(now = new Date()) {
  const gate = await payoutGate();
  const from = previousMonth(now);
  const month = nowMonth(from.getTime());
  const leases = await db.prepare(`SELECT * FROM game_ad_leases WHERE collection_status = 'confirmed'
    AND started_at_ms < ?`).all(now.getTime()) as any[];
  let newPools = 0;
  for (const lease of leases) {
    const leaseMonth = nowMonth(Number(lease.started_at_ms));
    const hours = await db.prepare(`SELECT h.publisher_id, h.player_hours, p.status FROM publisher_lease_hours h
      JOIN publishers p ON p.id = h.publisher_id WHERE h.lease_id = ? AND h.lease_month = ?`).all(lease.id, leaseMonth) as Array<{ publisher_id: string; player_hours: number; status: string }>;
    const eligibleSpend = Math.round(eligibleLeaseNetSpendCents({
      collectedCents: Number(lease.collected_cents), refundedCents: Number(lease.refunded_cents),
      chargebackCents: Number(lease.chargeback_cents), remittanceTaxCents: Number(lease.remittance_tax_cents),
    }));
    const allocations = allocateIntegerPublisherShare(eligibleSpend, hours.map((publisher) => ({
      publisherId: publisher.publisher_id,
      playerHours: Number(publisher.player_hours),
      verified: publisher.status === 'verified',
    })));
    const createdPool = await db.transaction(async () => {
      const prior = await db.prepare('SELECT id FROM publisher_revenue_pools WHERE lease_id = ? AND lease_month = ?')
        .get(lease.id, leaseMonth) as { id: string } | undefined;
      if (!prior) {
        await db.prepare(`INSERT INTO publisher_revenue_pools
          (id, lease_id, lease_month, eligible_net_spend_cents, remittance_tax_cents, publisher_pool_cents, returned_to_hotseat_cents, idempotency_key, reconciled_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (lease_id, lease_month) DO NOTHING`).run(
          randomId(), lease.id, leaseMonth, eligibleSpend, lease.remittance_tax_cents, allocations.poolCents,
          allocations.returnedToHotSeatCents, monthlyLeaseKey(lease.id, leaseMonth), now.getTime());
      }
      const stored = await db.prepare('SELECT id FROM publisher_revenue_pools WHERE lease_id = ? AND lease_month = ?')
        .get(lease.id, leaseMonth) as { id: string };
      await db.prepare(`UPDATE publisher_revenue_pools SET eligible_net_spend_cents = ?, remittance_tax_cents = ?, publisher_pool_cents = ?,
        returned_to_hotseat_cents = ?, reconciled_at_ms = ? WHERE id = ?`)
        .run(eligibleSpend, lease.remittance_tax_cents, allocations.poolCents, allocations.returnedToHotSeatCents, now.getTime(), stored.id);

      const existing = await db.prepare('SELECT id, publisher_id FROM publisher_share_accruals WHERE pool_id = ?')
        .all(stored.id) as Array<{ id: string; publisher_id: string }>;
      const allocated = new Map(allocations.allocations.map((share) => [share.publisherId, share]));
      for (const accrual of existing) {
        const share = allocated.get(accrual.publisher_id);
        const grossCents = share?.amountCents || 0;
        const playerHours = share?.playerHours || 0;
        const withholdingCents = Math.round(grossCents * await publisherTaxRateBps(accrual.publisher_id) / 10_000);
        await updateAccrualEntitlement({
          accrualId: accrual.id, publisherId: accrual.publisher_id, playerHours, grossCents,
          withholdingCents, netCents: grossCents - withholdingCents, nowMs: now.getTime(),
        });
        allocated.delete(accrual.publisher_id);
      }
      for (const share of allocated.values()) {
        const withholdingCents = Math.round(share.amountCents * await publisherTaxRateBps(share.publisherId) / 10_000);
        await db.prepare(`INSERT INTO publisher_share_accruals
          (id, pool_id, publisher_id, player_hours, gross_share_cents, withholding_cents, net_payable_cents, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomId(), stored.id, share.publisherId, share.playerHours, share.amountCents,
          withholdingCents, share.amountCents - withholdingCents, now.getTime());
      }
      return !prior;
    })();
    if (createdPool) newPools += 1;
  }

  const unassigned = await db.prepare(`SELECT publisher_id, SUM(amount_cents) AS amount_cents FROM (
      SELECT a.publisher_id, a.net_payable_cents AS amount_cents
      FROM publisher_share_accruals a LEFT JOIN publisher_payout_items i ON i.accrual_id = a.id
      WHERE i.accrual_id IS NULL
      UNION ALL
      SELECT a.publisher_id, a.amount_cents - COALESCE(SUM(i.amount_cents), 0) AS amount_cents
      FROM publisher_share_adjustments a LEFT JOIN publisher_payout_adjustment_items i ON i.adjustment_id = a.id
      GROUP BY a.id, a.publisher_id, a.amount_cents
      HAVING a.amount_cents <> COALESCE(SUM(i.amount_cents), 0)
    ) balances GROUP BY publisher_id`).all() as Array<{ publisher_id: string; amount_cents: number }>;
  for (const row of unassigned) {
    await db.transaction(async () => {
      const open = await db.prepare(`SELECT id, amount_cents, status FROM publisher_payouts
        WHERE publisher_id = ? AND status IN ('unclaimed', 'blocked', 'failed', 'returned', 'payable', 'rolled_forward')
        ORDER BY created_at_ms LIMIT 1`).get(row.publisher_id) as { id: string; amount_cents: number; status: string } | undefined;
      const accruals = await db.prepare(`SELECT a.id, a.net_payable_cents FROM publisher_share_accruals a
        LEFT JOIN publisher_payout_items i ON i.accrual_id = a.id
        WHERE a.publisher_id = ? AND i.accrual_id IS NULL`).all(row.publisher_id) as Array<{ id: string; net_payable_cents: number }>;
      const adjustments = await db.prepare(`SELECT a.id, a.amount_cents, COALESCE(SUM(i.amount_cents), 0) AS assigned_cents
        FROM publisher_share_adjustments a LEFT JOIN publisher_payout_adjustment_items i ON i.adjustment_id = a.id
        WHERE a.publisher_id = ? GROUP BY a.id, a.amount_cents
        HAVING a.amount_cents <> COALESCE(SUM(i.amount_cents), 0) ORDER BY a.id`)
        .all(row.publisher_id) as Array<{ id: string; amount_cents: number; assigned_cents: number }>;
      if (!accruals.length && !adjustments.length) return;

      const remainingAdjustments = adjustments.map((adjustment) => ({
        ...adjustment, remainingCents: Number(adjustment.amount_cents) - Number(adjustment.assigned_cents),
      }));
      const accrualCents = accruals.reduce((sum, accrual) => sum + Number(accrual.net_payable_cents), 0);
      const adjustmentCents = remainingAdjustments.reduce((sum, adjustment) => sum + adjustment.remainingCents, 0);
      const existingAmount = Number(open?.amount_cents || 0);
      const totalCents = existingAmount + accrualCents + adjustmentCents;
      if (!open && totalCents <= 0) return;

      let payoutId = open?.id;
      if (!payoutId) {
        payoutId = randomId();
        await db.prepare(`INSERT INTO publisher_payouts
          (id, publisher_id, period, currency, amount_cents, status, idempotency_key, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, 'USD', 0, 'unclaimed', ?, ?, ?)`).run(
          payoutId, row.publisher_id, month, `publisher-payout:${row.publisher_id}:${month}:${payoutId}`, now.getTime(), now.getTime());
      }

      for (const accrual of accruals) {
        await db.prepare('INSERT INTO publisher_payout_items (payout_id, accrual_id, amount_cents) VALUES (?, ?, ?) ON CONFLICT (accrual_id) DO NOTHING')
          .run(payoutId, accrual.id, accrual.net_payable_cents);
      }

      let resultingAmount = existingAmount + accrualCents;
      const positiveAdjustments = remainingAdjustments.filter((adjustment) => adjustment.remainingCents > 0);
      for (const adjustment of positiveAdjustments) {
        await db.prepare(`INSERT INTO publisher_payout_adjustment_items (payout_id, adjustment_id, amount_cents)
          VALUES (?, ?, ?) ON CONFLICT (payout_id, adjustment_id) DO UPDATE SET
          amount_cents = publisher_payout_adjustment_items.amount_cents + excluded.amount_cents`)
          .run(payoutId, adjustment.id, adjustment.remainingCents);
        resultingAmount += adjustment.remainingCents;
      }
      let offsetCapacity = resultingAmount;
      for (const adjustment of remainingAdjustments.filter((candidate) => candidate.remainingCents < 0)) {
        const applied = -Math.min(-adjustment.remainingCents, Math.max(0, offsetCapacity));
        if (applied === 0) continue;
        await db.prepare(`INSERT INTO publisher_payout_adjustment_items (payout_id, adjustment_id, amount_cents)
          VALUES (?, ?, ?) ON CONFLICT (payout_id, adjustment_id) DO UPDATE SET
          amount_cents = publisher_payout_adjustment_items.amount_cents + excluded.amount_cents`)
          .run(payoutId, adjustment.id, applied);
        resultingAmount += applied;
        offsetCapacity += applied;
      }

      const amountCents = Math.max(0, Math.round(resultingAmount));
      const publisher = await db.prepare(`SELECT p.status, p.paypal_email_ciphertext, t.status AS tax_status,
          t.tax_details_ciphertext, s.withholding_bps
        FROM publishers p LEFT JOIN publisher_tax_profiles t ON t.publisher_id = p.id
        LEFT JOIN publisher_tax_settings s ON s.publisher_id = p.id WHERE p.id = ?`)
        .get(row.publisher_id) as { status: string; paypal_email_ciphertext: string; tax_status: string | null; tax_details_ciphertext: string | null; withholding_bps: number | null } | undefined;
      const recipientReady = Boolean(publisher?.paypal_email_ciphertext);
      const taxReady = publisher?.status === 'verified' && publisher.tax_status === 'verified'
        && publisher.withholding_bps !== null && Boolean(publisher.tax_details_ciphertext);
      const status = amountCents < MONTHLY_PAYOUT_MINIMUM_CENTS
        ? 'unclaimed'
        : gate.enabled && recipientReady && taxReady ? 'payable' : 'blocked';
      await db.prepare('UPDATE publisher_payouts SET amount_cents = ?, status = ?, updated_at_ms = ? WHERE id = ?')
        .run(amountCents, status, now.getTime(), payoutId);
    })();
  }
  await refreshOpenPublisherPayoutStatuses(gate, now.getTime());
  return { month, processedLeases: leases.length, newPools, payoutGate: gate };
}

export async function dispatchPublisherPayouts(nowMs = Date.now()) {
  const gate = await payoutGate();
  if (!gate.enabled) return { submitted: 0, pending: 0, payoutGate: gate };
  const lock = await tryAcquirePublisherPayoutLock();
  if (!lock) return { submitted: 0, pending: 0, payoutGate: gate, alreadyRunning: true };
  let submitted = 0;
  try {
    await db.prepare(`UPDATE publisher_payouts SET status = 'payable', updated_at_ms = ?
      WHERE status = 'blocked' AND failure_reason = '' AND currency = 'USD' AND amount_cents >= ?
        AND EXISTS (SELECT 1 FROM publishers pub JOIN publisher_tax_profiles tax ON tax.publisher_id = pub.id
          JOIN publisher_tax_settings settings ON settings.publisher_id = pub.id
          WHERE pub.id = publisher_payouts.publisher_id AND pub.status = 'verified'
            AND tax.status = 'verified' AND tax.tax_details_ciphertext <> '' AND pub.paypal_email_ciphertext <> '')`)
      .run(nowMs, MONTHLY_PAYOUT_MINIMUM_CENTS);
    const queued = await db.prepare(`SELECT p.id, p.publisher_id, p.period, p.amount_cents,
        pub.paypal_email_ciphertext
      FROM publisher_payouts p JOIN publishers pub ON pub.id = p.publisher_id
      JOIN publisher_tax_profiles tax ON tax.publisher_id = pub.id
      JOIN publisher_tax_settings settings ON settings.publisher_id = pub.id
      WHERE p.status = 'payable' AND p.currency = 'USD' AND p.amount_cents >= ?
        AND pub.status = 'verified' AND tax.status = 'verified' AND tax.tax_details_ciphertext <> '' AND pub.paypal_email_ciphertext <> ''
      ORDER BY p.created_at_ms ASC LIMIT 50`).all(MONTHLY_PAYOUT_MINIMUM_CENTS) as Array<{
      id: string; publisher_id: string; period: string; amount_cents: number | string; paypal_email_ciphertext: string;
    }>;
    const senderBatchId = `hs_${randomId().replaceAll('-', '')}`;
    for (const payout of queued) {
      const attemptId = randomId();
      const created = await db.transaction(async () => {
        const current = await db.prepare(`SELECT status FROM publisher_payouts WHERE id = ?${hasDurableStorage ? ' FOR UPDATE' : ''}`)
          .get(payout.id) as { status: string } | undefined;
        if (current?.status !== 'payable') return false;
        const previous = await db.prepare('SELECT MAX(created_at_ms) AS created_at_ms FROM publisher_payout_attempts WHERE payout_id = ?')
          .get(payout.id) as { created_at_ms: number | null };
        const attemptAtMs = Math.max(nowMs, Number(previous.created_at_ms || 0) + 1);
        await db.prepare(`INSERT INTO publisher_payout_attempts
          (id, payout_id, sender_batch_id, status, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, 'submitting', ?, ?)`).run(attemptId, payout.id, senderBatchId, attemptAtMs, attemptAtMs);
        await db.prepare(`UPDATE publisher_payouts SET status = 'pending', failure_reason = '', updated_at_ms = ? WHERE id = ?`)
          .run(nowMs, payout.id);
        return true;
      })();
      if (!created) continue;
      submitted += 1;
    }

    const attempts = await db.prepare(`SELECT a.id, a.payout_id, a.sender_batch_id, p.period, p.amount_cents,
        pub.paypal_email_ciphertext
      FROM publisher_payout_attempts a JOIN publisher_payouts p ON p.id = a.payout_id
      JOIN publishers pub ON pub.id = p.publisher_id
      WHERE a.status = 'submitting' ORDER BY a.created_at_ms ASC LIMIT 100`).all() as Array<{
      id: string; payout_id: string; sender_batch_id: string; period: string; amount_cents: number | string; paypal_email_ciphertext: string;
    }>;
    const groups = new Map<string, typeof attempts>();
    for (const attempt of attempts) groups.set(attempt.sender_batch_id, [...(groups.get(attempt.sender_batch_id) || []), attempt]);
    for (const [batchId, batchAttempts] of groups) {
      const items: Array<{ recipientEmail: string; amountCents: number; senderItemId: string }> = [];
      for (const attempt of batchAttempts) {
        try {
          items.push({
            recipientEmail: decryptPublisherEmail(attempt.paypal_email_ciphertext),
            amountCents: Math.round(Number(attempt.amount_cents)),
            senderItemId: attempt.id,
          });
        } catch {
          const reason = 'Payout recipient could not be decrypted. Verify the encryption key or save the recipient again.';
          await db.transaction(async () => {
            await db.prepare(`UPDATE publisher_payout_attempts SET status = 'blocked', failure_reason = ?, updated_at_ms = ? WHERE id = ? AND status = 'submitting'`)
              .run(reason, Date.now(), attempt.id);
            const latestAttempt = await db.prepare(`SELECT id FROM publisher_payout_attempts WHERE payout_id = ?
              ORDER BY created_at_ms DESC, id DESC LIMIT 1`).get(attempt.payout_id) as { id: string } | undefined;
            if (latestAttempt?.id === attempt.id) {
              await db.prepare(`UPDATE publisher_payouts SET status = 'blocked', failure_reason = ?, updated_at_ms = ? WHERE id = ? AND status = 'pending'`)
                .run(reason, Date.now(), attempt.payout_id);
            }
          })();
        }
      }
      if (!items.length) continue;
      try {
        const result = await createPayPalPublisherPayoutBatch({
          clientId: process.env.PAYPAL_CLIENT_ID || '',
          clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
          environment: process.env.PAYPAL_ENVIRONMENT || process.env.PAYPAL_ENV || 'LIVE',
          senderBatchId: batchId,
          items,
        });
        const status = result.batchStatus === 'DENIED' ? 'failed' : 'pending';
        await db.transaction(async () => {
          for (const attempt of batchAttempts) {
            await db.prepare(`UPDATE publisher_payout_attempts SET paypal_batch_id = ?, status = ?, failure_reason = '', updated_at_ms = ?
              WHERE id = ? AND status = 'submitting'`).run(result.payoutBatchId, status, Date.now(), attempt.id);
            const latestAttempt = await db.prepare(`SELECT id FROM publisher_payout_attempts WHERE payout_id = ?
              ORDER BY created_at_ms DESC, id DESC LIMIT 1`).get(attempt.payout_id) as { id: string } | undefined;
            if (latestAttempt?.id === attempt.id) {
              await db.prepare(`UPDATE publisher_payouts SET paypal_batch_id = ?, status = ?, failure_reason = '', updated_at_ms = ?
                WHERE id = ? AND status = 'pending'`).run(result.payoutBatchId, status, Date.now(), attempt.payout_id);
            }
          }
        })();
      } catch (error) {
        if (error instanceof PayPalPayoutError && error.status && error.status >= 400 && error.status < 500) {
          const reason = error.message.slice(0, 500);
          await db.transaction(async () => {
            for (const attempt of batchAttempts) {
              await db.prepare(`UPDATE publisher_payout_attempts SET status = 'failed', failure_reason = ?, updated_at_ms = ? WHERE id = ? AND status = 'submitting'`)
                .run(reason, Date.now(), attempt.id);
              const latestAttempt = await db.prepare(`SELECT id FROM publisher_payout_attempts WHERE payout_id = ?
                ORDER BY created_at_ms DESC, id DESC LIMIT 1`).get(attempt.payout_id) as { id: string } | undefined;
              if (latestAttempt?.id === attempt.id) {
                await db.prepare(`UPDATE publisher_payouts SET status = 'failed', failure_reason = ?, updated_at_ms = ? WHERE id = ? AND status = 'pending'`)
                  .run(reason, Date.now(), attempt.payout_id);
              }
            }
          })();
        }
      }
    }
    const pending = await db.prepare(`SELECT COUNT(*) AS count FROM publisher_payout_attempts WHERE status IN ('submitting', 'pending')`).get() as { count: number };
    return { submitted, pending: Number(pending.count), payoutGate: gate };
  } finally {
    await lock.release();
  }
}

export function createGameAdsRouter() {
  const router = express.Router();
  router.get('/health', (_req, res) => res.json({ ok: true, durableStorage: hasDurableStorage }));
  router.get('/audience', async (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await getLiveAudience()); });
  router.post('/audience/heartbeat', async (req, res) => {
    const supplied = cookieValue(req, 'hs_audience');
    const nowMs = Date.now();
    const candidate = supplied && /^[\w-]{32,64}$/.test(supplied) ? supplied : '';
    const knownSession = candidate ? await db.prepare('SELECT session_id FROM browser_presence WHERE session_id = ? AND expires_at_ms > ?').get(sha256(candidate), nowMs) : null;
    const hasValidSession = Boolean(knownSession);
    const session = hasValidSession ? candidate : crypto.randomBytes(32).toString('base64url');
    if (!hasValidSession) {
      const addressHash = sha256(clientAddress(req));
      const requestCount = await db.transaction(async () => {
        await db.prepare(`INSERT INTO browser_presence_creation_limits (client_hash, window_started_at_ms, request_count)
          VALUES (?, ?, 1) ON CONFLICT (client_hash) DO UPDATE SET
          request_count = CASE WHEN excluded.window_started_at_ms - browser_presence_creation_limits.window_started_at_ms >= 60000 THEN 1 ELSE browser_presence_creation_limits.request_count + 1 END,
          window_started_at_ms = CASE WHEN excluded.window_started_at_ms - browser_presence_creation_limits.window_started_at_ms >= 60000 THEN excluded.window_started_at_ms ELSE browser_presence_creation_limits.window_started_at_ms END`)
          .run(addressHash, nowMs);
        const row = await db.prepare('SELECT request_count FROM browser_presence_creation_limits WHERE client_hash = ?').get(addressHash) as { request_count: number };
        await db.prepare('DELETE FROM browser_presence_creation_limits WHERE window_started_at_ms <= ?').run(nowMs - 120_000);
        return Number(row.request_count);
      })();
      if (requestCount > BROWSER_SESSION_CREATION_RATE_LIMIT) { res.status(429).json({ error: 'Browser audience session creation rate limit exceeded.' }); return; }
    }
    await db.prepare(`INSERT INTO browser_presence (session_id, refreshed_at_ms, expires_at_ms) VALUES (?, ?, ?)
      ON CONFLICT (session_id) DO UPDATE SET refreshed_at_ms = excluded.refreshed_at_ms, expires_at_ms = excluded.expires_at_ms`).run(sha256(session), nowMs, nowMs + 90_000);
    if (!hasValidSession) res.setHeader('Set-Cookie', `hs_audience=${session}; Path=/api/game-ads; Max-Age=90; SameSite=Lax; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json(await getLiveAudience(nowMs));
  });
  router.post('/audience/leave', async (req, res) => {
    const session = cookieValue(req, 'hs_audience');
    if (session && /^[\w-]{32,64}$/.test(session)) {
      await db.prepare('DELETE FROM browser_presence WHERE session_id = ?').run(sha256(session));
    }
    res.setHeader('Set-Cookie', `hs_audience=; Path=/api/game-ads; Max-Age=0; SameSite=Lax; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ ok: true });
  });

  router.post('/publishers', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    if (text(req.body?.countryCode, 2).toUpperCase() !== 'KE') { res.status(403).json({ error: 'V1 publisher onboarding is limited to Kenya.' }); return; }
    const displayName = text(req.body?.displayName || identity.name || identity.email, 100);
    const projectEvidence = text(req.body?.projectAccessEvidence, 1000);
    const serverEvidence = text(req.body?.trustedServerEvidence, 1000);
    const countryEvidence = text(req.body?.countryEvidence, 1000);
    if (countryEvidence.length < 8 || projectEvidence.length < 8 || serverEvidence.length < 8) { res.status(400).json({ error: 'Provide Kenya eligibility, project access, and trusted server deployment evidence for review.' }); return; }
    const publisher = await db.transaction(async () => {
      const record = await db.prepare(`INSERT INTO publishers
        (id, firebase_uid, email, display_name, country_code, status, project_access_evidence, trusted_server_evidence, created_at_ms)
        VALUES (?, ?, ?, ?, 'KE', 'pending', ?, ?, ?)
        ON CONFLICT (firebase_uid) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
          country_code = 'KE', status = 'pending', project_access_evidence = excluded.project_access_evidence,
          trusted_server_evidence = excluded.trusted_server_evidence, verified_at_ms = NULL, verified_by_uid = NULL
        RETURNING id, status, country_code`).get(randomId(), identity.uid, identity.email, displayName, projectEvidence, serverEvidence, Date.now()) as any;
      await db.prepare(`INSERT INTO publisher_eligibility_evidence (publisher_id, country_code, evidence_text, submitted_at_ms)
        VALUES (?, 'KE', ?, ?) ON CONFLICT (publisher_id) DO UPDATE SET country_code = 'KE', evidence_text = excluded.evidence_text, submitted_at_ms = excluded.submitted_at_ms`)
        .run(record.id, countryEvidence, Date.now());
      await db.prepare(`INSERT INTO publisher_tax_profiles (publisher_id, country_code, status, updated_at_ms)
        VALUES (?, 'KE', 'unresolved', ?) ON CONFLICT (publisher_id) DO NOTHING`).run(record.id, Date.now());
      await db.prepare('UPDATE game_server_credentials SET revoked_at_ms = ? WHERE publisher_id = ? AND revoked_at_ms IS NULL').run(Date.now(), record.id);
      await db.prepare('DELETE FROM game_presence WHERE publisher_id = ?').run(record.id);
      return record;
    })();
    res.status(202).json({ publisher });
  });

  router.get('/publishers/me', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    if (!publisher) { res.status(404).json({ error: 'Publisher profile not found.' }); return; }
    const dayStartMs = new Date(); dayStartMs.setUTCHours(0, 0, 0, 0);
    const [games, placements, serverCredentials, earnings, recoveryBalance, payouts, taxProfile, gate] = await Promise.all([
      db.prepare('SELECT id, name, platform, max_players_per_server, status, created_at_ms FROM games WHERE publisher_id = ? ORDER BY created_at_ms DESC').all(publisher.id),
      db.prepare(`SELECT pl.id, pl.game_id, pl.name, pl.aspect_ratio, pl.enabled,
        COALESCE(SUM(i.viewable_count), 0) AS viewable_impressions_today
        FROM placements pl JOIN games g ON g.id = pl.game_id
        LEFT JOIN game_viewable_impressions i ON i.placement_id = pl.id AND i.window_started_at_ms >= ?
        WHERE g.publisher_id = ? GROUP BY pl.id ORDER BY pl.created_at_ms DESC`).all(dayStartMs.getTime(), publisher.id),
      db.prepare(`SELECT c.id, c.game_id, b.server_id, c.created_at_ms, c.last_used_at_ms FROM game_server_credentials c
        JOIN game_server_credential_bindings b ON b.credential_id = c.id
        WHERE c.publisher_id = ? AND c.revoked_at_ms IS NULL ORDER BY c.created_at_ms DESC`).all(publisher.id),
      db.prepare(`SELECT COALESCE(SUM(gross_share_cents), 0) AS gross_share_cents,
        COALESCE(SUM(withholding_cents), 0) AS withholding_cents, COALESCE(SUM(net_payable_cents), 0) AS net_payable_cents
        FROM publisher_share_accruals WHERE publisher_id = ?`).get(publisher.id) as Promise<{ gross_share_cents: number; withholding_cents: number; net_payable_cents: number }>,
      db.prepare(`SELECT COALESCE(SUM(a.amount_cents - COALESCE((SELECT SUM(i.amount_cents)
        FROM publisher_payout_adjustment_items i JOIN publisher_payouts p ON p.id = i.payout_id
        WHERE i.adjustment_id = a.id AND p.status = 'paid'), 0)), 0) AS recovery_balance_cents
        FROM publisher_share_adjustments a WHERE a.publisher_id = ?`).get(publisher.id) as Promise<{ recovery_balance_cents: number }>,
      db.prepare('SELECT id, period, currency, amount_cents, status, failure_reason FROM publisher_payouts WHERE publisher_id = ? ORDER BY created_at_ms DESC').all(publisher.id),
      db.prepare(`SELECT t.status, t.tax_details_ciphertext, s.withholding_bps FROM publisher_tax_profiles t
        LEFT JOIN publisher_tax_settings s ON s.publisher_id = t.publisher_id WHERE t.publisher_id = ?`).get(publisher.id) as any,
      payoutGate(),
    ]);
    const taxReadiness = taxProfile?.status === 'verified' && Boolean(taxProfile?.tax_details_ciphertext)
      && taxProfile?.withholding_bps !== null && taxProfile?.withholding_bps !== undefined
      ? 'verified' : 'unresolved';
    res.json({ publisher: { id: publisher.id, email: publisher.email, displayName: publisher.display_name, countryCode: publisher.country_code, status: publisher.status, payoutRecipientConfigured: Boolean(publisher.paypal_email_ciphertext) }, games, placements, serverCredentials, earnings: { ...earnings, ...recoveryBalance }, payouts, taxReadiness, payoutGate: gate });
  });

  router.put('/publishers/me/payout-recipient', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    if (!publisher || publisher.status !== 'verified') { res.status(403).json({ error: 'Publisher review must pass before payout details can be saved.' }); return; }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 127 || !/^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid PayPal email address.' }); return;
    }
    if (!publisherPiiKey()) { res.status(503).json({ error: 'Secure publisher payout detail storage is not configured.' }); return; }
    const ciphertext = encryptPublisherEmail(email);
    const nowMs = Date.now();
    await db.transaction(async () => {
      await db.prepare('UPDATE publishers SET paypal_email_ciphertext = ? WHERE id = ?').run(ciphertext, publisher.id);
    })();
    const gate = await payoutGate();
    if (gate.enabled) {
      await db.prepare(`UPDATE publisher_payouts SET status = 'payable', paypal_batch_id = NULL, failure_reason = '', updated_at_ms = ?
        WHERE publisher_id = ? AND amount_cents >= ? AND status IN ('failed', 'returned', 'unclaimed', 'blocked')
          AND EXISTS (SELECT 1 FROM publisher_tax_profiles tax JOIN publisher_tax_settings settings ON settings.publisher_id = tax.publisher_id
            WHERE tax.publisher_id = publisher_payouts.publisher_id AND tax.status = 'verified' AND tax.tax_details_ciphertext <> '')`)
        .run(nowMs, publisher.id, MONTHLY_PAYOUT_MINIMUM_CENTS);
    }
    await refreshOpenPublisherPayoutStatuses(gate, nowMs);
    res.json({ ok: true, payoutRecipientConfigured: true });
  });

  router.post('/games', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    if (!publisher || publisher.status !== 'verified') { res.status(403).json({ error: 'Publisher review must be complete before registering a game.' }); return; }
    const name = text(req.body?.name, 100);
    const platform = text(req.body?.platform, 20).toLowerCase();
    const maxPlayers = Number(req.body?.maxPlayersPerServer);
    const projectEvidence = text(req.body?.projectEvidence, 1000);
    if (!name || !['unity', 'unreal', 'godot'].includes(platform)) { res.status(400).json({ error: 'Game name and Unity, Unreal Engine, or Godot platform are required.' }); return; }
    if (!Number.isSafeInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 10_000 || projectEvidence.length < 8) { res.status(400).json({ error: 'Provide a server player cap from 1 to 10000 and project evidence.' }); return; }
    const id = randomId();
    await db.prepare(`INSERT INTO games (id, publisher_id, name, platform, max_players_per_server, project_evidence, status, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(id, publisher.id, name, platform, maxPlayers, projectEvidence, Date.now());
    res.status(202).json({ id, status: 'pending' });
  });

  router.post('/games/:gameId/placements', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    const game = publisher ? await db.prepare('SELECT id, status FROM games WHERE id = ? AND publisher_id = ?').get(req.params.gameId, publisher.id) as any : null;
    if (!game || game.status !== 'verified') { res.status(403).json({ error: 'Game must be reviewed before placements can be registered.' }); return; }
    const name = text(req.body?.name, 100);
    const aspectRatio = Number(req.body?.aspectRatio ?? 2);
    if (!name || !Number.isFinite(aspectRatio) || aspectRatio < 0.5 || aspectRatio > 10) { res.status(400).json({ error: 'Placement name and aspect ratio from 0.5 to 10 are required.' }); return; }
    const id = randomId();
    await db.prepare('INSERT INTO placements (id, game_id, name, aspect_ratio, enabled, created_at_ms) VALUES (?, ?, ?, ?, 0, ?)').run(id, game.id, name, aspectRatio, Date.now());
    res.status(202).json({ id, enabled: false });
  });

  router.post('/games/:gameId/credentials', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    const game = publisher ? await db.prepare('SELECT id, status FROM games WHERE id = ? AND publisher_id = ?').get(req.params.gameId, publisher.id) as any : null;
    if (!hasDurableStorage) { res.status(503).json({ error: 'Trusted server credentials require durable Neon storage.' }); return; }
    if (!publisher || publisher.status !== 'verified' || !game || game.status !== 'verified' || !publisher.project_access_evidence || !publisher.trusted_server_evidence) {
      res.status(403).json({ error: 'Project access and trusted server deployment must be reviewed before credentials are issued.' }); return;
    }
    const enabledPlacement = await db.prepare('SELECT id FROM placements WHERE game_id = ? AND enabled = 1 LIMIT 1').get(game.id);
    if (!enabledPlacement) { res.status(403).json({ error: 'At least one game placement must be approved and enabled before credentials are issued.' }); return; }
    const serverId = text(req.body?.serverId, 100);
    if (!/^[\w.:-]{1,100}$/.test(serverId)) { res.status(400).json({ error: 'Provide a stable server identifier for this credential.' }); return; }
    const nowMs = Date.now();
    const credential = `hs_live_${crypto.randomBytes(32).toString('base64url')}`;
    const id = randomId();
    await db.transaction(async () => {
      await db.prepare(`UPDATE game_server_credentials SET revoked_at_ms = ? WHERE game_id = ? AND revoked_at_ms IS NULL
        AND id IN (SELECT credential_id FROM game_server_credential_bindings WHERE server_id = ?)`).run(nowMs, game.id, serverId);
      await db.prepare('INSERT INTO game_server_credentials (id, publisher_id, game_id, token_hash, created_at_ms) VALUES (?, ?, ?, ?, ?)').run(id, publisher.id, game.id, sha256(credential), nowMs);
      await db.prepare(`INSERT INTO game_server_credential_bindings (credential_id, publisher_id, game_id, server_id, created_at_ms)
        VALUES (?, ?, ?, ?, ?)`).run(id, publisher.id, game.id, serverId, nowMs);
    })();
    res.status(201).json({ id, serverId, credential, shownOnce: true });
  });

  router.post('/credentials/:credentialId/revoke', async (req, res) => {
    const identity = await getIdentity(req, res); if (!identity) return;
    const publisher = await getPublisher(identity);
    if (!publisher) { res.status(404).json({ error: 'Publisher profile not found.' }); return; }
    const nowMs = Date.now();
    const result = await db.prepare('UPDATE game_server_credentials SET revoked_at_ms = ? WHERE id = ? AND publisher_id = ? AND revoked_at_ms IS NULL').run(nowMs, req.params.credentialId, publisher.id) as { changes?: number };
    if (!result.changes) { res.status(404).json({ error: 'Active server credential not found.' }); return; }
    await db.prepare('DELETE FROM game_presence WHERE publisher_id = ?').run(publisher.id);
    res.json({ ok: true, revokedAtMs: nowMs });
  });

  router.post('/games/:gameId/presence', async (req, res) => {
    const match = /^Bearer\s+(hs_live_[\w-]{32,64})$/i.exec(req.header('authorization') || '');
    if (!match) { res.status(401).json({ error: 'A trusted game server credential is required.' }); return; }
    const credential = await db.prepare(`SELECT c.id, c.publisher_id, c.game_id, b.server_id, p.status AS publisher_status,
      g.status AS game_status, g.max_players_per_server FROM game_server_credentials c
      JOIN game_server_credential_bindings b ON b.credential_id = c.id
      JOIN publishers p ON p.id = c.publisher_id JOIN games g ON g.id = c.game_id
      WHERE c.token_hash = ? AND c.revoked_at_ms IS NULL`).get(sha256(match[1])) as any;
    if (!credential || credential.game_id !== req.params.gameId || credential.publisher_status !== 'verified' || credential.game_status !== 'verified') {
      res.status(401).json({ error: 'Credential is invalid, revoked, or not approved for this game.' }); return;
    }
    const serverId = text(req.body?.serverId, 100);
    if (!/^[\w.:-]{1,100}$/.test(serverId) || serverId !== credential.server_id) { res.status(403).json({ error: 'Heartbeat server identifier does not match this server credential.' }); return; }
    const nowMs = Date.now();
    const observedAt = req.body?.observedAt;
    const observedAtMs = typeof observedAt === 'number' ? observedAt : Date.parse(String(observedAt || ''));
    if (!Number.isFinite(observedAtMs) || Math.abs(nowMs - observedAtMs) > 120_000) { res.status(400).json({ error: 'Presence timestamp must be within two minutes of server time.' }); return; }
    await db.prepare(`INSERT INTO game_heartbeat_limits (publisher_id, game_id, server_id, window_started_at_ms, request_count)
      VALUES (?, ?, ?, ?, 1) ON CONFLICT (publisher_id, game_id, server_id) DO UPDATE SET
      request_count = CASE WHEN excluded.window_started_at_ms - game_heartbeat_limits.window_started_at_ms >= 60000 THEN 1 ELSE game_heartbeat_limits.request_count + 1 END,
      window_started_at_ms = CASE WHEN excluded.window_started_at_ms - game_heartbeat_limits.window_started_at_ms >= 60000 THEN excluded.window_started_at_ms ELSE game_heartbeat_limits.window_started_at_ms END`)
      .run(credential.publisher_id, credential.game_id, serverId, nowMs);
    const limit = await db.prepare('SELECT request_count FROM game_heartbeat_limits WHERE publisher_id = ? AND game_id = ? AND server_id = ?')
      .get(credential.publisher_id, credential.game_id, serverId) as { request_count: number };
    if (Number(limit.request_count) > PRESENCE_RATE_LIMIT) { res.status(429).json({ error: 'Server heartbeat rate limit exceeded.' }); return; }
    const activePlayers = req.body?.activePlayers;
    const previous = await db.prepare(`SELECT accepted_players, accepted_at_ms, expires_at_ms, flagged_at_ms FROM game_presence
      WHERE publisher_id = ? AND game_id = ? AND server_id = ?`).get(credential.publisher_id, credential.game_id, serverId) as any;
    const validPrevious = previous && Number(previous.expires_at_ms) > nowMs;
    const decision = decideHeartbeat({ activePlayers, observedAt, maxPlayersPerServer: Number(credential.max_players_per_server),
      previousAcceptedPlayers: validPrevious ? Number(previous.accepted_players) : undefined,
      previousAcceptedAtMs: validPrevious ? Number(previous.accepted_at_ms) : undefined, receivedAtMs: nowMs });
    if (!decision.accepted) { res.status(400).json({ error: decision.reason }); return; }
    await db.prepare('UPDATE game_server_credentials SET last_used_at_ms = ? WHERE id = ?').run(nowMs, credential.id);
    if (previous?.flagged_at_ms) {
      await db.prepare('UPDATE game_presence SET pending_players = ? WHERE publisher_id = ? AND game_id = ? AND server_id = ?').run(activePlayers, credential.publisher_id, credential.game_id, serverId);
      await db.prepare(`UPDATE game_presence_review_events SET submitted_players = ? WHERE publisher_id = ? AND game_id = ? AND server_id = ? AND status = 'pending'`)
        .run(activePlayers, credential.publisher_id, credential.game_id, serverId);
      res.status(202).json({ accepted: false, reviewRequired: true }); return;
    }
    if (decision.flagged) {
      await db.transaction(async () => {
        await db.prepare(`INSERT INTO game_presence (publisher_id, game_id, server_id, accepted_players, accepted_at_ms, expires_at_ms, pending_players, flagged_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (publisher_id, game_id, server_id)
          DO UPDATE SET pending_players = excluded.pending_players, flagged_at_ms = excluded.flagged_at_ms`)
          .run(credential.publisher_id, credential.game_id, serverId, previous.accepted_players, previous.accepted_at_ms, previous.expires_at_ms, activePlayers, nowMs);
        await db.prepare(`INSERT INTO game_presence_review_events (id, publisher_id, game_id, server_id, submitted_players, previous_players, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomId(), credential.publisher_id, credential.game_id, serverId, activePlayers, previous.accepted_players, nowMs);
      })();
      res.status(202).json({ accepted: false, reviewRequired: true, expiresAtMs: decision.expiresAtMs }); return;
    }
    await db.prepare(`INSERT INTO game_presence (publisher_id, game_id, server_id, accepted_players, accepted_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (publisher_id, game_id, server_id)
      DO UPDATE SET accepted_players = excluded.accepted_players, accepted_at_ms = excluded.accepted_at_ms,
                    expires_at_ms = excluded.expires_at_ms, pending_players = NULL, flagged_at_ms = NULL`)
      .run(credential.publisher_id, credential.game_id, serverId, activePlayers, nowMs, decision.expiresAtMs);
    res.json({ accepted: true, expiresAtMs: decision.expiresAtMs });
  });

  router.post('/placements/:placementId/impressions', async (req, res) => {
    const match = /^Bearer\s+(hs_live_[\w-]{32,64})$/i.exec(req.header('authorization') || '');
    if (!match) { res.status(401).json({ error: 'A trusted game server credential is required.' }); return; }
    const credential = await db.prepare(`SELECT c.id, c.publisher_id, c.game_id, b.server_id, g.max_players_per_server
      FROM game_server_credentials c JOIN game_server_credential_bindings b ON b.credential_id = c.id
      JOIN publishers p ON p.id = c.publisher_id AND p.status = 'verified'
      JOIN games g ON g.id = c.game_id AND g.status = 'verified'
      WHERE c.token_hash = ? AND c.revoked_at_ms IS NULL`).get(sha256(match[1])) as any;
    if (!credential) { res.status(401).json({ error: 'Credential is invalid, revoked, or not approved.' }); return; }
    const placement = await db.prepare(`SELECT id FROM placements WHERE id = ? AND game_id = ? AND enabled = 1`)
      .get(req.params.placementId, credential.game_id);
    if (!placement) { res.status(404).json({ error: 'Enabled placement for this game not found.' }); return; }
    const serverId = text(req.body?.serverId, 100);
    const observedAt = req.body?.observedAt;
    const observedAtMs = typeof observedAt === 'number' ? observedAt : Date.parse(String(observedAt || ''));
    const viewableCount = req.body?.viewableCount;
    const nowMs = Date.now();
    if (!/^[\w.:-]{1,100}$/.test(serverId) || serverId !== credential.server_id) {
      res.status(403).json({ error: 'Impression server identifier does not match this server credential.' }); return;
    }
    if (!Number.isFinite(observedAtMs) || Math.abs(nowMs - observedAtMs) > 120_000) {
      res.status(400).json({ error: 'Impression timestamp must be within two minutes of server time.' }); return;
    }
    if (!Number.isSafeInteger(viewableCount) || viewableCount < 0 || viewableCount > 100_000) {
      res.status(400).json({ error: 'Viewable count must be a non-negative integer no greater than 100000.' }); return;
    }
    const windowStartedAtMs = Math.floor(nowMs / 30_000) * 30_000;
    await db.prepare(`INSERT INTO game_heartbeat_limits (publisher_id, game_id, server_id, window_started_at_ms, request_count)
      VALUES (?, ?, ?, ?, 1) ON CONFLICT (publisher_id, game_id, server_id) DO UPDATE SET
      request_count = CASE WHEN excluded.window_started_at_ms - game_heartbeat_limits.window_started_at_ms >= 60000 THEN 1 ELSE game_heartbeat_limits.request_count + 1 END,
      window_started_at_ms = CASE WHEN excluded.window_started_at_ms - game_heartbeat_limits.window_started_at_ms >= 60000 THEN excluded.window_started_at_ms ELSE game_heartbeat_limits.window_started_at_ms END`)
      .run(credential.publisher_id, credential.game_id, serverId, nowMs);
    const requestLimit = await db.prepare('SELECT request_count FROM game_heartbeat_limits WHERE publisher_id = ? AND game_id = ? AND server_id = ?')
      .get(credential.publisher_id, credential.game_id, serverId) as { request_count: number };
    if (Number(requestLimit.request_count) > PRESENCE_RATE_LIMIT) { res.status(429).json({ error: 'Server report rate limit exceeded.' }); return; }
    await db.prepare(`INSERT INTO game_viewable_impressions (placement_id, server_id, window_started_at_ms, viewable_count, reported_at_ms)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (placement_id, server_id, window_started_at_ms)
      DO UPDATE SET viewable_count = excluded.viewable_count, reported_at_ms = excluded.reported_at_ms`)
      .run(req.params.placementId, serverId, windowStartedAtMs, viewableCount, nowMs);
    await db.prepare('UPDATE game_server_credentials SET last_used_at_ms = ? WHERE id = ?').run(nowMs, credential.id);
    res.json({ accepted: true, windowStartedAtMs, viewableCount });
  });

  router.get('/placements/:placementId/creative', async (req, res) => {
    const placement = await db.prepare(`SELECT pl.id, pl.aspect_ratio FROM placements pl
      JOIN games g ON g.id = pl.game_id AND g.status = 'verified'
      JOIN publishers p ON p.id = g.publisher_id AND p.status = 'verified'
      WHERE pl.id = ? AND pl.enabled = 1`).get(req.params.placementId) as any;
    if (!placement) { res.status(404).json({ error: 'Verified, enabled game placement not found.' }); return; }
    const current = await db.prepare('SELECT * FROM active_creatives WHERE id = 1 AND valid_until_ms > ?').get(Date.now()) as any;
    const isLive = Boolean(current);
    const creativeId = isLive ? current.creative_id : 'hotseat-fallback';
    const revision = isLive ? current.revision : 'v1';
    const validUntilMs = isLive ? Number(current.valid_until_ms) : Date.now() + 300_000;
    const manifest = toCreativeManifest({ placementId: placement.id, creativeId, revision,
      assetUrl: `/api/game-ads/assets/${encodeURIComponent(creativeId)}/${encodeURIComponent(revision)}.png`,
      aspectRatio: Number(placement.aspect_ratio), companyName: isLive ? current.company_name : 'Hot Seat',
      headline: isLive ? current.headline : 'SAFE MODE', validUntil: new Date(validUntilMs).toISOString() });
    res.setHeader('Cache-Control', `public, max-age=${CREATIVE_REFRESH_SECONDS}`);
    res.json(manifest);
  });

  router.get('/assets/:creativeId/:revision.png', async (req, res) => {
    const row = req.params.creativeId === 'hotseat-fallback' ? null : await db.prepare('SELECT * FROM active_creatives WHERE id = 1 AND creative_id = ? AND revision = ?')
      .get(req.params.creativeId, req.params.revision) as any;
    const live = Boolean(row && Number(row.valid_until_ms) > Date.now());
    const asset: Buffer = live && Buffer.isBuffer(row.asset_data) && row.asset_data.length
      ? row.asset_data
      : await renderCreative(live
        ? { companyName: row.company_name, headline: row.headline, sprayColor: row.spray_color, textColor: row.text_color }
        : { companyName: 'Hot Seat', headline: 'SAFE MODE', sprayColor: '#161616', textColor: '#ffffff' });
    if (live && (!Buffer.isBuffer(row.asset_data) || row.asset_data.length === 0)) await db.prepare('UPDATE active_creatives SET asset_data = ? WHERE id = 1 AND revision = ?').run(asset, row.revision);
    const etag = `"${sha256(asset.toString('base64'))}"`;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', live ? `public, max-age=${Math.max(0, Math.floor((Number(row.valid_until_ms) - Date.now()) / 1000))}, immutable` : 'public, max-age=60');
    res.setHeader('ETag', etag);
    if (req.header('if-none-match') === etag) { res.status(304).end(); return; }
    res.send(asset);
  });

  router.get('/admin/pricing', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    res.json({ tiers: await getAudiencePricingTiers() });
  });

  router.put('/admin/pricing', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const tiers = req.body?.tiers;
    if (!isAudiencePricingTiers(tiers)) { res.status(400).json({ error: 'Pricing tiers must be contiguous, non-negative audience bands ending in an open-ended tier.' }); return; }
    await db.prepare(`INSERT INTO game_ads_pricing_config (id, tiers_json, updated_at_ms) VALUES (1, ?, ?)
      ON CONFLICT (id) DO UPDATE SET tiers_json = excluded.tiers_json, updated_at_ms = excluded.updated_at_ms`)
      .run(JSON.stringify(tiers), Date.now());
    res.json({ ok: true, tiers });
  });

  router.get('/admin/reviews', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const [publishers, games, placements] = await Promise.all([
      db.prepare(`SELECT p.id, p.email, p.display_name, p.country_code, p.project_access_evidence, p.trusted_server_evidence,
          e.evidence_text AS country_eligibility_evidence, p.created_at_ms
        FROM publishers p LEFT JOIN publisher_eligibility_evidence e ON e.publisher_id = p.id
        WHERE p.status = 'pending' ORDER BY p.created_at_ms ASC LIMIT 100`).all(),
      db.prepare(`SELECT g.id, g.publisher_id, g.name, g.platform, g.max_players_per_server, g.project_evidence, g.created_at_ms
        FROM games g JOIN publishers p ON p.id = g.publisher_id WHERE g.status = 'pending' AND p.status = 'verified'
        ORDER BY g.created_at_ms ASC LIMIT 100`).all(),
      db.prepare(`SELECT pl.id, pl.game_id, pl.name, pl.aspect_ratio, pl.created_at_ms
        FROM placements pl JOIN games g ON g.id = pl.game_id JOIN publishers p ON p.id = g.publisher_id
        WHERE pl.enabled = 0 AND g.status = 'verified' AND p.status = 'verified'
        ORDER BY pl.created_at_ms ASC LIMIT 100`).all(),
    ]);
    res.json({ publishers, games, placements });
  });

  router.post('/admin/publishers/:publisherId/review', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const status = req.body?.status;
    if (!['verified', 'rejected'].includes(status)) { res.status(400).json({ error: 'Review status must be verified or rejected.' }); return; }
    const publisher = await db.prepare(`SELECT p.*, e.evidence_text AS country_eligibility_evidence
      FROM publishers p LEFT JOIN publisher_eligibility_evidence e ON e.publisher_id = p.id
      WHERE p.id = ? AND p.country_code = ?`).get(req.params.publisherId, 'KE') as any;
    if (!publisher) { res.status(404).json({ error: 'Kenya publisher not found.' }); return; }
    if (status === 'verified' && (!publisher.country_eligibility_evidence || publisher.country_eligibility_evidence.length < 8 || !publisher.project_access_evidence || !publisher.trusted_server_evidence)) { res.status(409).json({ error: 'Kenya eligibility, project access, and trusted server evidence must be reviewed before approval.' }); return; }
    await db.transaction(async () => {
      await db.prepare('UPDATE publishers SET status = ?, verified_at_ms = ?, verified_by_uid = ? WHERE id = ?')
        .run(status, status === 'verified' ? Date.now() : null, identity.uid, publisher.id);
      if (status !== 'verified') {
        await db.prepare('UPDATE game_server_credentials SET revoked_at_ms = ? WHERE publisher_id = ? AND revoked_at_ms IS NULL').run(Date.now(), publisher.id);
        await db.prepare('DELETE FROM game_presence WHERE publisher_id = ?').run(publisher.id);
      }
    })();
    res.json({ ok: true, status });
  });

  router.post('/admin/publishers/:publisherId/tax-readiness', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const status = req.body?.status;
    if (!['unresolved', 'verified'].includes(status)) { res.status(400).json({ error: 'Tax readiness status must be unresolved or verified.' }); return; }
    const publisher = await db.prepare("SELECT id FROM publishers WHERE id = ? AND country_code = 'KE'").get(req.params.publisherId) as { id: string } | undefined;
    if (!publisher) { res.status(404).json({ error: 'Kenya publisher not found.' }); return; }
    const nowMs = Date.now();
    const rawEvidence = req.body?.taxEvidence;
    const taxEvidence = typeof rawEvidence === 'string' ? rawEvidence.trim() : '';
    const withholdingBps = req.body?.withholdingBps;
    let encryptedEvidence = '';
    if (status === 'verified') {
      if (taxEvidence.length < 8 || taxEvidence.length > 8_000 || !Number.isSafeInteger(withholdingBps) || withholdingBps < 0 || withholdingBps > 10_000) {
        res.status(400).json({ error: 'Tax evidence and an explicit withholding rate in basis points from 0 to 10000 are required.' }); return;
      }
      const key = publisherPiiKey();
      if (!key) { res.status(503).json({ error: 'Publisher tax evidence encryption is not configured.' }); return; }
      encryptedEvidence = encryptPublisherText(taxEvidence, key);
    }
    await db.transaction(async () => {
      if (status === 'verified') {
        await db.prepare(`INSERT INTO publisher_tax_profiles (publisher_id, country_code, status, tax_details_ciphertext, updated_at_ms, reviewed_by_uid)
          VALUES (?, 'KE', 'verified', ?, ?, ?) ON CONFLICT (publisher_id) DO UPDATE SET status = 'verified',
          tax_details_ciphertext = excluded.tax_details_ciphertext, updated_at_ms = excluded.updated_at_ms, reviewed_by_uid = excluded.reviewed_by_uid`)
          .run(publisher.id, encryptedEvidence, nowMs, identity.uid);
        await db.prepare(`INSERT INTO publisher_tax_settings (publisher_id, withholding_bps, updated_at_ms, reviewed_by_uid)
          VALUES (?, ?, ?, ?) ON CONFLICT (publisher_id) DO UPDATE SET withholding_bps = excluded.withholding_bps,
          updated_at_ms = excluded.updated_at_ms, reviewed_by_uid = excluded.reviewed_by_uid`)
          .run(publisher.id, withholdingBps, nowMs, identity.uid);
        const accruals = await db.prepare(`SELECT id, player_hours, gross_share_cents FROM publisher_share_accruals WHERE publisher_id = ?`)
          .all(publisher.id) as Array<{ id: string; player_hours: number; gross_share_cents: number }>;
        for (const accrual of accruals) {
          const grossCents = Number(accrual.gross_share_cents);
          const withholdingCents = Math.round(grossCents * Number(withholdingBps) / 10_000);
          await updateAccrualEntitlement({
            accrualId: accrual.id, publisherId: publisher.id, playerHours: Number(accrual.player_hours), grossCents,
            withholdingCents, netCents: grossCents - withholdingCents, nowMs,
          });
        }
      } else {
        await db.prepare(`INSERT INTO publisher_tax_profiles (publisher_id, country_code, status, updated_at_ms, reviewed_by_uid)
          VALUES (?, 'KE', 'unresolved', ?, ?) ON CONFLICT (publisher_id) DO UPDATE SET status = 'unresolved',
          updated_at_ms = excluded.updated_at_ms, reviewed_by_uid = excluded.reviewed_by_uid`)
          .run(publisher.id, nowMs, identity.uid);
      }
    });
    const gate = await payoutGate();
    if (status === 'verified' && gate.enabled) {
      await db.prepare(`UPDATE publisher_payouts SET status = 'payable', failure_reason = '', updated_at_ms = ?
        WHERE publisher_id = ? AND status = 'blocked' AND failure_reason = '' AND amount_cents >= ?
          AND EXISTS (SELECT 1 FROM publishers WHERE id = ? AND paypal_email_ciphertext <> '')`)
        .run(nowMs, publisher.id, MONTHLY_PAYOUT_MINIMUM_CENTS, publisher.id);
    }
    await refreshOpenPublisherPayoutStatuses(gate, nowMs);
    res.json({ ok: true, status, withholdingBps: status === 'verified' ? withholdingBps : undefined, reviewedBy: identity.uid });
  });

  router.post('/admin/payouts/:payoutId/retry', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const payout = await db.prepare(`SELECT p.id, p.publisher_id, p.amount_cents, p.status, pub.status AS publisher_status,
        pub.paypal_email_ciphertext, tax.status AS tax_status, tax.tax_details_ciphertext, settings.withholding_bps
      FROM publisher_payouts p JOIN publishers pub ON pub.id = p.publisher_id
      LEFT JOIN publisher_tax_profiles tax ON tax.publisher_id = pub.id
      LEFT JOIN publisher_tax_settings settings ON settings.publisher_id = pub.id WHERE p.id = ?`)
      .get(req.params.payoutId) as any;
    if (!payout) { res.status(404).json({ error: 'Publisher payout record not found.' }); return; }
    if (!['failed', 'returned', 'unclaimed', 'blocked'].includes(payout.status) || Number(payout.amount_cents) < MONTHLY_PAYOUT_MINIMUM_CENTS) {
      res.status(409).json({ error: 'Only failed, returned, unclaimed, or blocked payouts at the $10 minimum can be retried.' }); return;
    }
    if (payout.publisher_status !== 'verified' || payout.tax_status !== 'verified' || !payout.tax_details_ciphertext
      || !Number.isSafeInteger(Number(payout.withholding_bps)) || !payout.paypal_email_ciphertext) {
      res.status(409).json({ error: 'Verified publisher, reviewed tax readiness, and a saved payout recipient are required.' }); return;
    }
    if (!(await payoutGate()).enabled) { res.status(409).json({ error: 'Production payout gates are not ready.' }); return; }
    await db.prepare(`UPDATE publisher_payouts SET status = 'payable', paypal_batch_id = NULL, failure_reason = '', updated_at_ms = ? WHERE id = ?`)
      .run(Date.now(), payout.id);
    res.json({ ok: true, status: 'payable', reviewedBy: identity.uid });
  });

  router.post('/admin/games/:gameId/review', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const status = req.body?.status;
    if (!['verified', 'rejected'].includes(status)) { res.status(400).json({ error: 'Review status must be verified or rejected.' }); return; }
    const game = await db.prepare(`SELECT g.*, p.status AS publisher_status, p.project_access_evidence, p.trusted_server_evidence
      FROM games g JOIN publishers p ON p.id = g.publisher_id WHERE g.id = ?`).get(req.params.gameId) as any;
    if (!game) { res.status(404).json({ error: 'Game not found.' }); return; }
    if (status === 'verified') {
      const cap = Number.isSafeInteger(req.body?.maxPlayersPerServer) ? req.body.maxPlayersPerServer : Number(game.max_players_per_server);
      if (game.publisher_status !== 'verified' || !game.project_evidence || !game.project_access_evidence || !game.trusted_server_evidence || cap < 1 || cap > 10_000) {
        res.status(409).json({ error: 'Verified publisher, project access, trusted server deployment, and reviewed player cap are required.' }); return;
      }
      await db.prepare('UPDATE games SET status = ?, max_players_per_server = ?, verified_at_ms = ? WHERE id = ?').run(status, cap, Date.now(), game.id);
    } else {
      await db.transaction(async () => {
        await db.prepare('UPDATE games SET status = ? WHERE id = ?').run(status, game.id);
        await db.prepare('UPDATE game_server_credentials SET revoked_at_ms = ? WHERE game_id = ? AND revoked_at_ms IS NULL').run(Date.now(), game.id);
        await db.prepare('DELETE FROM game_presence WHERE game_id = ?').run(game.id);
      })();
    }
    res.json({ ok: true, status });
  });

  router.post('/admin/placements/:placementId/review', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    if (typeof req.body?.enabled !== 'boolean') { res.status(400).json({ error: 'enabled must be a boolean.' }); return; }
    const placement = await db.prepare(`SELECT pl.id, g.status AS game_status, p.status AS publisher_status FROM placements pl
      JOIN games g ON g.id = pl.game_id JOIN publishers p ON p.id = g.publisher_id WHERE pl.id = ?`).get(req.params.placementId) as any;
    if (!placement) { res.status(404).json({ error: 'Placement not found.' }); return; }
    if (req.body.enabled && (placement.game_status !== 'verified' || placement.publisher_status !== 'verified')) { res.status(409).json({ error: 'Publisher and game review must pass before a placement is enabled.' }); return; }
    await db.prepare('UPDATE placements SET enabled = ? WHERE id = ?').run(req.body.enabled ? 1 : 0, placement.id);
    res.json({ ok: true, enabled: req.body.enabled });
  });

  router.get('/admin/presence-reviews', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const reviews = await db.prepare(`SELECT r.id, r.game_id, r.server_id, r.submitted_players, r.previous_players, r.created_at_ms,
      p.display_name AS publisher_name, g.name AS game_name FROM game_presence_review_events r
      JOIN publishers p ON p.id = r.publisher_id JOIN games g ON g.id = r.game_id
      WHERE r.status = 'pending' ORDER BY r.created_at_ms ASC LIMIT 100`).all();
    res.json({ reviews });
  });

  router.post('/admin/presence-reviews/:reviewId', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    const accept = req.body?.accept;
    if (typeof accept !== 'boolean') { res.status(400).json({ error: 'accept must be a boolean.' }); return; }
    const event = await db.prepare("SELECT * FROM game_presence_review_events WHERE id = ? AND status = 'pending'").get(req.params.reviewId) as any;
    if (!event) { res.status(404).json({ error: 'Pending presence review not found.' }); return; }
    const nowMs = Date.now();
    await db.transaction(async () => {
      if (accept) await db.prepare(`UPDATE game_presence SET accepted_players = ?, accepted_at_ms = ?, expires_at_ms = ?, pending_players = NULL, flagged_at_ms = NULL
        WHERE publisher_id = ? AND game_id = ? AND server_id = ?`).run(event.submitted_players, nowMs, nowMs + 90_000, event.publisher_id, event.game_id, event.server_id);
      else await db.prepare('UPDATE game_presence SET pending_players = NULL, flagged_at_ms = NULL WHERE publisher_id = ? AND game_id = ? AND server_id = ?').run(event.publisher_id, event.game_id, event.server_id);
      await db.prepare('UPDATE game_presence_review_events SET status = ?, reviewed_at_ms = ?, reviewed_by_uid = ? WHERE id = ?')
        .run(accept ? 'accepted' : 'rejected', nowMs, identity.uid, event.id);
    })();
    res.json({ ok: true, accepted: accept });
  });

  router.get('/admin/payout-gate', async (req, res) => {
    const identity = await getIdentity(req, res, true); if (!identity) return;
    res.json(await payoutGate());
  });

  router.get('/cron/reconcile', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.header('authorization') !== `Bearer ${secret}`) { res.status(401).json({ error: 'Monthly reconciliation authorization is required.' }); return; }
    if (!hasDurableStorage) { res.status(503).json({ error: 'Monthly reconciliation requires durable Neon storage.' }); return; }
    const lock = await tryAcquireRevenueReconciliationLock();
    if (!lock) { res.status(409).json({ error: 'Monthly revenue reconciliation is already running.' }); return; }
    try { res.json(await reconcileMonthlyRevenue()); }
    finally { await lock.release(); }
  });

  router.get('/cron/payouts', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.header('authorization') !== `Bearer ${secret}`) { res.status(401).json({ error: 'Publisher payout authorization is required.' }); return; }
    if (!hasDurableStorage) { res.status(503).json({ error: 'Publisher payouts require durable Neon storage.' }); return; }
    res.json(await dispatchPublisherPayouts());
  });

  return router;
}
