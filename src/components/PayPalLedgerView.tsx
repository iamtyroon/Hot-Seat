import React, { useState, useEffect } from 'react';
import { ArenaSnapshot } from '../types';
import {
  DollarSign,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
  Terminal,
  ShieldCheck,
} from 'lucide-react';

interface PayPalLedgerViewProps {
  snapshot: ArenaSnapshot;
  onCreateTopUpOrder: (
    agentId: string,
    amountDollars: number,
    autoConfirmWebhook: boolean
  ) => Promise<void>;
  onConfirmOrderWebhook: (orderId: string) => Promise<void>;
  onCashOutPayout: (agentId: string) => Promise<void>;
}

export const PayPalLedgerView: React.FC<PayPalLedgerViewProps> = ({
  snapshot,
  onCreateTopUpOrder,
  onConfirmOrderWebhook,
  onCashOutPayout,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    snapshot.agents[0]?.id || ''
  );
  const [topUpDollars, setTopUpDollars] = useState<number>(5);
  const [requireManualWebhook, setRequireManualWebhook] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAgentId && snapshot.agents.length > 0) {
      setSelectedAgentId(snapshot.agents[0].id);
    }
  }, [snapshot.agents, selectedAgentId]);

  const handleCreateOrder = async () => {
    if (!selectedAgentId) return;
    setBusyId('create-order');
    setStatusMessage(null);
    try {
      await onCreateTopUpOrder(selectedAgentId, topUpDollars, !requireManualWebhook);
      setStatusMessage(
        requireManualWebhook
          ? `Created PayPal Sandbox Order for $${topUpDollars.toFixed(
              2
            )} via Agent Toolkit MCP. Click "Confirm Webhook" below to credit balance.`
          : `Created and webhook-confirmed $${topUpDollars.toFixed(2)} PayPal Sandbox Order.`
      );
    } catch (err: any) {
      setStatusMessage(err.message || 'Order creation failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleWebhookConfirm = async (orderId: string) => {
    setBusyId(orderId);
    setStatusMessage(null);
    try {
      await onConfirmOrderWebhook(orderId);
      setStatusMessage(`Webhook PAYMENT.CAPTURE.COMPLETED verified for ${orderId}.`);
    } catch (err: any) {
      setStatusMessage(err.message || 'Webhook verification failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCashOut = async (agentId: string) => {
    setBusyId(`payout-${agentId}`);
    setStatusMessage(null);
    try {
      await onCashOutPayout(agentId);
      setStatusMessage('Unused agent balance disbursed via PayPal Payouts API.');
    } catch (err: any) {
      setStatusMessage(err.message || 'Payout failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Architecture Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs p-5">
          <div className="text-xs text-[#1B4332] font-mono font-black uppercase">
            01. PAYPAL ORDERS &amp; WEBHOOKS
          </div>
          <div className="text-base font-display font-black text-[#141414] mt-1">
            Prepaid Balance Funding
          </div>
          <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
            Top-ups run through PayPal Orders (<code className="font-mono font-bold text-[#141414]">/v2/checkout/orders</code>) and verify <code className="font-mono font-bold text-[#141414]">PAYMENT.CAPTURE.COMPLETED</code> webhooks before crediting the ledger.
          </p>
        </div>

        <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs p-5">
          <div className="text-xs text-[#1B4332] font-mono font-black uppercase">
            02. SINGLE-WRITER ATOMIC LEDGER
          </div>
          <div className="text-base font-display font-black text-[#141414] mt-1">
            Zero-Fee Micro-Takeovers &amp; Refunds
          </div>
          <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
            Every 20¢+ takeover and instant pro-rata refund executes in a serialized SQLite transaction with strict <code className="font-mono font-bold text-[#141414]">idempotency_key</code> constraints.
          </p>
        </div>

        <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs p-5">
          <div className="text-xs text-[#1B4332] font-mono font-black uppercase">
            03. PAYPAL PAYOUTS &amp; AGENT MCP
          </div>
          <div className="text-base font-display font-black text-[#141414] mt-1">
            Instant Cash-Out &amp; MCP Toolkit
          </div>
          <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
            Agents invoke tools via <code className="font-mono font-bold text-[#1B4332]">{snapshot.paypalMcpEndpoint}</code> and cash out unused balances anytime via PayPal Payouts (<code className="font-mono font-bold text-[#141414]">/v1/payments/payouts</code>).
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-[#FFE66D] border-[3px] border-[#1B1F24] shadow-[4px_4px_0px_#1B1F24] text-[#141414] px-4 py-3 rounded-xs text-xs font-mono font-bold flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-[#141414]/70 hover:text-[#141414] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Middle 2-Column Split: PayPal Order & Webhook Simulator + Agent Wallet Payouts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 6 Cols: Create PayPal Sandbox Order & Inspect MCP Tool Call */}
        <div className="lg:col-span-6 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between">
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
                PayPal Orders Top-Up &amp; Webhook Confirmation
              </h3>
              <span className="text-xs font-mono font-bold text-[#95D5B2]">
                Mode: {snapshot.paypalMode}
              </span>
            </div>

            <div className="p-6 space-y-4">
              {snapshot.agents.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#475569] bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs p-4 space-y-1">
                  <p className="font-btn text-sm font-bold text-[#1E293B]">No wallets to top up yet</p>
                  <p>A wallet is created when you launch a web app from the studio.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                        Target Agent Wallet
                      </label>
                      <select
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-xs font-mono font-bold text-[#141414]"
                      >
                        {snapshot.agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.companyName} (Balance: ${(a.balanceCents / 100).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                        Order Amount ($ USD)
                      </label>
                      <select
                        value={topUpDollars}
                        onChange={(e) => setTopUpDollars(Number(e.target.value))}
                        className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-xs font-mono font-bold text-[#141414]"
                      >
                        <option value={5}>$5.00 USD (25 base blocks)</option>
                        <option value={10}>$10.00 USD (50 base blocks)</option>
                        <option value={25}>$25.00 USD (125 base blocks)</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-mono text-[#1E293B] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireManualWebhook}
                      onChange={(e) => setRequireManualWebhook(e.target.checked)}
                      className="accent-[#1B4332]"
                    />
                    <span>
                      Two-step demo: hold order in <code className="font-bold">CREATED_AWAITING_WEBHOOK</code> state until webhook fires
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={busyId !== null || !selectedAgentId}
                    onClick={handleCreateOrder}
                    className="w-full py-2.5 px-4 bg-[#1B4332] hover:bg-[#143325] text-[#FFE66D] border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] font-mono font-black uppercase text-xs rounded-xs transition-all inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Create PayPal Sandbox Order (${topUpDollars.toFixed(2)})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Pending / Recent PayPal Orders List */}
          <div className="p-6 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB] space-y-2.5">
            <div className="text-xs font-mono font-black uppercase text-[#141414]">
              Recent PayPal Orders &amp; Agent Toolkit MCP Payloads
            </div>
            {snapshot.pendingOrders.length === 0 ? (
              <div className="text-xs font-mono text-[#475569] py-4 text-center bg-white rounded-xs border-2 border-[#1B1F24]">
                No PayPal Orders created yet in this session.
              </div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {snapshot.pendingOrders.map((ord) => (
                  <div
                    key={ord.orderId}
                    className="bg-white border-2 border-[#1B1F24] rounded-xs p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-[#141414]">
                        <span className="font-black">{ord.orderId}</span> · {ord.companyName} ·{' '}
                        <span className="font-black text-[#1B4332]">
                          +${(ord.amountCents / 100).toFixed(2)}
                        </span>
                      </div>
                      {ord.status === 'CREATED_AWAITING_WEBHOOK' ? (
                        <button
                          type="button"
                          disabled={busyId === ord.orderId}
                          onClick={() => handleWebhookConfirm(ord.orderId)}
                          className="px-2.5 py-1 text-[11px] font-mono font-black uppercase bg-[#FFE66D] text-[#141414] border border-[#1B1F24] rounded-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Confirm Webhook</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono font-bold text-[#1B4332] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>WEBHOOK_CONFIRMED</span>
                        </span>
                      )}
                    </div>
                    <pre className="text-[10px] font-mono text-[#E2E8F0] bg-[#181B20] p-2 rounded-xs overflow-x-auto">
                      {ord.mcpPayloadJson}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 6 Cols: Agent Wallet Balances & PayPal Payouts Cash-Out */}
        <div className="lg:col-span-6 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between">
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
                Agent Wallets &amp; PayPal Payouts Cash-Out
              </h3>
              <span className="text-xs font-mono text-[#94A3B8]">
                POST /v1/payments/payouts
              </span>
            </div>

            <div className="p-6">
              {snapshot.agents.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#475569] bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs p-4 space-y-1">
                  <p className="font-btn text-sm font-bold text-[#1E293B]">Balances will appear here</p>
                  <p>Every top-up, takeover, and refund for your drones is listed once you launch.</p>
                </div>
              ) : (
                <div className="divide-y-2 divide-[#1B1F24] border-2 border-[#1B1F24] rounded-xs bg-white">
                  {snapshot.agents.map((agent) => (
                    <div
                      key={agent.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-xs font-mono font-black text-[#141414] flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-xs border border-[#1B1F24]"
                            style={{ backgroundColor: agent.sprayColor }}
                          />
                          <span>{agent.companyName}</span>
                          <span className="text-[#475569] font-normal">
                            ({agent.paypalEmail})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#475569] mt-1">
                          Claims: {agent.totalTakeovers} · Pro-Rata Refunds: +$
                          {(agent.totalRefundedCents / 100).toFixed(2)} · Daily Cap: $
                          {(agent.dailyBudgetCents / 100).toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-sm font-black text-[#141414]">
                            ${(agent.balanceCents / 100).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-[#475569]">Prepaid Balance</div>
                        </div>

                        <button
                          type="button"
                          disabled={agent.balanceCents <= 0 || busyId !== null}
                          onClick={() => handleCashOut(agent.id)}
                          className="px-3 py-1.5 text-xs font-mono font-black uppercase bg-[#FF4733] hover:bg-[#ff321b] text-white border border-[#1B1F24] rounded-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                          title="Disburse remaining balance to owner's PayPal email via PayPal Payouts"
                        >
                          <span>Cash Out</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 text-[#141414]">
              <Terminal className="w-4 h-4 text-[#1B4332]" />
              <span>
                Agent Toolkit MCP:{' '}
                <code className="font-bold">{snapshot.paypalMcpEndpoint}</code>
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#1B4332] inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Per-Agent Caps Enforced</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Atomic SQLite Ledger Audit Table */}
      <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden">
        <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
              Atomic SQLite Transaction Ledger (Single-Writer Idempotent Queue)
            </h3>
            <p className="text-[11px] font-mono text-[#94A3B8]">
              Every takeover debits the buyer and credits the ousted holder’s unused time in one indivisible transaction.
            </p>
          </div>
          <span className="text-xs font-mono text-[#FFE66D]">
            {snapshot.ledger.length} entries
          </span>
        </div>

        <div className="p-5 overflow-x-auto">
          {snapshot.ledger.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-[#475569]">
              No ledger transactions recorded yet. Claim the billboard on the main wall or deploy an agent to see real-time ledger entries.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1B1F24] text-[11px] font-mono font-bold uppercase text-[#475569]">
                  <th className="py-2.5 pr-3">Time</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Brand</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-right">Balance After</th>
                  <th className="py-2.5 px-3">MCP Tool / PayPal Ref</th>
                  <th className="py-2.5 pl-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1F24]/20 text-xs font-mono">
                {snapshot.ledger.map((entry) => {
                  const isCredit = entry.amountCents > 0;
                  return (
                    <tr key={entry.id}>
                      <td className="py-2.5 pr-3 text-[#475569] whitespace-nowrap tabular-nums">
                        {new Date(entry.createdAtMs).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-bold">
                        <span
                          className={
                            entry.type === 'PRORATA_REFUND' || entry.type === 'PAYPAL_TOPUP'
                              ? 'text-[#1B4332]'
                              : entry.type === 'PAYPAL_PAYOUT'
                              ? 'text-[#D97706]'
                              : 'text-[#FF4733]'
                          }
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-black text-[#141414] whitespace-nowrap">
                        {entry.companyName}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums font-black whitespace-nowrap ${
                          isCredit ? 'text-[#1B4332]' : 'text-[#141414]'
                        }`}
                      >
                        {isCredit ? '+' : '-'}$
                        {(Math.abs(entry.amountCents) / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[#475569] whitespace-nowrap">
                        ${(entry.balanceAfterCents / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#475569] whitespace-nowrap">
                        {entry.mcpToolName} · {entry.paypalRef}
                      </td>
                      <td className="py-2.5 pl-3 text-[11px] font-sans text-[#1E293B]">
                        <div>{entry.description}</div>
                        <div className="font-mono text-[10px] text-[#64748B] truncate max-w-xs">
                          idem: {entry.idempotencyKey}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
