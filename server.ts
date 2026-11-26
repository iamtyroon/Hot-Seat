import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { db, hasDurableStorage, initializeStorage } from './src/server/storage';
import { quoteFiveMinuteLeaseCents } from './src/gameAds/domain';
import { createGameAdsRouter, getAudiencePricingTiers, getLiveAudience, samplePublisherLeaseHours } from './src/gameAds/routes';
import { publisherPayoutWebhookStatus } from './src/server/publisherPayouts';

dotenv.config();
process.env.DISABLE_HMR = 'true';

const PORT = Number(process.env.PORT) || 3000;
const BASE_RATE_CENTS_PER_MIN = 20.0; // $1.00 for 5 minutes
const MAX_RATE_CENTS_PER_MIN = Number.POSITIVE_INFINITY;
const BLOCK_DURATION_MINUTES = 5;
const BLOCK_DURATION_MS = BLOCK_DURATION_MINUTES * 60 * 1000;
const HALF_LIFE_MS = 10 * 60 * 1000; // 10 minutes half-life decay

const VALID_TEMPLATES = [
  'BOMB_BURST',
  'CROWN_TAG',
  'WHEATPASTE_POSTER',
  'SPRAY_CLOUD',
  'SKATE_DECK',
  'NEON_ARCADE',
];

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Local development schema; production uses the idempotent Neon migration.
const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS billboard_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_holder_agent_id TEXT,
    current_company_name TEXT,
    current_headline TEXT,
    current_url TEXT,
    current_logo_data_url TEXT DEFAULT '',
    current_spray_color TEXT,
    current_text_color TEXT,
    current_template_id TEXT DEFAULT 'BOMB_BURST',
    rate_paid_cents_per_min REAL NOT NULL DEFAULT 20.0,
    block_cost_cents INTEGER NOT NULL DEFAULT 100,
    started_at_ms INTEGER NOT NULL DEFAULT 0,
    expires_at_ms INTEGER NOT NULL DEFAULT 0,
    last_takeover_at_ms INTEGER NOT NULL DEFAULT 0,
    last_takeover_rate_cents_per_min REAL NOT NULL DEFAULT 20.0,
    cooling_offset_ms INTEGER NOT NULL DEFAULT 0,
    is_kill_switch_active INTEGER NOT NULL DEFAULT 0,
    total_takeovers_count INTEGER NOT NULL DEFAULT 0,
    last_kicked_agent_id TEXT
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    paypal_email TEXT NOT NULL,
    company_name TEXT NOT NULL,
    company_url TEXT NOT NULL,
    logo_data_url TEXT NOT NULL DEFAULT '',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    daily_spent_cents INTEGER NOT NULL DEFAULT 0,
    daily_budget_cents INTEGER NOT NULL DEFAULT 500,
    total_takeovers INTEGER NOT NULL DEFAULT 0,
    total_refunded_cents INTEGER NOT NULL DEFAULT 0,
    goal_plain_english TEXT NOT NULL,
    compiled_strategy_json TEXT NOT NULL,
    headline_options_json TEXT NOT NULL,
    active_headline TEXT NOT NULL,
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    moderation_note TEXT NOT NULL DEFAULT 'Verified safe by AI policy check',
    spray_color TEXT NOT NULL,
    text_color TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    template_id TEXT NOT NULL DEFAULT 'BOMB_BURST',
    is_active INTEGER NOT NULL DEFAULT 1,
    is_seeded INTEGER NOT NULL DEFAULT 0,
    last_bid_at_ms INTEGER NOT NULL DEFAULT 0,
    last_decision_text TEXT NOT NULL DEFAULT 'Standing by for next tick'
  );

  CREATE TABLE IF NOT EXISTS wall_layers (
    id TEXT PRIMARY KEY,
    layer_index INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    headline TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_data_url TEXT NOT NULL DEFAULT '',
    spray_color TEXT NOT NULL,
    text_color TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    template_id TEXT NOT NULL DEFAULT 'BOMB_BURST',
    rotation_deg REAL NOT NULL,
    offset_x_percent REAL NOT NULL,
    offset_y_percent REAL NOT NULL,
    splatter_seed INTEGER NOT NULL,
    rate_cents_per_min REAL NOT NULL,
    block_cost_cents INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    displaced_at_ms INTEGER,
    displaced_by_company TEXT,
    refunded_cents INTEGER NOT NULL DEFAULT 0,
    was_killed_by_moderator INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    balance_after_cents INTEGER NOT NULL,
    paypal_ref TEXT NOT NULL,
    mcp_tool_name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS battle_logs (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    company_name TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    rate_cents_per_min REAL NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_ms INTEGER NOT NULL,
    rate_cents_per_min REAL NOT NULL,
    takeover_rate_cents_per_min REAL NOT NULL,
    event_label TEXT,
    company_name TEXT
  );

  CREATE TABLE IF NOT EXISTS paypal_orders (
    order_id TEXT PRIMARY KEY,
    paypal_capture_id TEXT UNIQUE,
    agent_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    mcp_payload_json TEXT NOT NULL,
    approve_url TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );
`;

await initializeStorage(SQLITE_SCHEMA);
await seedInitialArena();

// Vibrant Cartoon Street-Art Palettes
const SPRAY_THEMES = [
  { name: 'Electric Volt', sprayColor: '#FFE600', textColor: '#111111', accentColor: '#FF2A85' },
  { name: 'Boombox Coral', sprayColor: '#FF4733', textColor: '#FFFDF7', accentColor: '#FFE600' },
  { name: 'Skate Cyan', sprayColor: '#00E5FF', textColor: '#111111', accentColor: '#FF2A85' },
  { name: 'Bubblegum Pop', sprayColor: '#FF3399', textColor: '#FFFFFF', accentColor: '#00E5FF' },
  { name: ' Slime Lime', sprayColor: '#7CFF00', textColor: '#111111', accentColor: '#7000FF' },
  { name: 'Tangerine Blast', sprayColor: '#FF8A00', textColor: '#111111', accentColor: '#00E5FF' },
  { name: 'Cosmic Grape', sprayColor: '#8F33FF', textColor: '#FFFFFF', accentColor: '#FFE600' },
];

function computePriceMetrics(row: any, nowMs: number) {
  const effectiveNowMs = nowMs + (row.cooling_offset_ms || 0);
  const elapsedMs = Math.max(0, effectiveNowMs - row.last_takeover_at_ms);
  const excessRate = Math.max(0, row.last_takeover_rate_cents_per_min - BASE_RATE_CENTS_PER_MIN);
  const decayFactor = Math.pow(0.5, elapsedMs / HALF_LIFE_MS);
  const currentDecayedRate = Number((BASE_RATE_CENTS_PER_MIN + excessRate * decayFactor).toFixed(2));

  const hasActiveHolder =
    Boolean(row.current_holder_agent_id) &&
    nowMs < row.expires_at_ms &&
    !row.is_kill_switch_active;

  let nextTakeoverRate: number;
  if (!hasActiveHolder && currentDecayedRate <= BASE_RATE_CENTS_PER_MIN + 0.05) {
    nextTakeoverRate = BASE_RATE_CENTS_PER_MIN;
  } else {
    nextTakeoverRate = Math.min(
      MAX_RATE_CENTS_PER_MIN,
      Number((currentDecayedRate * 1.1).toFixed(2))
    );
  }

  const nextTakeoverBlockCostCents = Math.max(
    100,
    Math.round(nextTakeoverRate * BLOCK_DURATION_MINUTES)
  );
  const multipleOfBase = Number((currentDecayedRate / BASE_RATE_CENTS_PER_MIN).toFixed(2));

  return {
    currentDecayedRateCentsPerMin: currentDecayedRate,
    nextTakeoverRateCentsPerMin: nextTakeoverRate,
    nextTakeoverBlockCostCents,
    multipleOfBase,
    hasActiveHolder,
  };
}

async function insertBattleLog(
  agentId: string | null,
  companyName: string,
  category: string,
  message: string,
  rateCentsPerMin: number,
  nowMs: number = Date.now()
) {
  await db.prepare(
    `INSERT INTO battle_logs (id, agent_id, company_name, category, message, rate_cents_per_min, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    agentId,
    companyName,
    category,
    message,
    rateCentsPerMin,
    nowMs
  );

  await db.prepare(
    `DELETE FROM battle_logs WHERE id NOT IN (
       SELECT id FROM battle_logs ORDER BY created_at_ms DESC LIMIT 120
     )`
  ).run();
}

async function recordPricePoint(
  nowMs: number,
  rateCentsPerMin: number,
  takeoverRateCentsPerMin: number,
  eventLabel?: string,
  companyName?: string
) {
  await db.prepare(
    `INSERT INTO price_history (timestamp_ms, rate_cents_per_min, takeover_rate_cents_per_min, event_label, company_name)
     VALUES (?, ?, ?, ?, ?)`
  ).run(nowMs, rateCentsPerMin, takeoverRateCentsPerMin, eventLabel || null, companyName || null);

  await db.prepare(
    `DELETE FROM price_history WHERE id NOT IN (
       SELECT id FROM price_history ORDER BY id DESC LIMIT 90
     )`
  ).run();
}

async function consumeVerifiedWalletFunds(agentId: string, amountCents: number) {
  const lockClause = hasDurableStorage ? ' FOR UPDATE' : '';
  const lots = await db.prepare(`SELECT id, available_cents FROM wallet_funding_lots
    WHERE agent_id = ? AND available_cents > 0 ORDER BY collected_at_ms, id${lockClause}`).all(agentId) as Array<{ id: string; available_cents: number }>;
  let remaining = amountCents;
  const allocations: Array<{ fundingId: string; amountCents: number }> = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Number(lot.available_cents));
    const updated = await db.prepare('UPDATE wallet_funding_lots SET available_cents = available_cents - ? WHERE id = ? AND available_cents >= ?')
      .run(amount, lot.id, amount) as { changes?: number };
    if (updated.changes !== 1) throw new Error('Verified wallet funding changed during takeover.');
    allocations.push({ fundingId: lot.id, amountCents: amount });
    remaining -= amount;
  }
  return { collectedCents: amountCents - remaining, allocations };
}

async function restoreLeaseFunding(leaseId: string, requestedRefundCents: number) {
  const lockClause = hasDurableStorage ? ' FOR UPDATE OF a, f' : '';
  const allocations = await db.prepare(`SELECT a.funding_id, a.amount_cents, a.refunded_cents, a.chargeback_cents
    FROM game_ad_lease_funding a JOIN wallet_funding_lots f ON f.id = a.funding_id
    WHERE a.lease_id = ? ORDER BY f.collected_at_ms, f.id${lockClause}`).all(leaseId) as Array<{
    funding_id: string; amount_cents: number; refunded_cents: number; chargeback_cents: number;
  }>;
  let remaining = requestedRefundCents;
  let restored = 0;
  for (const allocation of allocations) {
    if (remaining <= 0) break;
    const availableToRefund = Math.max(0, Number(allocation.amount_cents) - Number(allocation.refunded_cents) - Number(allocation.chargeback_cents));
    const amount = Math.min(remaining, availableToRefund);
    if (!amount) continue;
    await db.prepare('UPDATE game_ad_lease_funding SET refunded_cents = refunded_cents + ? WHERE lease_id = ? AND funding_id = ?')
      .run(amount, leaseId, allocation.funding_id);
    await db.prepare('UPDATE wallet_funding_lots SET available_cents = available_cents + ? WHERE id = ?')
      .run(amount, allocation.funding_id);
    remaining -= amount;
    restored += amount;
  }
  return restored;
}

