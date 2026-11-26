export const GAME_PRESENCE_TTL_SECONDS = 90;
export const GAME_PRESENCE_REFRESH_SECONDS = 30;
export const CREATIVE_REFRESH_SECONDS = 15;
export const PUBLISHER_SHARE_BPS = 2_000;

export type GamePlatform = 'unity' | 'unreal' | 'godot';

export interface GameHeartbeat {
  activePlayers: number;
  observedAt: string | number;
  maxPlayersPerServer: number;
  previousAcceptedPlayers?: number;
  previousAcceptedAtMs?: number;
  receivedAtMs: number;
}

export type HeartbeatDecision =
  | { accepted: true; flagged: false; expiresAtMs: number }
  | { accepted: true; flagged: true; expiresAtMs: number; reason: 'sudden_increase' }
  | { accepted: false; reason: 'invalid_count' | 'above_server_cap' | 'invalid_timestamp' };

export interface PublisherHours {
  publisherId: string;
  verified: boolean;
  playerHours: number;
}

export interface AudiencePricingTier {
  min: number;
  maxExclusive: number | null;
  multiplier: number;
  increasePer10k?: number;
}

export const DEFAULT_AUDIENCE_PRICING_TIERS: AudiencePricingTier[] = [
  { min: 0, maxExclusive: 100, multiplier: 1 },
  { min: 100, maxExclusive: 500, multiplier: 1.25 },
  { min: 500, maxExclusive: 2_000, multiplier: 1.5 },
  { min: 2_000, maxExclusive: 10_000, multiplier: 2 },
  { min: 10_000, maxExclusive: null, multiplier: 2.5, increasePer10k: 0.5 },
];

export function isAudiencePricingTiers(value: unknown): value is AudiencePricingTier[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) return false;
  let expectedMin = 0;
  for (let index = 0; index < value.length; index += 1) {
    const tier = value[index] as Partial<AudiencePricingTier>;
    if (!Number.isSafeInteger(tier.min) || tier.min !== expectedMin || !Number.isFinite(tier.multiplier) || Number(tier.multiplier) < 0) return false;
    if (tier.maxExclusive === null) {
      if (index !== value.length - 1 || (tier.increasePer10k !== undefined && (!Number.isFinite(tier.increasePer10k) || tier.increasePer10k < 0))) return false;
    } else {
      if (!Number.isSafeInteger(tier.maxExclusive) || Number(tier.maxExclusive) <= Number(tier.min) || index === value.length - 1 || tier.increasePer10k !== undefined) return false;
      expectedMin = Number(tier.maxExclusive);
    }
  }
  return value[value.length - 1]?.maxExclusive === null;
}

export function audienceTierMultiplier(audience: number, tiers: AudiencePricingTier[] = DEFAULT_AUDIENCE_PRICING_TIERS): number {
  const count = Math.max(0, Math.floor(audience));
  const tier = tiers.find((candidate) => candidate.maxExclusive === null || count < candidate.maxExclusive) || tiers[tiers.length - 1];
  return tier.multiplier + (tier.maxExclusive === null ? ((count - tier.min) / 10_000) * (tier.increasePer10k || 0) : 0);
}

export function quoteFiveMinuteLeaseCents(
  competitionQuoteCents: number,
  audience: number,
  tiers: AudiencePricingTier[] = DEFAULT_AUDIENCE_PRICING_TIERS
): number {
  const baseCents = Math.max(100, Number.isFinite(competitionQuoteCents) ? competitionQuoteCents : 0);
  return Math.round(baseCents * audienceTierMultiplier(audience, tiers));
}

export function eligibleLeaseNetSpendCents(input: {
  collectedCents: number;
  refundedCents: number;
  chargebackCents: number;
  remittanceTaxCents: number;
}) {
  const amount = (value: number) => Number.isFinite(value) ? value : 0;
  return Math.max(0, amount(input.collectedCents) - amount(input.refundedCents) - amount(input.chargebackCents) - amount(input.remittanceTaxCents));
}

export function decideHeartbeat(input: GameHeartbeat): HeartbeatDecision {
  const { activePlayers, maxPlayersPerServer, observedAt, receivedAtMs } = input;
  if (!Number.isSafeInteger(activePlayers) || activePlayers < 0) {
    return { accepted: false, reason: 'invalid_count' };
  }
  if (!Number.isSafeInteger(maxPlayersPerServer) || maxPlayersPerServer < 1 || activePlayers > maxPlayersPerServer) {
    return { accepted: false, reason: 'above_server_cap' };
  }

  const observedAtMs = typeof observedAt === 'number' ? observedAt : Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs) || observedAtMs <= 0) {
    return { accepted: false, reason: 'invalid_timestamp' };
  }

  const expiresAtMs = receivedAtMs + GAME_PRESENCE_TTL_SECONDS * 1000;
  const previousCount = input.previousAcceptedPlayers;
  const previousAtMs = input.previousAcceptedAtMs;
  const withinSpikeWindow =
    Number.isSafeInteger(previousCount) &&
    Number.isFinite(previousAtMs) &&
    receivedAtMs >= (previousAtMs as number) &&
    receivedAtMs - (previousAtMs as number) <= 60_000;
  const suddenIncrease =
    withinSpikeWindow &&
    activePlayers > (previousCount as number) &&
    activePlayers - (previousCount as number) > Math.max(25, (previousCount as number) * 3);

  if (suddenIncrease) {
    return {
      accepted: true,
      flagged: true,
      expiresAtMs: (previousAtMs as number) + GAME_PRESENCE_TTL_SECONDS * 1000,
      reason: 'sudden_increase',
    };
  }
  return { accepted: true, flagged: false, expiresAtMs };
}

