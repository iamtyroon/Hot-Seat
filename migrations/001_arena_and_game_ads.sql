CREATE TABLE IF NOT EXISTS billboard_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_holder_agent_id TEXT,
  current_company_name TEXT,
  current_headline TEXT,
  current_url TEXT,
  current_logo_data_url TEXT NOT NULL DEFAULT '',
  current_spray_color TEXT,
  current_text_color TEXT,
  current_template_id TEXT NOT NULL DEFAULT 'BOMB_BURST',
  rate_paid_cents_per_min DOUBLE PRECISION NOT NULL DEFAULT 20.0,
  block_cost_cents INTEGER NOT NULL DEFAULT 100,
  started_at_ms BIGINT NOT NULL DEFAULT 0,
  expires_at_ms BIGINT NOT NULL DEFAULT 0,
  last_takeover_at_ms BIGINT NOT NULL DEFAULT 0,
  last_takeover_rate_cents_per_min DOUBLE PRECISION NOT NULL DEFAULT 20.0,
  cooling_offset_ms BIGINT NOT NULL DEFAULT 0,
  is_kill_switch_active SMALLINT NOT NULL DEFAULT 0,
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
  balance_cents BIGINT NOT NULL DEFAULT 0,
  daily_spent_cents BIGINT NOT NULL DEFAULT 0,
  daily_budget_cents BIGINT NOT NULL DEFAULT 500,
  total_takeovers INTEGER NOT NULL DEFAULT 0,
  total_refunded_cents BIGINT NOT NULL DEFAULT 0,
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
  is_active SMALLINT NOT NULL DEFAULT 1,
  is_seeded SMALLINT NOT NULL DEFAULT 0,
  last_bid_at_ms BIGINT NOT NULL DEFAULT 0,
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
  rotation_deg DOUBLE PRECISION NOT NULL,
  offset_x_percent DOUBLE PRECISION NOT NULL,
  offset_y_percent DOUBLE PRECISION NOT NULL,
  splatter_seed INTEGER NOT NULL,
  rate_cents_per_min DOUBLE PRECISION NOT NULL,
  block_cost_cents INTEGER NOT NULL,
  created_at_ms BIGINT NOT NULL,
  displaced_at_ms BIGINT,
  displaced_by_company TEXT,
  refunded_cents BIGINT NOT NULL DEFAULT 0,
  was_killed_by_moderator SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  paypal_ref TEXT NOT NULL,
  mcp_tool_name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS battle_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  company_name TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  rate_cents_per_min DOUBLE PRECISION NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  timestamp_ms BIGINT NOT NULL,
  rate_cents_per_min DOUBLE PRECISION NOT NULL,
  takeover_rate_cents_per_min DOUBLE PRECISION NOT NULL,
  event_label TEXT,
  company_name TEXT
);

