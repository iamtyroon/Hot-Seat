export type AgentPersonality = 'sniper' | 'aggressive' | 'patient' | 'peak';

export type AdTemplateId =
  | 'BOMB_BURST'
  | 'CROWN_TAG'
  | 'WHEATPASTE_POSTER'
  | 'SPRAY_CLOUD'
  | 'SKATE_DECK'
  | 'NEON_ARCADE';

export interface CompiledStrategy {
  personality: AgentPersonality;
  maxRateCentsPerMin: number; // 4.0 to 40.0
  entryMaxMultiple: number; // 1.0 to 10.0 (multiple of 4c/min base)
  retaliateOnKick: boolean;
  retaliateTargetCompany: string; // '' or specific rival name or 'ANY'
  peakHoursOnly: boolean;
  dailyBudgetCents: number;
  minWaitSeconds: number;
  summaryExplanation: string;
}

export interface AgentRecord {
  id: string;
  ownerName: string;
  paypalEmail: string;
  companyName: string;
  companyUrl: string;
  logoDataUrl?: string;
  balanceCents: number;
  dailySpentCents: number;
  dailyBudgetCents: number;
  totalTakeovers: number;
  totalRefundedCents: number;
  goalPlainEnglish: string;
  compiledStrategy: CompiledStrategy;
  headlineOptions: string[];
  activeHeadline: string;
  moderationStatus: 'approved' | 'flagged';
  moderationNote: string;
  sprayColor: string;
  textColor: string;
  accentColor: string;
  templateId: AdTemplateId;
  isActive: boolean;
  isSeeded: boolean;
  lastBidAtMs: number;
  lastDecisionText: string;
}

export interface WallLayer {
  id: string;
  layerIndex: number;
  agentId: string;
  companyName: string;
  headline: string;
  url: string;
  logoDataUrl?: string;
  sprayColor: string;
  textColor: string;
  accentColor: string;
  templateId: AdTemplateId;
  rotationDeg: number;
  offsetXPercent: number;
  offsetYPercent: number;
  splatterSeed: number;
  rateCentsPerMin: number;
  blockCostCents: number;
  createdAtMs: number;
  displacedAtMs: number | null;
  displacedByCompany: string | null;
  refundedCents: number;
  wasKilledByModerator: boolean;
}

export interface BillboardState {
  currentHolderAgentId: string | null;
  currentCompanyName: string | null;
  currentHeadline: string | null;
  currentUrl: string | null;
  currentLogoDataUrl?: string | null;
  currentSprayColor: string | null;
  currentTextColor: string | null;
  currentTemplateId: AdTemplateId | null;
  ratePaidCentsPerMin: number;
  blockCostCents: number;
  startedAtMs: number;
  expiresAtMs: number;
  lastTakeoverAtMs: number;
  lastTakeoverRateCentsPerMin: number;
  coolingOffsetMs: number;
  currentDecayedRateCentsPerMin: number;
  nextTakeoverRateCentsPerMin: number;
  nextTakeoverBlockCostCents: number;
  multipleOfBase: number;
  isKillSwitchActive: boolean;
  totalTakeoversCount: number;
  lastKickedAgentId: string | null;
  activeViewersCount: number;
  totalWallViewsCount: number;
}

export interface LedgerEntry {
  id: string;
  idempotencyKey: string;
  agentId: string;
  companyName: string;
  type: 'PAYPAL_TOPUP' | 'TAKEOVER_BUY' | 'PRORATA_REFUND' | 'PAYPAL_PAYOUT' | 'KILLSWITCH_REFUND';
  amountCents: number; // positive for credit, negative for debit
  balanceAfterCents: number;
  paypalRef: string;
  mcpToolName: string;
  description: string;
  createdAtMs: number;
}

export interface BattleLogEntry {
  id: string;
  agentId: string | null;
  companyName: string;
  category: 'TAKEOVER' | 'WAIT_DECISION' | 'REFUND' | 'PAYPAL_MCP' | 'MODERATION' | 'COMMENTARY';
  message: string;
  rateCentsPerMin: number;
  createdAtMs: number;
}

export interface PricePoint {
  timestampMs: number;
  rateCentsPerMin: number;
  takeoverRateCentsPerMin: number;
  eventLabel?: string;
  companyName?: string;
}

export interface PayPalPendingOrder {
  orderId: string;
  agentId: string;
  companyName: string;
  amountCents: number;
  status: 'CREATED_AWAITING_WEBHOOK' | 'WEBHOOK_CONFIRMED';
  mode: 'LIVE_SANDBOX_API' | 'SANDBOX_SIMULATION';
  mcpPayloadJson: string;
  approveUrl: string;
  createdAtMs: number;
}

export interface ArenaSnapshot {
  serverTimeMs: number;
  paypalMode: 'LIVE_SANDBOX_API' | 'SANDBOX_SIMULATION';
  paypalMcpEndpoint: string;
  billboard: BillboardState;
  wallLayers: WallLayer[];
  agents: AgentRecord[];
  ledger: LedgerEntry[];
  battleLogs: BattleLogEntry[];
  priceHistory: PricePoint[];
  pendingOrders: PayPalPendingOrder[];
}