export function aggregateAudience(input: {
  browserSessionIds: string[];
  gamePresence: Array<{ acceptedPlayers: number; expiresAtMs: number; flagged: boolean }>;
  nowMs: number;
}) {
  const activeWebsiteSessions = new Set(input.browserSessionIds.filter(Boolean)).size;
  const activeGamePlayers = input.gamePresence.reduce((total, sample) => {
    if (sample.expiresAtMs <= input.nowMs) return total;
    return total + (Number.isSafeInteger(sample.acceptedPlayers) && sample.acceptedPlayers >= 0 ? sample.acceptedPlayers : 0);
  }, 0);
  return {
    activeWebsiteSessions,
    activeGamePlayers,
    combinedAudience: activeWebsiteSessions + activeGamePlayers,
  };
}

export function allocatePublisherShare(
  eligibleNetSpendCents: number,
  publishers: PublisherHours[]
) {
  const eligibleSpend = Math.max(0, Number.isFinite(eligibleNetSpendCents) ? eligibleNetSpendCents : 0);
  const verified = publishers.filter(
    (publisher) => publisher.verified && Number.isFinite(publisher.playerHours) && publisher.playerHours > 0
  );
  const totalPlayerHours = verified.reduce((total, publisher) => total + publisher.playerHours, 0);
  if (totalPlayerHours <= 0) {
    return { poolCents: eligibleSpend * (PUBLISHER_SHARE_BPS / 10_000), returnedToHotSeatCents: eligibleSpend * (PUBLISHER_SHARE_BPS / 10_000), allocations: [] };
  }

  const poolCents = eligibleSpend * (PUBLISHER_SHARE_BPS / 10_000);
  const allocations = verified.map((publisher) => ({
    publisherId: publisher.publisherId,
    playerHours: publisher.playerHours,
    amountCents: (poolCents * publisher.playerHours) / totalPlayerHours,
  }));
  return { poolCents, returnedToHotSeatCents: 0, allocations };
}

export function allocateIntegerPublisherShare(
  eligibleNetSpendCents: number,
  publishers: PublisherHours[]
) {
  const eligibleSpend = Math.max(0, Number.isFinite(eligibleNetSpendCents) ? eligibleNetSpendCents : 0);
  const poolCents = Math.round(eligibleSpend * (PUBLISHER_SHARE_BPS / 10_000));
  const verified = publishers.filter(
    (publisher) => publisher.verified && Number.isFinite(publisher.playerHours) && publisher.playerHours > 0
  );
  const totalPlayerHours = verified.reduce((total, publisher) => total + publisher.playerHours, 0);
  if (totalPlayerHours <= 0) return { poolCents, returnedToHotSeatCents: poolCents, allocations: [] };

  const shares = verified.map((publisher) => {
    const exactCents = poolCents * publisher.playerHours / totalPlayerHours;
    const wholeCents = Math.floor(exactCents);
    return { publisherId: publisher.publisherId, playerHours: publisher.playerHours, amountCents: wholeCents, remainder: exactCents - wholeCents };
  });
  let remainderCents = poolCents - shares.reduce((sum, share) => sum + share.amountCents, 0);
  const remainderOrder = [...shares].sort((left, right) => right.remainder - left.remainder || left.publisherId.localeCompare(right.publisherId));
  for (let index = 0; remainderCents > 0; index += 1, remainderCents -= 1) {
    remainderOrder[index % remainderOrder.length].amountCents += 1;
  }
  return {
    poolCents,
    returnedToHotSeatCents: 0,
    allocations: shares.map(({ publisherId, playerHours, amountCents }) => ({ publisherId, playerHours, amountCents })),
  };
}

export function getPublisherPayoutGate(input: {
  durableStorage: boolean;
  signedWebhooks: boolean;
  kenyaCorridorReady: boolean;
  taxReady: boolean;
  providerCredentialsReady: boolean;
  recipientEncryptionReady: boolean;
  explicitlyEnabled: boolean;
}) {
  const checks = {
    durableStorage: input.durableStorage,
    signedWebhooks: input.signedWebhooks,
    kenyaCorridorReady: input.kenyaCorridorReady,
    taxReady: input.taxReady,
    providerCredentialsReady: input.providerCredentialsReady,
    recipientEncryptionReady: input.recipientEncryptionReady,
    explicitlyEnabled: input.explicitlyEnabled,
  };
  return { enabled: Object.values(checks).every(Boolean), checks };
}

export function toCreativeManifest(input: {
  placementId: string;
  creativeId: string;
  revision: string;
  assetUrl: string;
  aspectRatio: number;
  companyName: string;
  headline: string;
  validUntil: string;
}) {
  return {
    schemaVersion: 1,
    placementId: input.placementId,
    creativeId: input.creativeId,
    revision: input.revision,
    format: 'image' as const,
    platformAsset: { assetUrl: input.assetUrl },
    aspectRatio: input.aspectRatio,
    companyName: input.companyName,
    headline: input.headline,
    validUntil: input.validUntil,
    refreshAfterSeconds: CREATIVE_REFRESH_SECONDS,
  };
}