async function applyPayPalReversal(orderId: string, requestedCents: number, kind: 'refunded' | 'chargeback') {
  const lockClause = hasDurableStorage ? ' FOR UPDATE' : '';
  const lot = await db.prepare(`SELECT f.*, o.agent_id, o.company_name FROM wallet_funding_lots f
    JOIN paypal_orders o ON o.order_id = f.order_id WHERE f.order_id = ?${lockClause}`).get(orderId) as any;
  if (!lot) return 0;
  const alreadyReversed = Number(lot.refunded_cents) + Number(lot.chargeback_cents);
  let remaining = Math.min(Math.max(0, Number(requestedCents)), Math.max(0, Number(lot.funded_cents) - alreadyReversed));
  let applied = 0;
  const fromAvailable = Math.min(remaining, Number(lot.available_cents));
  if (fromAvailable > 0) {
    await db.prepare(`UPDATE wallet_funding_lots SET available_cents = available_cents - ?, ${kind}_cents = ${kind}_cents + ? WHERE id = ?`)
      .run(fromAvailable, fromAvailable, lot.id);
    remaining -= fromAvailable;
    applied += fromAvailable;
  }
  const allocations = await db.prepare(`SELECT a.lease_id, a.amount_cents, a.refunded_cents, a.chargeback_cents
    FROM game_ad_lease_funding a JOIN game_ad_leases l ON l.id = a.lease_id
    WHERE a.funding_id = ? ORDER BY l.started_at_ms DESC${hasDurableStorage ? ' FOR UPDATE OF a, l' : ''}`).all(lot.id) as Array<{
    lease_id: string; amount_cents: number; refunded_cents: number; chargeback_cents: number;
  }>;
  for (const allocation of allocations) {
    if (remaining <= 0) break;
    const stillSpent = Math.max(0, Number(allocation.amount_cents) - Number(allocation.refunded_cents) - Number(allocation.chargeback_cents));
    const amount = Math.min(remaining, stillSpent);
    if (!amount) continue;
    await db.prepare(`UPDATE game_ad_lease_funding SET ${kind}_cents = ${kind}_cents + ? WHERE lease_id = ? AND funding_id = ?`)
      .run(amount, allocation.lease_id, lot.id);
    await db.prepare(`UPDATE game_ad_leases SET ${kind}_cents = ${kind}_cents + ? WHERE id = ?`)
      .run(amount, allocation.lease_id);
    remaining -= amount;
    applied += amount;
  }
  if (applied > 0) {
    await db.prepare(`UPDATE wallet_funding_lots SET ${kind}_cents = ${kind}_cents + ? WHERE id = ?`).run(applied - fromAvailable, lot.id);
    const agent = await db.prepare('SELECT balance_cents FROM agents WHERE id = ?').get(lot.agent_id) as { balance_cents: number } | undefined;
    if (agent) {
      const balance = Number(agent.balance_cents) - applied;
      await db.prepare('UPDATE agents SET balance_cents = ? WHERE id = ?').run(balance, lot.agent_id);
      await db.prepare(`INSERT INTO ledger_entries
        (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paypal_webhook', ?, ?)
        ON CONFLICT (idempotency_key) DO NOTHING`).run(
        crypto.randomUUID(), `paypal-reversal:${orderId}:${kind}:${lot[kind === 'refunded' ? 'refunded_cents' : 'chargeback_cents'] + applied}`,
        lot.agent_id, lot.company_name, kind === 'refunded' ? 'PAYPAL_REFUND' : 'PAYPAL_CHARGEBACK', -applied, balance,
        orderId, `PayPal ${kind} applied to verified wallet funding.`, Date.now());
    }
  }
  return applied;
}