CREATE TABLE IF NOT EXISTS paypal_orders (
  order_id TEXT PRIMARY KEY,
  paypal_capture_id TEXT UNIQUE,
  agent_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  mcp_payload_json TEXT NOT NULL,
  approve_url TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (country_code = 'KE'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
  project_access_evidence TEXT NOT NULL DEFAULT '',
  trusted_server_evidence TEXT NOT NULL DEFAULT '',
  paypal_email_ciphertext TEXT NOT NULL DEFAULT '',
  created_at_ms BIGINT NOT NULL,
  verified_at_ms BIGINT,
  verified_by_uid TEXT
);

CREATE TABLE IF NOT EXISTS publisher_eligibility_evidence (
  publisher_id TEXT PRIMARY KEY REFERENCES publishers(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL CHECK (country_code = 'KE'),
  evidence_text TEXT NOT NULL,
  submitted_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS publisher_credentials (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at_ms BIGINT NOT NULL,
  last_used_at_ms BIGINT,
  revoked_at_ms BIGINT
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('unity', 'unreal', 'godot')),
  max_players_per_server INTEGER NOT NULL CHECK (max_players_per_server > 0),
  project_evidence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
  created_at_ms BIGINT NOT NULL,
  verified_at_ms BIGINT,
  UNIQUE (publisher_id, name)
);

CREATE TABLE IF NOT EXISTS placements (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aspect_ratio DOUBLE PRECISION NOT NULL DEFAULT 2.0 CHECK (aspect_ratio > 0),
  enabled SMALLINT NOT NULL DEFAULT 0,
  created_at_ms BIGINT NOT NULL,
  UNIQUE (game_id, name)
);

CREATE TABLE IF NOT EXISTS active_creatives (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  creative_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  company_name TEXT NOT NULL,
  headline TEXT NOT NULL,
  company_url TEXT NOT NULL,
  logo_data_url TEXT NOT NULL DEFAULT '',
  spray_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  template_id TEXT NOT NULL,
  asset_data BYTEA,
  valid_until_ms BIGINT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_presence (
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  accepted_players INTEGER NOT NULL CHECK (accepted_players >= 0),
  accepted_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  pending_players INTEGER,
  flagged_at_ms BIGINT,
  PRIMARY KEY (publisher_id, game_id, server_id)
);
CREATE INDEX IF NOT EXISTS game_presence_expiry_idx ON game_presence (expires_at_ms);

CREATE TABLE IF NOT EXISTS browser_presence (
  session_id TEXT PRIMARY KEY,
  refreshed_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_presence_expiry_idx ON browser_presence (expires_at_ms);

CREATE TABLE IF NOT EXISTS browser_presence_creation_limits (
  client_hash TEXT PRIMARY KEY,
  window_started_at_ms BIGINT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS game_heartbeat_limits (
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  window_started_at_ms BIGINT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publisher_id, game_id, server_id)
);

CREATE TABLE IF NOT EXISTS game_server_credentials (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at_ms BIGINT NOT NULL,
  last_used_at_ms BIGINT,
  revoked_at_ms BIGINT
);

CREATE INDEX IF NOT EXISTS game_server_credentials_game_idx ON game_server_credentials (game_id, revoked_at_ms);

CREATE TABLE IF NOT EXISTS game_server_credential_bindings (
  credential_id TEXT PRIMARY KEY REFERENCES game_server_credentials(id) ON DELETE CASCADE,
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_server_credential_bindings_server_idx ON game_server_credential_bindings (game_id, server_id);

CREATE TABLE IF NOT EXISTS game_presence_review_events (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  submitted_players INTEGER NOT NULL,
  previous_players INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at_ms BIGINT NOT NULL,
  reviewed_at_ms BIGINT,
  reviewed_by_uid TEXT
);

CREATE INDEX IF NOT EXISTS game_presence_review_pending_idx ON game_presence_review_events (status, created_at_ms);

CREATE TABLE IF NOT EXISTS game_ad_leases (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  quote_cents BIGINT NOT NULL CHECK (quote_cents >= 100),
  collected_cents BIGINT NOT NULL DEFAULT 0,
  refunded_cents BIGINT NOT NULL DEFAULT 0,
  chargeback_cents BIGINT NOT NULL DEFAULT 0,
  remittance_tax_cents BIGINT NOT NULL DEFAULT 0,
  collection_status TEXT NOT NULL CHECK (collection_status IN ('unconfirmed', 'confirmed', 'refunded', 'chargeback')) DEFAULT 'unconfirmed',
  started_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS game_ad_leases_month_idx ON game_ad_leases (collection_status, started_at_ms);

CREATE TABLE IF NOT EXISTS wallet_funding_lots (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  order_id TEXT NOT NULL UNIQUE REFERENCES paypal_orders(order_id),
  funded_cents BIGINT NOT NULL CHECK (funded_cents > 0),
  available_cents BIGINT NOT NULL CHECK (available_cents >= 0),
  refunded_cents BIGINT NOT NULL DEFAULT 0,
  chargeback_cents BIGINT NOT NULL DEFAULT 0,
  collected_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_ad_lease_funding (
  lease_id TEXT NOT NULL REFERENCES game_ad_leases(id),
  funding_id TEXT NOT NULL REFERENCES wallet_funding_lots(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  refunded_cents BIGINT NOT NULL DEFAULT 0,
  chargeback_cents BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (lease_id, funding_id)
);

CREATE TABLE IF NOT EXISTS game_viewable_impressions (
  placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  window_started_at_ms BIGINT NOT NULL,
  viewable_count INTEGER NOT NULL CHECK (viewable_count >= 0),
  reported_at_ms BIGINT NOT NULL,
  PRIMARY KEY (placement_id, server_id, window_started_at_ms)
);
CREATE INDEX IF NOT EXISTS game_viewable_impressions_day_idx ON game_viewable_impressions (window_started_at_ms);

CREATE TABLE IF NOT EXISTS publisher_lease_hours (
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  lease_id TEXT NOT NULL,
  lease_month TEXT NOT NULL,
  player_hours NUMERIC(20, 8) NOT NULL DEFAULT 0,
  last_sample_at_ms BIGINT NOT NULL,
  PRIMARY KEY (publisher_id, lease_id, lease_month)
);

CREATE TABLE IF NOT EXISTS publisher_revenue_pools (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  lease_month TEXT NOT NULL,
  eligible_net_spend_cents BIGINT NOT NULL,
  remittance_tax_cents BIGINT NOT NULL DEFAULT 0,
  publisher_pool_cents BIGINT NOT NULL,
  returned_to_hotseat_cents BIGINT NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  reconciled_at_ms BIGINT NOT NULL,
  UNIQUE (lease_id, lease_month)
);

CREATE TABLE IF NOT EXISTS publisher_share_accruals (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES publisher_revenue_pools(id),
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  player_hours NUMERIC(20, 8) NOT NULL,
  gross_share_cents BIGINT NOT NULL,
  withholding_cents BIGINT NOT NULL DEFAULT 0,
  net_payable_cents BIGINT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  UNIQUE (pool_id, publisher_id)
);

CREATE TABLE IF NOT EXISTS publisher_share_adjustments (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  accrual_id TEXT NOT NULL REFERENCES publisher_share_accruals(id),
  amount_cents BIGINT NOT NULL,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS publisher_share_adjustments_publisher_idx ON publisher_share_adjustments (publisher_id, created_at_ms);

CREATE TABLE IF NOT EXISTS publisher_payouts (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  period TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('payable', 'pending', 'paid', 'failed', 'blocked', 'returned', 'unclaimed', 'rolled_forward')),
  idempotency_key TEXT NOT NULL UNIQUE,
  paypal_batch_id TEXT,
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS publisher_payout_attempts (
  id TEXT PRIMARY KEY,
  payout_id TEXT NOT NULL REFERENCES publisher_payouts(id),
  sender_batch_id TEXT NOT NULL,
  paypal_batch_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('submitting', 'pending', 'paid', 'failed', 'blocked', 'returned', 'unclaimed')),
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS publisher_payout_attempts_sender_batch_idx ON publisher_payout_attempts (sender_batch_id);
CREATE INDEX IF NOT EXISTS publisher_payout_attempts_batch_idx ON publisher_payout_attempts (paypal_batch_id);

CREATE TABLE IF NOT EXISTS publisher_tax_profiles (
  publisher_id TEXT PRIMARY KEY REFERENCES publishers(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL CHECK (country_code = 'KE'),
  status TEXT NOT NULL CHECK (status IN ('unresolved', 'verified')) DEFAULT 'unresolved',
  tax_details_ciphertext TEXT NOT NULL DEFAULT '',
  updated_at_ms BIGINT NOT NULL,
  reviewed_by_uid TEXT
);

CREATE TABLE IF NOT EXISTS publisher_tax_settings (
  publisher_id TEXT PRIMARY KEY REFERENCES publisher_tax_profiles(publisher_id) ON DELETE CASCADE,
  withholding_bps INTEGER NOT NULL CHECK (withholding_bps >= 0 AND withholding_bps <= 10000),
  updated_at_ms BIGINT NOT NULL,
  reviewed_by_uid TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publisher_payout_items (
  payout_id TEXT NOT NULL REFERENCES publisher_payouts(id) ON DELETE CASCADE,
  accrual_id TEXT NOT NULL UNIQUE REFERENCES publisher_share_accruals(id),
  amount_cents BIGINT NOT NULL,
  PRIMARY KEY (payout_id, accrual_id)
);

CREATE TABLE IF NOT EXISTS publisher_payout_adjustment_items (
  payout_id TEXT NOT NULL REFERENCES publisher_payouts(id) ON DELETE CASCADE,
  adjustment_id TEXT NOT NULL REFERENCES publisher_share_adjustments(id),
  amount_cents BIGINT NOT NULL,
  PRIMARY KEY (payout_id, adjustment_id)
);
CREATE INDEX IF NOT EXISTS publisher_payout_adjustment_items_adjustment_idx ON publisher_payout_adjustment_items (adjustment_id);

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  event_id TEXT PRIMARY KEY,
  verified SMALLINT NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  received_at_ms BIGINT NOT NULL,
  processed_at_ms BIGINT
);

CREATE TABLE IF NOT EXISTS arena_worker_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kill_switch SMALLINT NOT NULL DEFAULT 0,
  last_tick_at_ms BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS game_ads_pricing_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tiers_json TEXT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

INSERT INTO game_ads_pricing_config (id, tiers_json, updated_at_ms) VALUES
  (1, '[{"min":0,"maxExclusive":100,"multiplier":1},{"min":100,"maxExclusive":500,"multiplier":1.25},{"min":500,"maxExclusive":2000,"multiplier":1.5},{"min":2000,"maxExclusive":10000,"multiplier":2},{"min":10000,"maxExclusive":null,"multiplier":2.5,"increasePer10k":0.5}]', 0)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO arena_worker_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