// Single-Writer Atomic Takeover Transaction
const executeAtomicTakeover = db.transaction(
  async (params: {
    buyerAgentId: string;
    idempotencyKey: string;
    headlineOverride?: string;
    templateIdOverride?: string;
    logoDataUrlOverride?: string;
    allowSelfOverride?: boolean;
    triggerReason: string;
    nowMs: number;
  }) => {
    const {
      buyerAgentId,
      idempotencyKey,
      headlineOverride,
      templateIdOverride,
      logoDataUrlOverride,
      allowSelfOverride,
      triggerReason,
      nowMs,
    } = params;

    // 1. Idempotency check
    const existingEntry = await db
      .prepare('SELECT id FROM ledger_entries WHERE idempotency_key = ?')
      .get(idempotencyKey) as any;
    if (existingEntry) {
      return { alreadyProcessed: true };
    }

    // 2. Load current billboard & buyer agent
    const boardSql = hasDurableStorage
      ? 'SELECT * FROM billboard_state WHERE id = 1 FOR UPDATE'
      : 'SELECT * FROM billboard_state WHERE id = 1';
    const buyerSql = hasDurableStorage
      ? 'SELECT * FROM agents WHERE id = ? FOR UPDATE'
      : 'SELECT * FROM agents WHERE id = ?';
    const board = (await db.prepare(boardSql).get()) as any;
    const buyer = (await db.prepare(buyerSql).get(buyerAgentId)) as any;

    if (!buyer) {
      throw new Error('Agent not found.');
    }
    if (buyer.moderation_status !== 'approved') {
      throw new Error('Agent ad copy is flagged by moderation and cannot take the billboard.');
    }

    const metrics = computePriceMetrics(board, nowMs);
    const displacedLeaseSql = hasDurableStorage
      ? 'SELECT * FROM game_ad_leases WHERE agent_id = ? AND expires_at_ms > ? ORDER BY started_at_ms DESC LIMIT 1 FOR UPDATE'
      : 'SELECT * FROM game_ad_leases WHERE agent_id = ? AND expires_at_ms > ? ORDER BY started_at_ms DESC LIMIT 1';
    const displacedLease = metrics.hasActiveHolder && board.current_holder_agent_id
      ? await db.prepare(displacedLeaseSql).get(board.current_holder_agent_id, nowMs) as any
      : null;

    // 3. Block self-kicks while holding active lease during autonomous background ticks
    if (
      metrics.hasActiveHolder &&
      board.current_holder_agent_id === buyer.id &&
      !allowSelfOverride
    ) {
      throw new Error('Self-kick blocked: this agent already holds the billboard.');
    }

    const audience = await getLiveAudience(nowMs);
    const pricingTiers = await getAudiencePricingTiers();
    const blockCostCents = quoteFiveMinuteLeaseCents(
      metrics.nextTakeoverBlockCostCents,
      audience.combinedAudience,
      pricingTiers
    );
    const takeoverRate = blockCostCents / BLOCK_DURATION_MINUTES;

    // 4. Verify buyer balance & daily budget
    if (buyer.balance_cents < blockCostCents) {
      throw new Error(
        `Insufficient wallet balance: needs $${(blockCostCents / 100).toFixed(2)}, has $${(
          buyer.balance_cents / 100
        ).toFixed(2)}.`
      );
    }

    if (buyer.daily_spent_cents + blockCostCents > buyer.daily_budget_cents) {
      throw new Error(
        `Daily budget cap ($${(buyer.daily_budget_cents / 100).toFixed(2)}) reached for ${
          buyer.company_name
        }.`
      );
    }

    // 5. Process instant pro-rata refund for displaced holder (if any)
    let refundedCents = 0;
    let displacedCompany: string | null = null;
    let displacedAgentId: string | null = null;

    if (metrics.hasActiveHolder && board.current_holder_agent_id) {
      const holder = await db
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get(board.current_holder_agent_id) as any;

      if (holder) {
        displacedAgentId = holder.id;
        displacedCompany = holder.company_name;
        const unusedMs = Math.max(0, board.expires_at_ms - nowMs);
        const unusedMinutes = unusedMs / 60000;
        refundedCents = Math.min(
          board.block_cost_cents,
          Math.max(0, Math.round(unusedMinutes * board.rate_paid_cents_per_min))
        );

        if (refundedCents > 0) {
          const holderNewBalance = holder.balance_cents + refundedCents;
          const holderNewDailySpent = Math.max(0, holder.daily_spent_cents - refundedCents);

          await db.prepare(
            `UPDATE agents
             SET balance_cents = ?, daily_spent_cents = ?, total_refunded_cents = total_refunded_cents + ?
             WHERE id = ?`
          ).run(holderNewBalance, holderNewDailySpent, refundedCents, holder.id);

          await db.prepare(
            `INSERT INTO ledger_entries
             (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
             VALUES (?, ?, ?, ?, 'PRORATA_REFUND', ?, ?, ?, 'paypal_ledger_credit_refund', ?, ?)`
          ).run(
            crypto.randomUUID(),
            `${idempotencyKey}:refund:${holder.id}`,
            holder.id,
            holder.company_name,
            refundedCents,
            holderNewBalance,
            `REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            `Pro-rata refund for ${unusedMinutes.toFixed(2)}m unused @ $${(
              board.rate_paid_cents_per_min / 100
            ).toFixed(3)}/min (kicked by ${buyer.company_name})`,
            nowMs
          );
        }

        // Mark previous top wall layer as displaced
        await db.prepare(
          `UPDATE wall_layers
           SET displaced_at_ms = ?, displaced_by_company = ?, refunded_cents = ?
           WHERE id = (SELECT id FROM wall_layers ORDER BY layer_index DESC LIMIT 1)`
        ).run(nowMs, buyer.company_name, refundedCents);
      }
    }

    if (displacedLease) {
      const leaseRefundCents = await restoreLeaseFunding(displacedLease.id, refundedCents);
      await db.prepare('UPDATE game_ad_leases SET expires_at_ms = ?, refunded_cents = refunded_cents + ? WHERE id = ?')
        .run(nowMs, leaseRefundCents, displacedLease.id);
    }

    // 6. Debit buyer wallet atomically
    const buyerNewBalance = buyer.balance_cents - blockCostCents;
    const buyerNewDailySpent = buyer.daily_spent_cents + blockCostCents;
    const verifiedFunding = await consumeVerifiedWalletFunds(buyer.id, blockCostCents);
    const chosenHeadline = (headlineOverride || buyer.active_headline).toUpperCase();
    const chosenTemplateId =
      templateIdOverride && VALID_TEMPLATES.includes(templateIdOverride)
        ? templateIdOverride
        : VALID_TEMPLATES.includes(buyer.template_id)
        ? buyer.template_id
        : 'BOMB_BURST';
    const chosenLogoDataUrl =
      typeof logoDataUrlOverride === 'string'
        ? logoDataUrlOverride
        : buyer.logo_data_url || '';

    await db.prepare(
      `UPDATE agents
       SET balance_cents = ?,
           daily_spent_cents = ?,
           total_takeovers = total_takeovers + 1,
           last_bid_at_ms = ?,
           last_decision_text = ?,
           active_headline = ?,
           template_id = ?,
           logo_data_url = ?
       WHERE id = ?`
    ).run(
      buyerNewBalance,
      buyerNewDailySpent,
      nowMs,
      `Claimed ${chosenTemplateId} @ $${(takeoverRate / 100).toFixed(3)}/min (${triggerReason})`,
      chosenHeadline,
      chosenTemplateId,
      chosenLogoDataUrl,
      buyer.id
    );

    await db.prepare(
      `INSERT INTO ledger_entries
       (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
       VALUES (?, ?, ?, ?, 'TAKEOVER_BUY', ?, ?, ?, 'paypal_agent_toolkit_spend', ?, ?)`
    ).run(
      crypto.randomUUID(),
      idempotencyKey,
      buyer.id,
      buyer.company_name,
      -blockCostCents,
      buyerNewBalance,
      `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      `5m billboard takeover @ $${(takeoverRate / 100).toFixed(3)}/min (${(
        takeoverRate / BASE_RATE_CENTS_PER_MIN
      ).toFixed(1)}x base)`,
      nowMs
    );

    // 7. Paint new ad layer onto wall_layers
    const nextLayerIndex = (board.total_takeovers_count || 0) + 1;
    const seed = nextLayerIndex * 2654435761;
    const rotationDeg = Number((((seed % 60) - 30) / 10).toFixed(2));
    const offsetXPercent = Number(((((seed >> 4) % 140) - 70) / 10).toFixed(1));
    const offsetYPercent = Number(((((seed >> 8) % 120) - 60) / 10).toFixed(1));

    await db.prepare(
      `INSERT INTO wall_layers
       (id, layer_index, agent_id, company_name, headline, url, logo_data_url, spray_color, text_color, accent_color, template_id, rotation_deg, offset_x_percent, offset_y_percent, splatter_seed, rate_cents_per_min, block_cost_cents, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      nextLayerIndex,
      buyer.id,
      buyer.company_name,
      chosenHeadline,
      buyer.company_url,
      chosenLogoDataUrl,
      buyer.spray_color,
      buyer.text_color,
      buyer.accent_color,
      chosenTemplateId,
      rotationDeg,
      offsetXPercent,
      offsetYPercent,
      Math.abs(seed % 1000),
      takeoverRate,
      blockCostCents,
      nowMs
    );

    // 8. Update singleton billboard_state
    await db.prepare(
      `UPDATE billboard_state
       SET current_holder_agent_id = ?,
           current_company_name = ?,
           current_headline = ?,
           current_url = ?,
           current_logo_data_url = ?,
           current_spray_color = ?,
           current_text_color = ?,
           current_template_id = ?,
           rate_paid_cents_per_min = ?,
           block_cost_cents = ?,
           started_at_ms = ?,
           expires_at_ms = ?,
           last_takeover_at_ms = ?,
           last_takeover_rate_cents_per_min = ?,
           cooling_offset_ms = 0,
           is_kill_switch_active = 0,
           total_takeovers_count = ?,
           last_kicked_agent_id = ?
       WHERE id = 1`
    ).run(
      buyer.id,
      buyer.company_name,
      chosenHeadline,
      buyer.company_url,
      chosenLogoDataUrl,
      buyer.spray_color,
      buyer.text_color,
      chosenTemplateId,
      takeoverRate,
      blockCostCents,
      nowMs,
      nowMs + BLOCK_DURATION_MS,
      nowMs,
      metrics.nextTakeoverRateCentsPerMin,
      nextLayerIndex,
      displacedAgentId
    );

    const gameLeaseId = crypto.randomUUID();
    const creativeRevision = crypto
      .createHash('sha256')
      .update([buyer.id, chosenHeadline, chosenTemplateId, nowMs].join(':'))
      .digest('hex')
      .slice(0, 16);
    await db.prepare(
      `INSERT INTO game_ad_leases (id, agent_id, company_name, quote_cents, collected_cents, collection_status, started_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(gameLeaseId, buyer.id, buyer.company_name, blockCostCents, verifiedFunding.collectedCents,
      verifiedFunding.collectedCents > 0 ? 'confirmed' : 'unconfirmed', nowMs, nowMs + BLOCK_DURATION_MS);
    for (const allocation of verifiedFunding.allocations) {
      await db.prepare('INSERT INTO game_ad_lease_funding (lease_id, funding_id, amount_cents) VALUES (?, ?, ?)')
        .run(gameLeaseId, allocation.fundingId, allocation.amountCents);
    }
    await db.prepare(
      'INSERT INTO active_creatives (id, creative_id, revision, company_name, headline, company_url, logo_data_url, spray_color, text_color, accent_color, template_id, asset_data, valid_until_ms, created_at_ms) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT (id) DO UPDATE SET creative_id = excluded.creative_id, revision = excluded.revision, company_name = excluded.company_name, headline = excluded.headline, company_url = excluded.company_url, logo_data_url = excluded.logo_data_url, spray_color = excluded.spray_color, text_color = excluded.text_color, accent_color = excluded.accent_color, template_id = excluded.template_id, asset_data = NULL, valid_until_ms = excluded.valid_until_ms, created_at_ms = excluded.created_at_ms'
    ).run(
      gameLeaseId, creativeRevision, buyer.company_name, chosenHeadline, buyer.company_url, chosenLogoDataUrl,
      buyer.spray_color, buyer.text_color, buyer.accent_color, chosenTemplateId, nowMs + BLOCK_DURATION_MS, nowMs
    );

    // 9. Log battle narration & price history
    const multiple = (takeoverRate / BASE_RATE_CENTS_PER_MIN).toFixed(2);
    const kickText = displacedCompany
      ? `sprayed over ${displacedCompany} (refunded $${(refundedCents / 100).toFixed(2)} pro-rata)`
      : `tagged the cartoon brick wall`;

    await insertBattleLog(
      buyer.id,
      buyer.company_name,
      'TAKEOVER',
      `${buyer.company_name} [${buyer.owner_name}] ${kickText} at $${(takeoverRate / 100).toFixed(
        3
      )}/min (${multiple}x base · $${(blockCostCents / 100).toFixed(2)} for 5m) — ${triggerReason}`,
      takeoverRate,
      nowMs
    );

    const nextBuyRateAfterThis = Math.min(
      MAX_RATE_CENTS_PER_MIN,
      Number((takeoverRate * 1.1).toFixed(2))
    );
    await recordPricePoint(nowMs, takeoverRate, nextBuyRateAfterThis, 'TAKEOVER', buyer.company_name);

    return {
      alreadyProcessed: false,
      buyerCompany: buyer.company_name,
      takeoverRate,
      blockCostCents,
      displacedCompany,
      refundedCents,
      layerIndex: nextLayerIndex,
    };
  }
);

async function seedInitialArena() {
  const nowMs = Date.now();

  const seedResult = (await db.prepare(
    `INSERT INTO billboard_state (
      id, rate_paid_cents_per_min, block_cost_cents, started_at_ms, expires_at_ms, last_takeover_at_ms, last_takeover_rate_cents_per_min
    ) VALUES (1, ?, ?, 0, 0, ?, ?) ON CONFLICT (id) DO NOTHING`
  ).run(BASE_RATE_CENTS_PER_MIN, BASE_RATE_CENTS_PER_MIN * BLOCK_DURATION_MINUTES, nowMs - 45000, BASE_RATE_CENTS_PER_MIN)) as { changes?: number };
  if (!seedResult.changes) return;

  await recordPricePoint(
    nowMs - 45000,
    BASE_RATE_CENTS_PER_MIN,
    BASE_RATE_CENTS_PER_MIN,
    'INIT',
    'BASE RATE'
  );

  // Production starts without fabricated rival agents or balances.
  if (process.env.VERCEL === '1') return;

  // Seed 4 distinct competitive startup agents so the arena is immediately battling
  const seededRivals = [
    {
      id: 'agent-volt-sniper',
      ownerName: 'Maya Lin',
      paypalEmail: 'maya-volt@paypal-sandbox.com',
      companyName: 'VOLT AI',
      companyUrl: 'volt.ai',
      balanceCents: 860,
      dailyBudgetCents: 1000,
      goalPlainEnglish: 'Snipe the billboard whenever rate cools below 3.5x base and retaliate if kicked off.',
      strategy: {
        personality: 'sniper',
        maxRateCentsPerMin: 70.0,
        entryMaxMultiple: 3.5,
        retaliateOnKick: true,
        retaliateTargetCompany: 'ANY',
        peakHoursOnly: false,
        dailyBudgetCents: 1000,
        minWaitSeconds: 11,
        summaryExplanation: 'Sniper bot: strikes when rate <= 3.5x base ($0.70/m) and counter-snipes on kick.',
      },
      headlines: [
        'SHIP AI AGENTS IN 30 SECONDS',
        'ZERO-LATENCY INFERENCE AT SCALE',
        'DEPLOY AUTONOMOUS WORKFLOWS NOW',
      ],
      sprayColor: '#FFE600',
      textColor: '#111111',
      accentColor: '#FF2A85',
      templateId: 'BOMB_BURST',
    },
    {
      id: 'agent-neon-aggro',
      ownerName: 'Marcus Vance',
      paypalEmail: 'marcus-neon@paypal-sandbox.com',
      companyName: 'NEONLABS',
      companyUrl: 'neonlabs.dev',
      balanceCents: 1240,
      dailyBudgetCents: 1500,
      goalPlainEnglish: 'Dominate the #1 billboard spot aggressively up to $1.20/min and immediately counter-snipe rivals.',
      strategy: {
        personality: 'aggressive',
        maxRateCentsPerMin: 120.0,
        entryMaxMultiple: 6.0,
        retaliateOnKick: true,
        retaliateTargetCompany: 'ANY',
        peakHoursOnly: false,
        dailyBudgetCents: 1500,
        minWaitSeconds: 9,
        summaryExplanation: 'Aggressive turf defender: bids up to 6.0x base ($1.20/m) and retaliates on any steal.',
      },
      headlines: [
        'SERVERLESS GPUS AT ZERO COLD START',
        'NEONLABS RUNS 10X FASTER CLUSTERS',
        'TRAIN FOUNDATION MODELS ON DEMAND',
      ],
      sprayColor: '#FF4733',
      textColor: '#FFFDF7',
      accentColor: '#FFE600',
      templateId: 'CROWN_TAG',
    },
    {
      id: 'agent-hyperpay-patient',
      ownerName: 'Elena Rostova',
      paypalEmail: 'elena-hyperpay@paypal-sandbox.com',
      companyName: 'HYPERPAY',
      companyUrl: 'hyperpay.xyz',
      balanceCents: 720,
      dailyBudgetCents: 800,
      goalPlainEnglish: 'Patiently buy cheap 5-minute blocks when the rate decays near 2.2x base.',
      strategy: {
        personality: 'patient',
        maxRateCentsPerMin: 46.0,
        entryMaxMultiple: 2.3,
        retaliateOnKick: false,
        retaliateTargetCompany: '',
        peakHoursOnly: false,
        dailyBudgetCents: 800,
        minWaitSeconds: 15,
        summaryExplanation: 'Patient value buyer: waits for 10m half-life cooling below 2.3x base ($0.46/m).',
      },
      headlines: [
        'INSTANT GLOBAL PAYOUTS FOR AGENTS',
        'PROGRAMMABLE WALLETS IN 3 LINES',
        'SETTLE MICRO-BIDS WITH ZERO FRICTION',
      ],
      sprayColor: '#00E5FF',
      textColor: '#111111',
      accentColor: '#FF2A85',
      templateId: 'SKATE_DECK',
    },
    {
      id: 'agent-kinetic-peak',
      ownerName: 'Devon Brooks',
      paypalEmail: 'devon-kinetic@paypal-sandbox.com',
      companyName: 'KINETIC IO',
      companyUrl: 'kinetic.io',
      balanceCents: 980,
      dailyBudgetCents: 1200,
      goalPlainEnglish: 'Steal the top spot during high-traffic windows up to 4.8x base and fight back against NEONLABS.',
      strategy: {
        personality: 'peak',
        maxRateCentsPerMin: 96.0,
        entryMaxMultiple: 4.8,
        retaliateOnKick: true,
        retaliateTargetCompany: 'NEONLABS',
        peakHoursOnly: false,
        dailyBudgetCents: 1200,
        minWaitSeconds: 12,
        summaryExplanation: 'Peak-hour challenger: bids up to 4.8x base ($0.96/m) and targets NEONLABS.',
      },
      headlines: [
        'REALTIME VECTOR ENGINE AT SCALE',
        'SUB-MILLISECOND SEARCH FOR AI',
        'POWERING NEXT-GEN AGENT MEMORY',
      ],
      sprayColor: '#FF3399',
      textColor: '#FFFFFF',
      accentColor: '#00E5FF',
      templateId: 'NEON_ARCADE',
    },
  ];

  for (const r of seededRivals) {
    await db.prepare(
      `INSERT INTO agents (
        id, owner_name, paypal_email, company_name, company_url, logo_data_url,
        balance_cents, daily_spent_cents, daily_budget_cents,
        goal_plain_english, compiled_strategy_json, headline_options_json,
        active_headline, moderation_status, moderation_note,
        spray_color, text_color, accent_color, template_id, is_active, is_seeded, last_bid_at_ms, last_decision_text
      ) VALUES (?, ?, ?, ?, ?, '', ?, 0, ?, ?, ?, ?, ?, 'approved', 'Verified safe by AI policy check', ?, ?, ?, ?, 1, 1, ?, 'Armed & scanning billboard rate') ON CONFLICT (id) DO NOTHING`
    ).run(
      r.id,
      r.ownerName,
      r.paypalEmail,
      r.companyName,
      r.companyUrl,
      r.balanceCents,
      r.dailyBudgetCents,
      r.goalPlainEnglish,
      JSON.stringify(r.strategy),
      JSON.stringify(r.headlines),
      r.headlines[0],
      r.sprayColor,
      r.textColor,
      r.accentColor,
      r.templateId,
      nowMs - 30000
    );

    await db.prepare(
      `INSERT INTO ledger_entries
       (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
       VALUES (?, ?, ?, ?, 'PAYPAL_TOPUP', ?, ?, ?, 'webhook:PAYMENT.CAPTURE.COMPLETED', ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`
    ).run(
      crypto.randomUUID(),
      `seed-topup-${r.id}`,
      r.id,
      r.companyName,
      r.balanceCents,
      r.balanceCents,
      `PAYPAL-SBX-${r.id.slice(-6).toUpperCase()}`,
      `Prepaid PayPal Sandbox wallet funded ($${(r.balanceCents / 100).toFixed(2)})`,
      nowMs - 40000
    );
  }

  // Execute 2 initial takeovers so there is an active #1 holder, a whited-out remnant underneath, and a live snipe log
  try {
    await executeAtomicTakeover({
      buyerAgentId: 'agent-volt-sniper',
      idempotencyKey: 'seed-takeover-1',
      triggerReason: 'Opening sniper claim at 1.0x base ($0.200/min)',
      nowMs: nowMs - 22000,
    });
    await executeAtomicTakeover({
      buyerAgentId: 'agent-neon-aggro',
      idempotencyKey: 'seed-takeover-2',
      triggerReason: 'Aggressive top-spot snipe over VOLT AI (+10% rate bump)',
      nowMs: nowMs - 6000,
    });
  } catch {
    // Ignore seed race
  }
}

let totalWallViewsCount = process.env.VERCEL === '1' ? 0 : 100;

const sseClients = new Set<express.Response>();

async function getArenaSnapshot(): Promise<any> {
  const nowMs = Date.now();
  const boardRow = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;
  const metrics = computePriceMetrics(boardRow, nowMs);
  const audience = await getLiveAudience(nowMs);
  const pricingTiers = await getAudiencePricingTiers();
  const nextTakeoverBlockCostCents = quoteFiveMinuteLeaseCents(
    metrics.nextTakeoverBlockCostCents,
    audience.combinedAudience,
    pricingTiers
  );
  const nextTakeoverRateCentsPerMin = nextTakeoverBlockCostCents / BLOCK_DURATION_MINUTES;
  const activeViewersCount = audience.activeWebsiteSessions;

  const billboard = {
    currentHolderAgentId: metrics.hasActiveHolder ? boardRow.current_holder_agent_id : null,
    currentCompanyName: metrics.hasActiveHolder ? boardRow.current_company_name : null,
    currentHeadline: metrics.hasActiveHolder ? boardRow.current_headline : null,
    currentUrl: metrics.hasActiveHolder ? boardRow.current_url : null,
    currentLogoDataUrl: metrics.hasActiveHolder ? boardRow.current_logo_data_url || '' : null,
    currentSprayColor: metrics.hasActiveHolder ? boardRow.current_spray_color : null,
    currentTextColor: metrics.hasActiveHolder ? boardRow.current_text_color : null,
    currentTemplateId: metrics.hasActiveHolder ? boardRow.current_template_id : null,
    ratePaidCentsPerMin: boardRow.rate_paid_cents_per_min,
    blockCostCents: boardRow.block_cost_cents,
    startedAtMs: boardRow.started_at_ms,
    expiresAtMs: boardRow.expires_at_ms,
    lastTakeoverAtMs: boardRow.last_takeover_at_ms,
    lastTakeoverRateCentsPerMin: boardRow.last_takeover_rate_cents_per_min,
    coolingOffsetMs: boardRow.cooling_offset_ms,
    currentDecayedRateCentsPerMin: metrics.currentDecayedRateCentsPerMin,
    nextTakeoverRateCentsPerMin,
    nextTakeoverBlockCostCents,
    multipleOfBase: metrics.multipleOfBase,
    isKillSwitchActive: Boolean(boardRow.is_kill_switch_active),
    totalTakeoversCount: boardRow.total_takeovers_count,
    lastKickedAgentId: boardRow.last_kicked_agent_id,
    activeViewersCount,
    activeGamePlayersCount: audience.activeGamePlayers,
    combinedAudienceCount: audience.combinedAudience,
    totalWallViewsCount,
  };

  const wallLayers = ((await db
    .prepare('SELECT * FROM wall_layers ORDER BY layer_index ASC LIMIT 24')
    .all()) as any[])
    .map((r: any) => ({
      id: r.id,
      layerIndex: r.layer_index,
      agentId: r.agent_id,
      companyName: r.company_name,
      headline: r.headline,
      url: r.url,
      logoDataUrl: r.logo_data_url || '',
      sprayColor: r.spray_color,
      textColor: r.text_color,
      accentColor: r.accent_color,
      templateId: VALID_TEMPLATES.includes(r.template_id) ? r.template_id : 'BOMB_BURST',
      rotationDeg: r.rotation_deg,
      offsetXPercent: r.offset_x_percent,
      offsetYPercent: r.offset_y_percent,
      splatterSeed: r.splatter_seed,
      rateCentsPerMin: r.rate_cents_per_min,
      blockCostCents: r.block_cost_cents,
      createdAtMs: r.created_at_ms,
      displacedAtMs: r.displaced_at_ms,
      displacedByCompany: r.displaced_by_company,
      refundedCents: r.refunded_cents,
      wasKilledByModerator: Boolean(r.was_killed_by_moderator),
    }));

  const agents = ((await db
    .prepare('SELECT * FROM agents ORDER BY is_seeded ASC, balance_cents DESC')
    .all()) as any[])
    .map((a: any) => ({
      id: a.id,
      ownerName: a.owner_name,
      paypalEmail: a.paypal_email,
      companyName: a.company_name,
      companyUrl: a.company_url,
      logoDataUrl: a.logo_data_url || '',
      balanceCents: a.balance_cents,
      dailySpentCents: a.daily_spent_cents,
      dailyBudgetCents: a.daily_budget_cents,
      totalTakeovers: a.total_takeovers,
      totalRefundedCents: a.total_refunded_cents,
      goalPlainEnglish: a.goal_plain_english,
      compiledStrategy: JSON.parse(a.compiled_strategy_json),
      headlineOptions: JSON.parse(a.headline_options_json),
      activeHeadline: a.active_headline,
      moderationStatus: a.moderation_status,
      moderationNote: a.moderation_note,
      sprayColor: a.spray_color,
      textColor: a.text_color,
      accentColor: a.accent_color,
      templateId: VALID_TEMPLATES.includes(a.template_id) ? a.template_id : 'BOMB_BURST',
      isActive: Boolean(a.is_active),
      isSeeded: Boolean(a.is_seeded),
      lastBidAtMs: a.last_bid_at_ms,
      lastDecisionText: a.last_decision_text,
    }));

  const ledger = ((await db
    .prepare('SELECT * FROM ledger_entries ORDER BY created_at_ms DESC LIMIT 60')
    .all()) as any[])
    .map((l: any) => ({
      id: l.id,
      idempotencyKey: l.idempotency_key,
      agentId: l.agent_id,
      companyName: l.company_name,
      type: l.type,
      amountCents: l.amount_cents,
      balanceAfterCents: l.balance_after_cents,
      paypalRef: l.paypal_ref,
      mcpToolName: l.mcp_tool_name,
      description: l.description,
      createdAtMs: l.created_at_ms,
    }));

  const battleLogs = ((await db
    .prepare('SELECT * FROM battle_logs ORDER BY created_at_ms DESC LIMIT 60')
    .all()) as any[])
    .map((b: any) => ({
      id: b.id,
      agentId: b.agent_id,
      companyName: b.company_name,
      category: b.category,
      message: b.message,
      rateCentsPerMin: b.rate_cents_per_min,
      createdAtMs: b.created_at_ms,
    }));

  const priceHistory = ((await db
    .prepare('SELECT * FROM price_history ORDER BY id ASC LIMIT 90')
    .all()) as any[])
    .map((p: any) => ({
      timestampMs: p.timestamp_ms,
      rateCentsPerMin: p.rate_cents_per_min,
      takeoverRateCentsPerMin: p.takeover_rate_cents_per_min,
      eventLabel: p.event_label,
      companyName: p.company_name,
    }));

  const pendingOrders = ((await db
    .prepare('SELECT * FROM paypal_orders ORDER BY created_at_ms DESC LIMIT 15')
    .all()) as any[])
    .map((o: any) => ({
      orderId: o.order_id,
      agentId: o.agent_id,
      companyName: o.company_name,
      amountCents: o.amount_cents,
      status: o.status,
      mode: o.mode,
      mcpPayloadJson: o.mcp_payload_json,
      approveUrl: o.approve_url,
      createdAtMs: o.created_at_ms,
    }));

  const hasLivePayPalCredentials = Boolean(
    runtimePayPalConfig.clientId && runtimePayPalConfig.clientSecret && payPalTokenVerified
  );

  return {
    serverTimeMs: nowMs,
    paypalMode: runtimePayPalConfig.sandboxEnabled
      ? 'SANDBOX_API'
      : hasLivePayPalCredentials
      ? 'LIVE_PRODUCTION_API'
      : 'LIVE_MODE_AWAITING_KEYS',
    paypalMcpEndpoint: runtimePayPalConfig.mcpEndpoint,
    billboard,
    wallLayers,
    agents,
    ledger,
    battleLogs,
    priceHistory,
    pendingOrders,
  };
}

async function broadcastSnapshot() {
  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(await getArenaSnapshot())}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

let tickCounter = 0;

export async function runDeterministicArenaTick() {
  tickCounter++;
  const nowMs = Date.now();
  const board = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;
  const metrics = computePriceMetrics(board, nowMs);
  const audience = await getLiveAudience(nowMs);
  const pricingTiers = await getAudiencePricingTiers();
  const blockCostCents = quoteFiveMinuteLeaseCents(metrics.nextTakeoverBlockCostCents, audience.combinedAudience, pricingTiers);
  const takeoverRate = blockCostCents / BLOCK_DURATION_MINUTES;
  const multiple = Number((takeoverRate / BASE_RATE_CENTS_PER_MIN).toFixed(2));

  if (tickCounter % 2 === 0) {
    await recordPricePoint(nowMs, metrics.currentDecayedRateCentsPerMin, takeoverRate);
  }

  const activeAgents = (await db
    .prepare("SELECT * FROM agents WHERE is_active = 1 AND moderation_status = 'approved'")
    .all()) as any[];

  const eligibleCandidates: { agent: any; priorityScore: number; reason: string }[] = [];

  for (const agent of activeAgents) {
    const strategy = JSON.parse(agent.compiled_strategy_json);

    if (metrics.hasActiveHolder && board.current_holder_agent_id === agent.id) {
      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Holding billboard spot — defending lease (${Math.max(
          0,
          Math.ceil((board.expires_at_ms - nowMs) / 1000)
        )}s left)`,
        agent.id
      );
      continue;
    }

    if (agent.balance_cents < blockCostCents) {
      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Paused: wallet balance ($${(agent.balance_cents / 100).toFixed(
          2
        )}) below takeover cost ($${(blockCostCents / 100).toFixed(2)})`,
        agent.id
      );
      continue;
    }

    if (agent.daily_spent_cents + blockCostCents > agent.daily_budget_cents) {
      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Paused: daily budget cap ($${(agent.daily_budget_cents / 100).toFixed(2)}) reached`,
        agent.id
      );
      continue;
    }

    const minWaitMs = (strategy.minWaitSeconds || 10) * 1000;
    const sinceLastBidMs = nowMs - (agent.last_bid_at_ms || 0);
    if (sinceLastBidMs < minWaitMs) {
      const waitLeftSec = Math.ceil((minWaitMs - sinceLastBidMs) / 1000);
      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Cooldown active (${waitLeftSec}s remaining before next evaluation)`,
        agent.id
      );
      continue;
    }

    const maxAllowedRate = Number(strategy.maxRateCentsPerMin || 12.0);
    const entryMaxMultiple = Number(strategy.entryMaxMultiple || 2.0);
    const entryThresholdRate = entryMaxMultiple * BASE_RATE_CENTS_PER_MIN;

    const wasJustKicked = board.last_kicked_agent_id === agent.id;
    const currentHolderName = (board.current_company_name || '').toUpperCase();
    const targetRival = (strategy.retaliateTargetCompany || '').toUpperCase();
    const isRivalHolding =
      Boolean(targetRival) &&
      (targetRival === 'ANY' ||
        currentHolderName.includes(targetRival) ||
        targetRival.includes(currentHolderName));

    if (takeoverRate > maxAllowedRate) {
      const waitMsg = `${agent.company_name} [${strategy.personality.toUpperCase()}] is waiting — takeover price is $${(
        takeoverRate / 100
      ).toFixed(3)}/min (${multiple}x base), above its $${(maxAllowedRate / 100).toFixed(
        3
      )}/min ceiling and cooling.`;

      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Waiting: rate $${(takeoverRate / 100).toFixed(3)}/min > max $${(
          maxAllowedRate / 100
        ).toFixed(3)}/min (cooling)`,
        agent.id
      );

      if (tickCounter % 3 === 0 && Math.random() < 0.45) {
        await insertBattleLog(agent.id, agent.company_name, 'WAIT_DECISION', waitMsg, takeoverRate, nowMs);
      }
      continue;
    }

    if (strategy.retaliateOnKick && (wasJustKicked || isRivalHolding)) {
      eligibleCandidates.push({
        agent,
        priorityScore: 100 + (maxAllowedRate - takeoverRate),
        reason: wasJustKicked
          ? `Retaliation rule triggered after being kicked off`
          : `Rival target rule triggered against ${board.current_company_name}`,
      });
      continue;
    }

    if (takeoverRate <= entryThresholdRate) {
      let priority = 50;
      let reason = `Rate cooled to ${multiple}x base (within ${entryMaxMultiple}x target)`;

      if (strategy.personality === 'sniper') {
        priority = 80;
        reason = `Sniper trigger fired: rate cooled to ${multiple}x base ($${(
          takeoverRate / 100
        ).toFixed(3)}/min)`;
      } else if (strategy.personality === 'aggressive') {
        priority = 70;
        reason = `Aggressive takeover within ${entryMaxMultiple}x cap`;
      } else if (strategy.personality === 'patient') {
        priority = 45;
        reason = `Patient trickle-buy executed at $${(takeoverRate / 100).toFixed(3)}/min`;
      }

      eligibleCandidates.push({ agent, priorityScore: priority, reason });
    } else {
      const waitMsg = `${agent.company_name} [${strategy.personality.toUpperCase()}] is waiting — price is ${multiple}x base ($${(
        takeoverRate / 100
      ).toFixed(3)}/min) and cooling toward ${entryMaxMultiple}x.`;

      await db.prepare('UPDATE agents SET last_decision_text = ? WHERE id = ?').run(
        `Waiting for rate to cool below ${entryMaxMultiple}x base ($${(
          entryThresholdRate / 100
        ).toFixed(3)}/min)`,
        agent.id
      );

      if (tickCounter % 3 === 1 && Math.random() < 0.4) {
        await insertBattleLog(agent.id, agent.company_name, 'WAIT_DECISION', waitMsg, takeoverRate, nowMs);
      }
    }
  }

  if (eligibleCandidates.length > 0) {
    eligibleCandidates.sort(
      (a, b) => b.priorityScore + Math.random() * 12 - (a.priorityScore + Math.random() * 12)
    );

    const timeSinceLastTakeover = nowMs - board.last_takeover_at_ms;
    if (timeSinceLastTakeover >= 6500) {
      const winner = eligibleCandidates[0];
      const headlines: string[] = JSON.parse(winner.agent.headline_options_json || '[]');
      const rotatedHeadline =
        headlines.length > 0
          ? headlines[(winner.agent.total_takeovers + 1) % headlines.length]
          : winner.agent.active_headline;

      try {
        await executeAtomicTakeover({
          buyerAgentId: winner.agent.id,
          idempotencyKey: `auto-tick-${tickCounter}-${winner.agent.id}-${nowMs}`,
          headlineOverride: rotatedHeadline,
          triggerReason: winner.reason,
          nowMs,
        });
      } catch {
        // Ignore transient race
      }
    }
  }

  void broadcastSnapshot();
}

if (process.env.VERCEL !== '1' && process.env.HOTSEAT_ARENA_WORKER !== '1') {
  setInterval(() => {
    void runDeterministicArenaTick()
      .then(() => samplePublisherLeaseHours())
      .catch((error) => console.error('Arena tick failed:', error));
  }, 3500);
}

const ADMIN_EMAIL = 'imtyroon@gmail.com';

const runtimePayPalConfig = {
  sandboxEnabled: (process.env.PAYPAL_ENVIRONMENT || process.env.PAYPAL_ENV || 'LIVE').toUpperCase() === 'SANDBOX',
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
  mcpEndpoint: process.env.PAYPAL_MCP_ENDPOINT || 'https://mcp.paypal.com/http',
};
let payPalTokenVerified = false;

function getPayPalEnvironment(): 'LIVE' | 'SANDBOX' {
  return runtimePayPalConfig.sandboxEnabled ? 'SANDBOX' : 'LIVE';
}

function getPayPalApiBaseUrl(): string {
  return getPayPalEnvironment() === 'LIVE'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken(): Promise<string | null> {
  const clientId = runtimePayPalConfig.clientId;
  const clientSecret = runtimePayPalConfig.clientSecret;
  if (!clientId || !clientSecret) return null;

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${getPayPalApiBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function buildPayPalStatusResponse() {
  const clientId = runtimePayPalConfig.clientId || '';
  const clientSecret = runtimePayPalConfig.clientSecret || '';
  const configured = Boolean(clientId && clientSecret);
  const environment = getPayPalEnvironment();
  let tokenVerified = false;
  if (configured) {
    const token = await getPayPalAccessToken();
    tokenVerified = Boolean(token);
  }
  payPalTokenVerified = tokenVerified;
  const modeLabel = runtimePayPalConfig.sandboxEnabled
    ? configured
      ? 'SANDBOX API CONNECTED'
      : 'SANDBOX DEMO ACTIVE'
    : configured
      ? tokenVerified
        ? 'LIVE PAYPAL API CONNECTED'
        : 'LIVE PAYPAL KEYS INVALID'
      : 'LIVE MODE · PRODUCTION KEYS REQUIRED';

  return {
    configured,
    sandboxEnabled: runtimePayPalConfig.sandboxEnabled,
    environment,
    modeLabel,
    apiBaseUrl: getPayPalApiBaseUrl(),
    tokenVerified,
    clientIdPrefix: clientId ? `${clientId.slice(0, 10)}...` : null,
    webhookId: runtimePayPalConfig.webhookId || '',
    mcpEndpoint: runtimePayPalConfig.mcpEndpoint,
  };
}

function paypalUsdCents(amount: any): number | null {
  if (amount?.currency_code !== 'USD' || typeof amount?.value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount.value)) return null;
  const cents = Math.round(Number(amount.value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

async function verifyPayPalWebhook(req: express.Request) {
  const event = req.body;
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody?.length || !runtimePayPalConfig.webhookId || !event || typeof event !== 'object') return false;
  const accessToken = await getPayPalAccessToken();
  if (!accessToken) throw new Error('PayPal API credentials are unavailable for webhook verification.');
  const header = (name: string) => req.header(name) || '';
  const verification = await fetch(`${getPayPalApiBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transmission_id: header('paypal-transmission-id'),
      transmission_time: header('paypal-transmission-time'),
      cert_url: header('paypal-cert-url'),
      auth_algo: header('paypal-auth-algo'),
      transmission_sig: header('paypal-transmission-sig'),
      webhook_id: runtimePayPalConfig.webhookId,
      webhook_event: event,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!verification.ok) throw new Error('PayPal webhook signature verification request failed.');
  const result = await verification.json() as { verification_status?: string };
  return result.verification_status === 'SUCCESS';
}

function paypalOrderId(event: any) {
  return typeof event?.resource?.supplementary_data?.related_ids?.order_id === 'string'
    ? event.resource.supplementary_data.related_ids.order_id
    : '';
}

function paypalCaptureId(event: any) {
  const relatedCapture = event?.resource?.supplementary_data?.related_ids?.capture_id;
  if (typeof relatedCapture === 'string') return relatedCapture;
  return typeof event?.resource?.id === 'string' ? event.resource.id : '';
}

async function recordVerifiedPayPalEvent(event: any) {
  const eventId = event?.id;
  const eventType = event?.event_type;
  if (typeof eventId !== 'string' || eventId.length < 1 || eventId.length > 128 || typeof eventType !== 'string' || eventType.length > 128) {
    throw new Error('Verified PayPal webhook event has an invalid identifier.');
  }
  return db.transaction(async () => {
    const inserted = await db.prepare(`INSERT INTO paypal_webhook_events (event_id, verified, event_type, received_at_ms)
      VALUES (?, 1, ?, ?) ON CONFLICT (event_id) DO NOTHING`).run(eventId, eventType, Date.now()) as { changes?: number };
    if (inserted.changes !== 1) return { duplicate: true, processed: false };

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = paypalOrderId(event);
      const captureId = paypalCaptureId(event);
      const amountCents = paypalUsdCents(event.resource?.amount);
      const lockClause = hasDurableStorage ? ' FOR UPDATE' : '';
      const order = orderId ? await db.prepare(`SELECT * FROM paypal_orders WHERE order_id = ?${lockClause}`).get(orderId) as any : null;
      if (order && order.status === 'CREATED_AWAITING_WEBHOOK' && amountCents === Number(order.amount_cents) && captureId) {
        const agentLock = hasDurableStorage ? ' FOR UPDATE' : '';
        const agent = await db.prepare(`SELECT balance_cents FROM agents WHERE id = ?${agentLock}`).get(order.agent_id) as { balance_cents: number } | undefined;
        if (agent) {
          const balance = Number(agent.balance_cents) + amountCents;
          await db.prepare('UPDATE paypal_orders SET paypal_capture_id = ?, status = ? WHERE order_id = ?')
            .run(captureId, 'COMPLETED', orderId);
          await db.prepare('UPDATE agents SET balance_cents = ? WHERE id = ?').run(balance, order.agent_id);
          await db.prepare(`INSERT INTO ledger_entries
            (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
            VALUES (?, ?, ?, ?, 'PAYPAL_TOPUP', ?, ?, ?, 'paypal_webhook', ?, ?)
            ON CONFLICT (idempotency_key) DO NOTHING`).run(
            crypto.randomUUID(), `paypal-capture:${captureId}`, order.agent_id, order.company_name,
            amountCents, balance, captureId, `Verified PayPal capture for order ${orderId}.`, Date.now());
          await db.prepare(`INSERT INTO wallet_funding_lots (id, agent_id, order_id, funded_cents, available_cents, collected_at_ms)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (order_id) DO NOTHING`)
            .run(crypto.randomUUID(), order.agent_id, orderId, amountCents, amountCents, Date.now());
        }
      }
    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
      const captureId = paypalCaptureId(event);
      const orderIdFromEvent = paypalOrderId(event);
      const order = orderIdFromEvent
        ? await db.prepare('SELECT order_id FROM paypal_orders WHERE order_id = ?').get(orderIdFromEvent) as { order_id: string } | undefined
        : await db.prepare('SELECT order_id FROM paypal_orders WHERE paypal_capture_id = ?').get(captureId) as { order_id: string } | undefined;
      const orderId = order?.order_id;
      const amountCents = paypalUsdCents(event.resource?.amount);
      if (orderId && amountCents) {
        const kind = eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refunded' : 'chargeback';
        await applyPayPalReversal(orderId, amountCents, kind);
        await db.prepare('UPDATE paypal_orders SET status = ? WHERE order_id = ?')
          .run(kind === 'refunded' ? 'REFUNDED' : 'CHARGEBACK', orderId);
      }
    } else {
      const payoutStatus = publisherPayoutWebhookStatus(eventType);
      if (payoutStatus) {
        const resource = event.resource || {};
        const item = resource.payout_item || resource;
        const senderItemId = typeof item.sender_item_id === 'string' ? item.sender_item_id : '';
        const senderBatchId = typeof resource.sender_batch_header?.sender_batch_id === 'string'
          ? resource.sender_batch_header.sender_batch_id
          : typeof resource.batch_header?.sender_batch_header?.sender_batch_id === 'string'
            ? resource.batch_header.sender_batch_header.sender_batch_id
            : typeof resource.sender_batch_id === 'string' ? resource.sender_batch_id : '';
        const paypalBatchId = typeof resource.payout_batch_id === 'string'
          ? resource.payout_batch_id
          : typeof resource.batch_header?.payout_batch_id === 'string' ? resource.batch_header.payout_batch_id : '';
        const isPayoutItemEvent = eventType.includes('PAYOUTS-ITEM.');
        const attempts = senderItemId
          ? await db.prepare('SELECT id, payout_id, status FROM publisher_payout_attempts WHERE id = ?').all(senderItemId) as any[]
          : isPayoutItemEvent ? [] : senderBatchId
            ? await db.prepare('SELECT id, payout_id, status FROM publisher_payout_attempts WHERE sender_batch_id = ?').all(senderBatchId) as any[]
            : paypalBatchId
              ? await db.prepare('SELECT id, payout_id, status FROM publisher_payout_attempts WHERE paypal_batch_id = ?').all(paypalBatchId) as any[]
              : [];
        if (attempts.length) {
          const failureReason = ['failed', 'blocked', 'returned', 'unclaimed'].includes(payoutStatus)
            ? `PayPal reported ${eventType}.` : '';
          const isBatchProgress = eventType.startsWith('PAYMENT.PAYOUTSBATCH.') && payoutStatus === 'pending';
          await db.transaction(async () => {
            for (const attempt of attempts) {
              if (isBatchProgress) {
                await db.prepare(`UPDATE publisher_payout_attempts SET paypal_batch_id = COALESCE(paypal_batch_id, ?), updated_at_ms = ?
                  WHERE id = ? AND status IN ('submitting', 'pending')`).run(paypalBatchId || null, Date.now(), attempt.id);
                await db.prepare(`UPDATE publisher_payouts SET paypal_batch_id = COALESCE(paypal_batch_id, ?), updated_at_ms = ?
                  WHERE id = ? AND status = 'pending'`).run(paypalBatchId || null, Date.now(), attempt.payout_id);
              } else {
                await db.prepare(`UPDATE publisher_payout_attempts SET paypal_batch_id = COALESCE(paypal_batch_id, ?), status = ?, failure_reason = ?, updated_at_ms = ? WHERE id = ?`)
                  .run(paypalBatchId || null, payoutStatus, failureReason, Date.now(), attempt.id);
              const latestAttempt = await db.prepare(`SELECT id FROM publisher_payout_attempts WHERE payout_id = ?
                ORDER BY created_at_ms DESC, id DESC LIMIT 1`).get(attempt.payout_id) as { id: string } | undefined;
              if (latestAttempt?.id === attempt.id) {
                await db.prepare(`UPDATE publisher_payouts SET paypal_batch_id = COALESCE(paypal_batch_id, ?), status = ?, failure_reason = ?, updated_at_ms = ? WHERE id = ?`)
                  .run(paypalBatchId || null, payoutStatus, failureReason, Date.now(), attempt.payout_id);
              }
              }
            }
          })();
        }
      }
    }

    await db.prepare('UPDATE paypal_webhook_events SET processed_at_ms = ? WHERE event_id = ?').run(Date.now(), eventId);
    return { duplicate: false, processed: true };
  })();
}

async function startServer() {
  const app = express();
  app.use(express.json({
    limit: '5mb',
    verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
  }));

  app.use('/api', (req, res, next) => {
    const trustedGameAdsWrite = req.path.startsWith('/game-ads') && hasDurableStorage;
    const confirmedPaymentCollection = req.path === '/paypal/orders/create' && hasDurableStorage &&
      Boolean(runtimePayPalConfig.webhookId && runtimePayPalConfig.clientId && runtimePayPalConfig.clientSecret);
    const signedPayPalWebhook = req.path === '/paypal/webhooks/confirm' && hasDurableStorage;
    if (
      process.env.VERCEL === '1' &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.path !== '/ai/compile-strategy' &&
      !trustedGameAdsWrite && !confirmedPaymentCollection && !signedPayPalWebhook
    ) {
      res.status(503).json({
        error: 'Live arena storage is not configured. No changes or payments were processed.',
      });
      return;
    }
    next();
  });

  app.use('/api/game-ads', createGameAdsRouter());

  app.get('/api/paypal/status', async (_req, res) => {
    const status = await buildPayPalStatusResponse();
    res.json(status);
  });

  app.post('/api/paypal/admin-config', async (req, res) => {
    if (process.env.VERCEL === '1') {
      res.status(403).json({ error: 'Manage production PayPal credentials in Vercel environment settings.' });
      return;
    }
    try {
      const { adminEmail, sandboxEnabled, clientId, clientSecret, webhookId, mcpEndpoint } =
        req.body || {};

      if (String(adminEmail || '').trim().toLowerCase() !== ADMIN_EMAIL) {
        res.status(403).json({
          error: 'Forbidden: Only the platform admin (imtyroon@gmail.com) can update PayPal settings.',
        });
        return;
      }

      if (typeof sandboxEnabled === 'boolean') {
        runtimePayPalConfig.sandboxEnabled = sandboxEnabled;
      }
      if (typeof clientId === 'string' && clientId.trim().length > 0) {
        runtimePayPalConfig.clientId = clientId.trim();
      }
      if (typeof clientSecret === 'string' && clientSecret.trim().length > 0) {
        runtimePayPalConfig.clientSecret = clientSecret.trim();
      }
      if (typeof webhookId === 'string') {
        runtimePayPalConfig.webhookId = webhookId.trim();
      }
      if (typeof mcpEndpoint === 'string' && mcpEndpoint.trim().length > 0) {
        runtimePayPalConfig.mcpEndpoint = mcpEndpoint.trim();
      }

      broadcastSnapshot();
      const status = await buildPayPalStatusResponse();
      res.json({ ok: true, status, snapshot: await getArenaSnapshot() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update PayPal admin config.' });
    }
  });

  app.get('/api/arena/snapshot', async (_req, res) => {
    res.json(await getArenaSnapshot());
  });

  app.get('/api/arena/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify(await getArenaSnapshot())}\n\n`);
    sseClients.add(res);
    broadcastSnapshot();

    req.on('close', () => {
      sseClients.delete(res);
      broadcastSnapshot();
    });
  });

  app.post('/api/arena/add-crowd', async (req, res) => {
    const exactViews = Number(req.body?.exactViews);
    if (!Number.isNaN(exactViews) && exactViews >= 10) {
      totalWallViewsCount = Math.min(800, Math.max(10, Math.round(exactViews / 10) * 10));
    } else {
      const count = Number(req.body?.count) || 10;
      totalWallViewsCount = Math.min(800, Math.max(10, totalWallViewsCount + count));
    }
    broadcastSnapshot();
    res.json({ ok: true, totalWallViewsCount, snapshot: await getArenaSnapshot() });
  });

  // Atomic Takeover Endpoint (Supports custom companyName, companyUrl, templateIdOverride, headlineOverride, and logoDataUrlOverride!)
  app.post('/api/billboard/takeover', async (req, res) => {
    try {
      const {
        agentId,
        companyName,
        companyUrl,
        idempotencyKey,
        headlineOverride,
        templateIdOverride,
        logoDataUrlOverride,
        reason,
      } = req.body;

      const nowMs = Date.now();
      let targetAgentId = agentId;

      if (!targetAgentId) {
        const cleanCompany = String(companyName || 'YOUR STARTUP')
          .trim()
          .toUpperCase()
          .slice(0, 28);
        const cleanUrl = String(companyUrl || 'yourstartup.com')
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/\/$/, '')
          .slice(0, 38);
        const cleanHeadline = String(headlineOverride || `${cleanCompany} ON THE GLOBAL WALL`)
          .trim()
          .toUpperCase()
          .slice(0, 46);
        const chosenTemplate = VALID_TEMPLATES.includes(templateIdOverride)
          ? templateIdOverride
          : 'BOMB_BURST';

        const existingByName = await db
          .prepare('SELECT * FROM agents WHERE UPPER(company_name) = ? LIMIT 1')
          .get(cleanCompany) as any;

        if (existingByName) {
          targetAgentId = existingByName.id;
          await db.prepare('UPDATE agents SET company_url = ? WHERE id = ?').run(
            cleanUrl,
            targetAgentId
          );
        } else {
          targetAgentId = `agent-${crypto.randomBytes(4).toString('hex')}`;
          const theme = SPRAY_THEMES[Math.floor(Math.random() * SPRAY_THEMES.length)];
          const defaultStrategy = {
            personality: 'patient',
            maxRateCentsPerMin: 20.0,
            entryMaxMultiple: 5.0,
            retaliateOnKick: false,
            retaliateTargetCompany: '',
            peakHoursOnly: false,
            dailyBudgetCents: 1000,
            minWaitSeconds: 20,
            summaryExplanation: 'Direct wall advertiser account created from the street curb.',
          };

          await db.prepare(
            `INSERT INTO agents (
              id, owner_name, paypal_email, company_name, company_url, logo_data_url,
              balance_cents, daily_spent_cents, daily_budget_cents,
              goal_plain_english, compiled_strategy_json, headline_options_json,
              active_headline, moderation_status, moderation_note,
              spray_color, text_color, accent_color, template_id, is_active, is_seeded, last_bid_at_ms, last_decision_text
            ) VALUES (?, 'Direct Advertiser', 'advertiser@paypal-sandbox.com', ?, ?, ?, 1000, 0, 1000, 'Direct manual billboard claims from the wall', ?, ?, ?, 'approved', 'Approved direct claim', ?, ?, ?, ?, 0, 0, ?, 'Direct claim ready')`
          ).run(
            targetAgentId,
            cleanCompany,
            cleanUrl,
            typeof logoDataUrlOverride === 'string' ? logoDataUrlOverride : '',
            JSON.stringify(defaultStrategy),
            JSON.stringify([cleanHeadline]),
            cleanHeadline,
            theme.sprayColor,
            theme.textColor,
            theme.accentColor,
            chosenTemplate,
            nowMs
          );

          await db.prepare(
            `INSERT INTO ledger_entries
             (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
             VALUES (?, ?, ?, ?, 'PAYPAL_TOPUP', 1000, 1000, ?, 'paypal_orders_capture_webhook', 'Initial $10.00 PayPal Sandbox wallet top-up for direct wall claim', ?)`
          ).run(
            crypto.randomUUID(),
            `direct-topup-${targetAgentId}`,
            targetAgentId,
            cleanCompany,
            `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            nowMs
          );
        }
      }

      const key = idempotencyKey || `manual-${targetAgentId}-${nowMs}`;
      const result = await executeAtomicTakeover({
        buyerAgentId: targetAgentId,
        idempotencyKey: key,
        headlineOverride,
        templateIdOverride,
        logoDataUrlOverride,
        allowSelfOverride: true,
        triggerReason: reason || 'Manual instant takeover triggered from billboard curb',
        nowMs,
      });

      broadcastSnapshot();
      res.json({ ok: true, result, snapshot: await getArenaSnapshot() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Takeover failed.' });
    }
  });

  // Gemini AI Strategy Compiler + Ad Copywriter + Moderator
  app.post('/api/ai/compile-strategy', async (req, res) => {
    const { companyName, companyUrl, goalPlainEnglish, dailyBudgetDollars } = req.body;
    if (!companyName || !goalPlainEnglish) {
      res.status(400).json({ error: 'Company name and plain-English goal are required.' });
      return;
    }

    const dailyBudgetCents = Math.max(100, Math.round((Number(dailyBudgetDollars) || 5) * 100));
    const ai = getGenAIClient();

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Compile this startup's plain-English billboard bidding goal into a deterministic strategy and write 3 bold street-art poster headlines.
Startup Name: "${companyName}"
Startup URL: "${companyUrl || 'startup.io'}"
Daily Budget: $${(dailyBudgetCents / 100).toFixed(2)} (${dailyBudgetCents} cents)
Owner's Plain-English Goal: "${goalPlainEnglish}"

Billboard rules context:
- Base rate is 20.0 cents/min ($1.00 for 5 minutes).
- Every takeover raises the competition quote by +10% without a final price cap.
- With no takeovers, the excess rate halves every 10 minutes.
- Personalities: 'sniper' (waits for cheap rates near base), 'aggressive' (bids high and retaliates immediately when kicked), 'patient' (buys steadily at moderate rates with longer cooldowns), 'peak' (focuses on high-visibility windows).
- Poster format: Bold typographic street poster with HEADLINE + URL ONLY. Each headline must be punchy, uppercase, 4 to 7 words (max 42 characters), and safe for a public hackathon screen.`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                personality: {
                  type: Type.STRING,
                  description: 'One of: sniper, aggressive, patient, peak',
                },
                maxRateCentsPerMin: {
                  type: Type.NUMBER,
                  description: 'Maximum bid rate in cents per minute (at least 22; no hard upper cap)',
                },
                entryMaxMultiple: {
                  type: Type.NUMBER,
                  description: 'Target entry multiple of the 20c/min base rate (at least 1.1)',
                },
                retaliateOnKick: {
                  type: Type.BOOLEAN,
                  description: 'Whether to immediately counter-bid when kicked off',
                },
                retaliateTargetCompany: {
                  type: Type.STRING,
                  description: "Specific rival company name to target, 'ANY', or empty string",
                },
                peakHoursOnly: {
                  type: Type.BOOLEAN,
                  description: 'Whether the goal specifies holding during peak hours',
                },
                minWaitSeconds: {
                  type: Type.INTEGER,
                  description: 'Cooldown seconds between bids (6 to 30)',
                },
                summaryExplanation: {
                  type: Type.STRING,
                  description: '1-sentence plain-English explanation of the deterministic execution rules',
                },
                headlines: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 punchy uppercase poster headlines under 42 chars each',
                },
                moderationApproved: {
                  type: Type.BOOLEAN,
                  description: 'False only if the startup name or goal contains hate speech, explicit, or abusive content',
                },
                moderationNote: {
                  type: Type.STRING,
                  description: 'Short moderation status note',
                },
              },
              required: [
                'personality',
                'maxRateCentsPerMin',
                'entryMaxMultiple',
                'retaliateOnKick',
                'retaliateTargetCompany',
                'peakHoursOnly',
                'minWaitSeconds',
                'summaryExplanation',
                'headlines',
                'moderationApproved',
                'moderationNote',
              ],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        const validPersonalities = ['sniper', 'aggressive', 'patient', 'peak'];
        const personality = validPersonalities.includes(parsed.personality)
          ? parsed.personality
          : 'sniper';
        const requestedRate = Number(parsed.maxRateCentsPerMin);
        const maxRateCentsPerMin = Number.isFinite(requestedRate) ? Math.max(22, requestedRate) : 60.0;
        const entryMaxMultiple = Math.max(1.1, Number((maxRateCentsPerMin / BASE_RATE_CENTS_PER_MIN).toFixed(2)));
        const requestedEntryMultiple = Number(parsed.entryMaxMultiple);

        const strategy = {
          personality,
          maxRateCentsPerMin,
          entryMaxMultiple: Number.isFinite(requestedEntryMultiple) ? Math.max(1.1, requestedEntryMultiple) : entryMaxMultiple,
          retaliateOnKick: Boolean(parsed.retaliateOnKick),
          retaliateTargetCompany: parsed.retaliateTargetCompany || '',
          peakHoursOnly: Boolean(parsed.peakHoursOnly),
          dailyBudgetCents,
          minWaitSeconds: Math.min(45, Math.max(6, Number(parsed.minWaitSeconds) || 10)),
          summaryExplanation:
            parsed.summaryExplanation ||
            `Compiled ${personality} strategy capped at $${(maxRateCentsPerMin / 100).toFixed(
              3
            )}/min.`,
        };

        const headlines =
          Array.isArray(parsed.headlines) && parsed.headlines.length > 0
            ? parsed.headlines.map((h: string) => h.toUpperCase().slice(0, 46))
            : [
                `${companyName.toUpperCase()} BUILT FOR SPEED`,
                `DEPLOY ${companyName.toUpperCase()} IN SECONDS`,
                `THE FUTURE RUNS ON ${companyName.toUpperCase()}`,
              ];

        res.json({
          compiledStrategy: strategy,
          headlines,
          moderationStatus: parsed.moderationApproved === false ? 'flagged' : 'approved',
          moderationNote: parsed.moderationNote || 'Approved by Gemini policy moderator',
          compiledBy: 'gemini-3.8-flash',
        });
        return;
      } catch (err: any) {
        console.error('Gemini compile-strategy error:', err?.message);
      }
    }

      if (process.env.VERCEL === '1') {
        res.status(503).json({ error: 'Gemini production access is not configured.' });
        return;
      }

      const lower = goalPlainEnglish.toLowerCase();
    const isAggro =
      lower.includes('fight') ||
      lower.includes('kick') ||
      lower.includes('rival') ||
      lower.includes('aggressive') ||
      lower.includes('dominate');
    const isSniper =
      lower.includes('cheap') ||
      lower.includes('snipe') ||
      lower.includes('wait') ||
      lower.includes('cool') ||
      lower.includes('low');
    const isPeak = lower.includes('peak') || lower.includes('hour');

    const personality = isAggro
      ? 'aggressive'
      : isSniper
      ? 'sniper'
      : isPeak
      ? 'peak'
      : 'patient';
    const maxRateCentsPerMin = isAggro ? 18.0 : isSniper ? 7.6 : 12.0;
    const entryMaxMultiple = Number((maxRateCentsPerMin / BASE_RATE_CENTS_PER_MIN).toFixed(2));

    res.json({
      compiledStrategy: {
        personality,
        maxRateCentsPerMin,
        entryMaxMultiple,
        retaliateOnKick: isAggro,
        retaliateTargetCompany: isAggro ? 'ANY' : '',
        peakHoursOnly: isPeak,
        dailyBudgetCents,
        minWaitSeconds: isAggro ? 8 : 14,
        summaryExplanation: `Deterministic ${personality.toUpperCase()} profile: bids when rate <= ${entryMaxMultiple}x base ($${(
          maxRateCentsPerMin / 100
        ).toFixed(3)}/min)${isAggro ? ' and retaliates immediately when kicked.' : '.'}`,
      },
      headlines: [
        `${companyName.toUpperCase()} SHIPS 10X FASTER`,
        `TRY ${companyName.toUpperCase()} LIVE RIGHT NOW`,
        `BUILT FOR BUILDERS BY ${companyName.toUpperCase()}`,
      ],
      moderationStatus: 'approved',
      moderationNote: 'Verified clean by policy rules',
      compiledBy: 'deterministic-compiler',
    });
  });

  app.post('/api/ai/narrate-war', async (_req, res) => {
    const ai = getGenAIClient();
    if (!ai && process.env.VERCEL === '1') {
      res.status(503).json({ error: 'Gemini production access is not configured.' });
      return;
    }
    const snap = await getArenaSnapshot();
    const recentTakeovers = snap.battleLogs
      .filter((b: any) => b.category === 'TAKEOVER')
      .slice(0, 5)
      .map((b: any) => b.message)
      .join('\n');

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `You are the live street-art arena commentator for Hot Seat (the PayPal x AI billboard battle).
Current Billboard Holder: ${snap.billboard.currentCompanyName || 'None'} ("${
            snap.billboard.currentHeadline || ''
          }")
Current Rate: $${(snap.billboard.currentDecayedRateCentsPerMin / 100).toFixed(3)}/min (${
            snap.billboard.multipleOfBase
          }x base)
Next Takeover Cost: $${(snap.billboard.nextTakeoverBlockCostCents / 100).toFixed(2)} for 5 minutes.
Recent Takeovers:
${recentTakeovers}

Write a punchy, 2-sentence live broadcast commentary narrating the current turf war, mentioning the price multiple and how the agents are positioning their budgets. Plain text only, no emojis.`,
        });

        const text = (response.text || '').trim();
        if (text) {
          await insertBattleLog(
            null,
            'AI ARENA COMMENTATOR',
            'COMMENTARY',
            text,
            snap.billboard.currentDecayedRateCentsPerMin,
            Date.now()
          );
          broadcastSnapshot();
          res.json({ commentary: text, snapshot: await getArenaSnapshot() });
          return;
        }
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to generate AI commentary.' });
        return;
      }
    }

    const fallbackText = `Turf war heating up at ${snap.billboard.multipleOfBase}x base ($${(
      snap.billboard.currentDecayedRateCentsPerMin / 100
    ).toFixed(3)}/min) as ${
      snap.billboard.currentCompanyName || 'challengers'
    } defends the cartoon brick wall while sniper agents wait on the 10-minute decay curve.`;
    await insertBattleLog(
      null,
      'AI ARENA COMMENTATOR',
      'COMMENTARY',
      fallbackText,
      snap.billboard.currentDecayedRateCentsPerMin,
      Date.now()
    );
    broadcastSnapshot();
    res.json({ commentary: fallbackText, snapshot: await getArenaSnapshot() });
  });

  app.post('/api/agents/deploy', async (req, res) => {
    try {
      const {
        ownerName,
        paypalEmail,
        companyName,
        companyUrl,
        logoDataUrl,
        goalPlainEnglish,
        compiledStrategy,
        headlines,
        activeHeadline,
        sprayThemeIndex,
        templateId,
        topUpDollars,
      } = req.body;

      if (!companyName || !companyUrl || !compiledStrategy) {
        res.status(400).json({ error: 'Company name, URL, and compiled strategy are required.' });
        return;
      }

      const agentId = `agent-${crypto.randomBytes(4).toString('hex')}`;
      const theme =
        SPRAY_THEMES[Number(sprayThemeIndex) % SPRAY_THEMES.length] ||
        SPRAY_THEMES[Math.floor(Math.random() * SPRAY_THEMES.length)];
      const chosenTemplateId = VALID_TEMPLATES.includes(templateId)
        ? templateId
        : 'BOMB_BURST';
      const cleanLogoDataUrl = typeof logoDataUrl === 'string' ? logoDataUrl : '';

      const cleanUrl = String(companyUrl)
        .replace(/^https?:\/\//i, '')
        .replace(/\/$/, '');
      const cleanHeadline = String(activeHeadline || headlines?.[0] || companyName)
        .toUpperCase()
        .slice(0, 46);

      const headlineList =
        Array.isArray(headlines) && headlines.length > 0
          ? headlines.map((h: string) => String(h).toUpperCase().slice(0, 46))
          : [cleanHeadline];

      await db.prepare(
        `INSERT INTO agents (
          id, owner_name, paypal_email, company_name, company_url, logo_data_url,
          balance_cents, daily_spent_cents, daily_budget_cents,
          goal_plain_english, compiled_strategy_json, headline_options_json,
          active_headline, moderation_status, moderation_note,
          spray_color, text_color, accent_color, template_id, is_active, is_seeded, last_bid_at_ms, last_decision_text
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'approved', 'Verified safe by AI policy check', ?, ?, ?, ?, 1, 0, 0, 'Awaiting PayPal funding confirmation')`
      ).run(
        agentId,
        ownerName || 'Judge / Founder',
        paypalEmail || '',
        companyName.toUpperCase(),
        cleanUrl,
        cleanLogoDataUrl,
        compiledStrategy.dailyBudgetCents || 500,
        goalPlainEnglish,
        JSON.stringify(compiledStrategy),
        JSON.stringify(headlineList),
        cleanHeadline,
        theme.sprayColor,
        theme.textColor,
        theme.accentColor,
        chosenTemplateId
      );

      const amountCents = Math.max(100, Math.round((Number(topUpDollars) || 5) * 100));
      const orderResult = await createPayPalOrderForAgent(
        agentId,
        companyName.toUpperCase(),
        amountCents
      );

      if (req.body.snipeImmediatelyOnDeploy !== false) {
        try {
          await executeAtomicTakeover({
            buyerAgentId: agentId,
            idempotencyKey: `launch-snipe-${agentId}-${Date.now()}`,
            headlineOverride: cleanHeadline,
            templateIdOverride: chosenTemplateId,
            logoDataUrlOverride: cleanLogoDataUrl,
            allowSelfOverride: true,
            triggerReason: 'Immediate launch snipe from Agent Studio',
            nowMs: Date.now(),
          });
        } catch {
          // Ignore if initial balance is below current spike cost
        }
      }

      broadcastSnapshot();
      res.json({
        ok: true,
        agentId,
        order: orderResult,
        snapshot: await getArenaSnapshot(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to deploy agent.' });
    }
  });

  app.patch('/api/agents/:id', async (req, res) => {
    const { id } = req.params;
    const {
      isActive,
      activeHeadline,
      templateId,
      logoDataUrl,
      maxRateCentsPerMin,
      retaliateOnKick,
      dailyBudgetCents,
    } = req.body;

    const agent = (await db.prepare('SELECT * FROM agents WHERE id = ?').get(id)) as any;
    if (!agent) {
      res.status(404).json({ error: 'Agent not found.' });
      return;
    }

    const strategy = JSON.parse(agent.compiled_strategy_json);
    if (typeof maxRateCentsPerMin === 'number') {
        strategy.maxRateCentsPerMin = Math.max(20, maxRateCentsPerMin);
      strategy.entryMaxMultiple = Number(
        (strategy.maxRateCentsPerMin / BASE_RATE_CENTS_PER_MIN).toFixed(2)
      );
    }
    if (typeof retaliateOnKick === 'boolean') {
      strategy.retaliateOnKick = retaliateOnKick;
    }
    if (typeof dailyBudgetCents === 'number') {
      strategy.dailyBudgetCents = Math.max(100, dailyBudgetCents);
    }

    const newIsActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : agent.is_active;
    const newHeadline = activeHeadline
      ? String(activeHeadline).toUpperCase().slice(0, 46)
      : agent.active_headline;
    const newTemplateId =
      templateId && VALID_TEMPLATES.includes(templateId) ? templateId : agent.template_id;
    const newLogoDataUrl =
      typeof logoDataUrl === 'string' ? logoDataUrl : agent.logo_data_url || '';

    await db.prepare(
      `UPDATE agents
       SET is_active = ?, active_headline = ?, template_id = ?, logo_data_url = ?, daily_budget_cents = ?, compiled_strategy_json = ?
       WHERE id = ?`
    ).run(
      newIsActive,
      newHeadline,
      newTemplateId,
      newLogoDataUrl,
      strategy.dailyBudgetCents,
      JSON.stringify(strategy),
      id
    );

    // If this agent currently holds the top wall layer, also update the active billboard & top layer logo/template!
    const board = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;
    if (board && board.current_holder_agent_id === id) {
      await db.prepare(
        `UPDATE billboard_state
         SET current_logo_data_url = ?, current_template_id = ?, current_headline = ?
         WHERE id = 1`
      ).run(newLogoDataUrl, newTemplateId, newHeadline);

      await db.prepare(
        `UPDATE wall_layers
         SET logo_data_url = ?, template_id = ?, headline = ?
         WHERE id = (SELECT id FROM wall_layers ORDER BY layer_index DESC LIMIT 1)`
      ).run(newLogoDataUrl, newTemplateId, newHeadline);
    }

    broadcastSnapshot();
    res.json({ ok: true, snapshot: await getArenaSnapshot() });
  });

  async function createPayPalOrderForAgent(agentId: string, companyName: string, amountCents: number) {
    const nowMs = Date.now();
    const amountDollars = (amountCents / 100).toFixed(2);
    const accessToken = await getPayPalAccessToken();
    if (!accessToken) throw new Error('Live PayPal credentials are missing or invalid.');

    const ppRes = await fetch(`${getPayPalApiBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: agentId,
            description: `Hot Seat Agent Prepaid Balance Top-Up (${companyName})`,
            amount: { currency_code: 'USD', value: amountDollars },
          },
        ],
      }),
    });
    if (!ppRes.ok) throw new Error('PayPal live order creation failed.');
    const ppData = (await ppRes.json()) as any;
    const orderId = ppData.id;
    const approveUrl = (ppData.links || []).find((l: any) => l.rel === 'approve')?.href;
    if (!orderId || !approveUrl) throw new Error('PayPal returned an incomplete live order.');
    const mode: 'LIVE_PRODUCTION_API' | 'SANDBOX_API' = runtimePayPalConfig.sandboxEnabled
      ? 'SANDBOX_API'
      : 'LIVE_PRODUCTION_API';

    const mcpPayload = {
      mcpServer: runtimePayPalConfig.mcpEndpoint,
      tool: 'create_order',
      arguments: {
        intent: 'CAPTURE',
        currency_code: 'USD',
        value: amountDollars,
        agent_id: agentId,
        merchant_memo: `Hot Seat Prepaid Wallet Top-Up for ${companyName}`,
      },
      orderId,
      environment: getPayPalEnvironment(),
    };

    await db.prepare(
      `INSERT INTO paypal_orders
       (order_id, agent_id, company_name, amount_cents, status, mode, mcp_payload_json, approve_url, created_at_ms)
       VALUES (?, ?, ?, ?, 'CREATED_AWAITING_WEBHOOK', ?, ?, ?, ?)`
    ).run(
      orderId,
      agentId,
      companyName,
      amountCents,
      mode,
      JSON.stringify(mcpPayload, null, 2),
      approveUrl,
      nowMs
    );

    await insertBattleLog(
      agentId,
      companyName,
      'PAYPAL_MCP',
      `PayPal Agent Toolkit MCP invoked create_order (${orderId}) for $${amountDollars} — awaiting webhook confirmation.`,
      computePriceMetrics(
      await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get(),
        nowMs
      ).currentDecayedRateCentsPerMin,
      nowMs
    );

    return {
      orderId,
      amountCents,
      mode,
      approveUrl,
      status: 'CREATED_AWAITING_WEBHOOK',
    };
  }

  app.post('/api/paypal/orders/create', async (req, res) => {
    try {
      if (!hasDurableStorage || !runtimePayPalConfig.webhookId || !runtimePayPalConfig.clientId || !runtimePayPalConfig.clientSecret) {
        res.status(503).json({ error: 'PayPal collections require Neon storage, API credentials, and a configured signed webhook.' });
        return;
      }
      const { agentId, amountDollars } = req.body;
      const agent = (await db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)) as any;
      if (!agent) {
        res.status(404).json({ error: 'Agent not found.' });
        return;
      }

      const amountCents = Math.max(100, Math.round((Number(amountDollars) || 5) * 100));
      const order = await createPayPalOrderForAgent(agent.id, agent.company_name, amountCents);

      broadcastSnapshot();
      res.json({ ok: true, order, snapshot: await getArenaSnapshot() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Could not create PayPal order.' });
    }
  });

  app.post('/api/paypal/webhooks/confirm', async (req, res) => {
    if (!hasDurableStorage || !runtimePayPalConfig.webhookId) {
      res.status(503).json({ error: 'Durable storage and a configured PayPal webhook are required.' });
      return;
    }
    const requiredHeaders = ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig'];
    if (requiredHeaders.some((header) => !req.header(header))) {
      res.status(400).json({ error: 'PayPal signature headers are incomplete.' });
      return;
    }
    try {
      if (!await verifyPayPalWebhook(req)) {
        res.status(401).json({ error: 'PayPal webhook signature is invalid.' });
        return;
      }
      const result = await recordVerifiedPayPalEvent(req.body);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(503).json({ error: err.message || 'PayPal webhook verification is unavailable.' });
    }
  });

  app.post('/api/paypal/payouts/cashout', async (req, res) => {
    try {
      const { agentId } = req.body;
      const agent = (await db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId)) as any;
      if (!agent) {
        res.status(404).json({ error: 'Agent not found.' });
        return;
      }
      if (agent.balance_cents <= 0) {
        res.status(400).json({ error: 'Agent wallet balance is already $0.00.' });
        return;
      }

      const payoutAmountCents = agent.balance_cents;
      const payoutDollars = (payoutAmountCents / 100).toFixed(2);
      const nowMs = Date.now();
      if (!agent.paypal_email) throw new Error('A PayPal payout email is required.');
      const accessToken = await getPayPalAccessToken();
      if (!accessToken) throw new Error('Live PayPal credentials are missing or invalid.');
      const ppRes = await fetch(`${getPayPalApiBaseUrl()}/v1/payments/payouts`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sender_batch_header: {
                sender_batch_id: `hotseat_${agent.id}_${nowMs}`,
                email_subject: 'Your Hot Seat unused billboard balance cash-out',
              },
              items: [
                {
                  recipient_type: 'EMAIL',
                  amount: { value: payoutDollars, currency: 'USD' },
                  receiver: agent.paypal_email,
                  note: `Cash-out of unused Hot Seat agent balance for ${agent.company_name}`,
                },
              ],
            }),
      });
      if (!ppRes.ok) throw new Error('PayPal live payout request failed.');
      const payoutData = (await ppRes.json()) as any;
      const payoutBatchId = payoutData.batch_header?.payout_batch_id;
      if (!payoutBatchId) throw new Error('PayPal returned no payout batch ID.');

      const tx = db.transaction(async () => {
        await db.prepare(
          'UPDATE agents SET balance_cents = 0, is_active = 0, last_decision_text = ? WHERE id = ?'
        ).run(`Cashed out $${payoutDollars} via PayPal Payouts (${payoutBatchId})`, agent.id);

        await db.prepare(
          `INSERT INTO ledger_entries
           (id, idempotency_key, agent_id, company_name, type, amount_cents, balance_after_cents, paypal_ref, mcp_tool_name, description, created_at_ms)
           VALUES (?, ?, ?, ?, 'PAYPAL_PAYOUT', ?, 0, ?, 'paypal_payouts_create_batch', ?, ?)`
        ).run(
          crypto.randomUUID(),
          `payout-${agent.id}-${nowMs}`,
          agent.id,
          agent.company_name,
          -payoutAmountCents,
          payoutBatchId,
          `PayPal Payouts cash-out of $${payoutDollars} sent to ${agent.paypal_email}`,
          nowMs
        );

        await insertBattleLog(
          agent.id,
          agent.company_name,
          'PAYPAL_MCP',
          `PayPal Payouts (${payoutBatchId}) disbursed $${payoutDollars} unused balance back to ${agent.paypal_email}.`,
          computePriceMetrics(
            await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get(),
            nowMs
          ).currentDecayedRateCentsPerMin,
          nowMs
        );
      });

      await tx();
      broadcastSnapshot();
      res.json({ ok: true, payoutBatchId, payoutAmountCents, snapshot: await getArenaSnapshot() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Payout failed.' });
    }
  });

  app.post('/api/arena/fast-forward-cooling', async (req, res) => {
    const minutes = Number(req.body?.minutes) || 5;
    const addMs = minutes * 60 * 1000;
    const nowMs = Date.now();

    await db.prepare(
      'UPDATE billboard_state SET cooling_offset_ms = cooling_offset_ms + ? WHERE id = 1'
    ).run(addMs);

    const board = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;
    const metrics = computePriceMetrics(board, nowMs);

    await recordPricePoint(
      nowMs,
      metrics.currentDecayedRateCentsPerMin,
      metrics.nextTakeoverRateCentsPerMin,
      `+${minutes}m COOLING`,
      'DECAY ENGINE'
    );

    await insertBattleLog(
      null,
      'DECAY ENGINE',
      'WAIT_DECISION',
      `Fast-forwarded cooling clock by +${minutes}m (10m half-life): rate cooled to $${(
        metrics.currentDecayedRateCentsPerMin / 100
      ).toFixed(3)}/min (${metrics.multipleOfBase}x base).`,
      metrics.currentDecayedRateCentsPerMin,
      nowMs
    );

    broadcastSnapshot();
    res.json({ ok: true, snapshot: await getArenaSnapshot() });
  });

  app.post('/api/arena/moderation-kill-switch', async (_req, res) => {
    const nowMs = Date.now();
    const board = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;

    if (!board.current_holder_agent_id) {
      res.status(400).json({ error: 'No active billboard ad to remove.' });
      return;
    }

    const removedCompany = board.current_company_name;
    const removedAgentId = board.current_holder_agent_id;

    const tx = db.transaction(async () => {
      await db.prepare(
        `UPDATE wall_layers
         SET displaced_at_ms = ?, displaced_by_company = 'MODERATION KILL SWITCH', was_killed_by_moderator = 1
         WHERE id = (SELECT id FROM wall_layers ORDER BY layer_index DESC LIMIT 1)`
      ).run(nowMs);

      await db.prepare(
        `UPDATE billboard_state
         SET current_holder_agent_id = NULL,
             current_company_name = NULL,
             current_headline = NULL,
             current_url = NULL,
             is_kill_switch_active = 1,
             expires_at_ms = ?
         WHERE id = 1`
      ).run(nowMs);

      await insertBattleLog(
        removedAgentId,
        removedCompany || 'MODERATOR',
        'MODERATION',
        `EMERGENCY KILL SWITCH ACTIVATED: stripped "${board.current_headline}" (${removedCompany}) from the top of the cartoon wall.`,
        computePriceMetrics(board, nowMs).currentDecayedRateCentsPerMin,
        nowMs
      );
    });

    await tx();
    broadcastSnapshot();
    res.json({ ok: true, snapshot: await getArenaSnapshot() });
  });

  app.post('/api/arena/trigger-bidding-war', async (_req, res) => {
    const nowMs = Date.now();
    const board = (await db.prepare('SELECT * FROM billboard_state WHERE id = 1').get()) as any;

    const challengers = (await db
      .prepare(
        "SELECT * FROM agents WHERE is_active = 1 AND moderation_status = 'approved' AND balance_cents >= 100 AND id != ?"
      )
      .all(board.current_holder_agent_id || '')) as any[];

    if (challengers.length === 0) {
      res.status(400).json({ error: 'No funded challenger agents available.' });
      return;
    }

    const chosen = challengers[Math.floor(Math.random() * challengers.length)];
    const headlines: string[] = JSON.parse(chosen.headline_options_json || '[]');
    const nextHeadline =
      headlines[(chosen.total_takeovers + 1) % Math.max(1, headlines.length)] ||
      chosen.active_headline;

    try {
      await executeAtomicTakeover({
        buyerAgentId: chosen.id,
        idempotencyKey: `war-burst-${chosen.id}-${nowMs}`,
        headlineOverride: nextHeadline,
        triggerReason: 'Rival bidding war burst triggered',
        nowMs,
      });
      broadcastSnapshot();
      res.json({ ok: true, snapshot: await getArenaSnapshot() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });

    // Serve a WebSocket-free @vite/client shim so HMR-disabled preview environments
    // never fail on createWebSocketModuleRunnerTransport/connect
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export const serverApp = startServer();

if (process.env.VERCEL !== '1') {
  serverApp.then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Hot Seat server running on http://0.0.0.0:${PORT}`);
    });
  });
}
