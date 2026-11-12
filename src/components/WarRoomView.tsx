import React, { useState } from 'react';
import { ArenaSnapshot } from '../types';
import { LiveRateChart } from './LiveRateChart';
import { Zap, Sparkles, FastForward, PlusCircle } from 'lucide-react';

type FeedFilter = 'ALL' | 'TAKEOVER' | 'WAIT_DECISION' | 'PAYPAL_MCP';

interface WarRoomViewProps {
  snapshot: ArenaSnapshot;
  onManualTakeover: (agentId: string) => Promise<void>;
  onTriggerBiddingWar: () => Promise<void>;
  onFastForwardCooling: (minutes: number) => Promise<void>;
  onRequestCommentary: () => Promise<void>;
  onOpenStudio: () => void;
  onReturnToWall: () => void;
}

export const WarRoomView: React.FC<WarRoomViewProps> = ({
  snapshot,
  onManualTakeover,
  onFastForwardCooling,
  onRequestCommentary,
  onOpenStudio,
  onReturnToWall,
}) => {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('ALL');
  const { billboard } = snapshot;

  const filteredLogs = snapshot.battleLogs.filter((log) => {
    if (feedFilter === 'ALL') return true;
    if (feedFilter === 'TAKEOVER')
      return log.category === 'TAKEOVER' || log.category === 'COMMENTARY';
    if (feedFilter === 'WAIT_DECISION') return log.category === 'WAIT_DECISION';
    if (feedFilter === 'PAYPAL_MCP')
      return log.category === 'PAYPAL_MCP' || log.category === 'MODERATION';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Street-Fixture Metrics Board */}
      <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden">
        <div className="bg-[#1B4332] text-white px-5 py-2.5 border-b-[3px] border-[#1B1F24] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FFE66D] border border-[#1B1F24]" />
            <span className="font-mono text-xs font-black uppercase tracking-wider">
              WAR ROOM · LIVE PRICING &amp; AUTONOMOUS BIDDING MONITOR
            </span>
          </div>
          <span className="font-mono text-xs text-[#D8F3DC]">
            Base $0.04/m · +10% Takeover Step · 10m Half-Life Decay
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#1B1F24]/20 p-5 gap-4">
          <div className="sm:pr-4">
            <div className="text-xs font-mono font-bold uppercase text-[#475569]">
              Current Rate (10m Half-Life)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono tabular-nums text-[#141414]">
                ${(billboard.currentDecayedRateCentsPerMin / 100).toFixed(3)}/m
              </span>
              <span className="text-xs font-mono font-bold text-[#1B4332]">
                {billboard.multipleOfBase.toFixed(2)}× base
              </span>
            </div>
          </div>

          <div className="sm:px-4">
            <div className="text-xs font-mono font-bold uppercase text-[#475569]">
              Next 5-Min Takeover (+10%)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono tabular-nums text-[#FF4733]">
                ${(billboard.nextTakeoverBlockCostCents / 100).toFixed(2)}
              </span>
              <span className="text-xs font-mono font-semibold text-[#475569]">
                (${(billboard.nextTakeoverRateCentsPerMin / 100).toFixed(3)}/m)
              </span>
            </div>
          </div>

          <div className="sm:px-4">
            <div className="text-xs font-mono font-bold uppercase text-[#475569]">
              Current Billboard Holder
            </div>
            <div className="mt-1 font-display font-black text-lg text-[#141414] truncate">
              {billboard.currentCompanyName || 'OPEN WALL ($0.20)'}
            </div>
          </div>

          <div className="sm:pl-4">
            <div className="text-xs font-mono font-bold uppercase text-[#475569]">
              Total Claims &amp; Takeovers
            </div>
            <div className="mt-1 text-2xl font-black font-mono tabular-nums text-[#141414]">
              {billboard.totalTakeoversCount}
            </div>
          </div>
        </div>
      </div>

      {/* Live Rate Curve Chart + Cooling Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-mono font-bold text-[#1E293B]">
            Each takeover raises the rate by +10%. When no one bids, the excess rate halves every 10 minutes back toward $0.04/min.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onFastForwardCooling(5)}
              className="px-3 py-1.5 text-xs font-mono font-black uppercase bg-[#FFFDF7] hover:bg-[#FFE66D] text-[#141414] border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] rounded-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5 text-[#1B4332]" />
              <span>+5m Cooling Half-Life</span>
            </button>
            <button
              type="button"
              onClick={onRequestCommentary}
              className="px-3 py-1.5 text-xs font-mono font-black uppercase bg-[#181B20] hover:bg-[#262B33] text-[#FFE66D] border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] rounded-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFE66D]" />
              <span>AI Narrate Status</span>
            </button>
          </div>
        </div>

        <LiveRateChart
          billboard={snapshot.billboard}
          priceHistory={snapshot.priceHistory}
        />
      </div>

      {/* 2-Column Split: Your Deployed Agents + Live Event & Pro-Rata Refund Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Deployed Autonomous Agents */}
        <div className="lg:col-span-5 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden">
          <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between">
            <div>
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
                Your Deployed Agents ({snapshot.agents.length})
              </h2>
              <p className="text-[11px] font-mono text-[#94A3B8]">
                Evaluated every 3.5s · Instant pro-rata refunds on kick
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenStudio}
              className="px-2.5 py-1 text-[11px] font-mono font-black uppercase bg-[#FFE66D] text-[#141414] border border-[#0E1014] rounded-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <PlusCircle className="w-3 h-3" />
              <span>New Agent</span>
            </button>
          </div>

          <div className="p-5">
            {snapshot.agents.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="font-btn text-sm font-bold text-[#1E293B]">
                  Your drones will show up here
                </p>
                <p className="text-xs text-[#475569] max-w-xs mx-auto">
                  Each one bids for the #1 spot on its own. Track its wallet, wins, and refunds from this room.
                </p>
                <button
                  type="button"
                  onClick={onOpenStudio}
                  className="px-4 py-2 text-xs font-mono font-black uppercase bg-[#FF4733] text-white border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] rounded-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Launch your first drone</span>
                </button>
              </div>
            ) : (
              <div className="divide-y-2 divide-[#1B1F24]/15">
                {snapshot.agents.map((agent) => {
                  const isCurrentHolder =
                    snapshot.billboard.currentHolderAgentId === agent.id;
                  return (
                    <div key={agent.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0 border border-[#1B1F24]"
                            style={{ backgroundColor: agent.sprayColor }}
                          />
                          <span className="font-mono font-black text-xs text-[#141414] truncate">
                            {agent.companyName}
                          </span>
                          <span className="text-[11px] font-mono text-[#475569] truncate">
                            · {agent.compiledStrategy.personality.toUpperCase()} · Max $
                            {(agent.compiledStrategy.maxRateCentsPerMin / 100).toFixed(2)}/m
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs font-black tabular-nums text-[#141414]">
                            ${(agent.balanceCents / 100).toFixed(2)}
                          </span>
                          {isCurrentHolder && (
                            <span className="text-[10px] font-mono font-black uppercase text-[#1B4332]">
                              ON WALL
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await onManualTakeover(agent.id);
                              onReturnToWall();
                            }}
                            className="px-2.5 py-1 text-[11px] font-mono font-black uppercase bg-[#FF4733] hover:bg-[#ff321b] text-white border border-[#1B1F24] rounded-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Zap className="w-2.5 h-2.5" />
                            <span>Claim Now</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#475569]">
                        <span className="truncate">{agent.lastDecisionText}</span>
                        {agent.totalRefundedCents > 0 && (
                          <span className="font-bold text-[#1B4332] shrink-0">
                            +${(agent.totalRefundedCents / 100).toFixed(2)} refunded
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Live Event & Decision Log */}
        <div className="lg:col-span-7 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col">
          <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
                Live Billboard Activity &amp; Decision Log
              </h2>
              <p className="text-[11px] font-mono text-[#94A3B8]">
                Real-time wall claims, cooling wait decisions, and PayPal order/refund events
              </p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex items-center gap-1.5 p-1 bg-[#EAE6DA] border-2 border-[#1B1F24] rounded-xs overflow-x-auto">
              {(
                [
                  { id: 'ALL', label: 'All Events' },
                  { id: 'TAKEOVER', label: 'Wall Claims' },
                  { id: 'WAIT_DECISION', label: 'Cooling Waits' },
                  { id: 'PAYPAL_MCP', label: 'PayPal & Refunds' },
                ] as { id: FeedFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFeedFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    feedFilter === tab.id
                      ? 'bg-[#181B20] text-[#FFE66D]'
                      : 'text-[#1E293B] hover:bg-[#DCD7C8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredLogs.length === 0 ? (
              <div className="py-10 text-center font-mono text-xs text-[#475569]">
                No activity logged yet. Claim the billboard on the main wall or deploy an agent in Agent Studio to see live events here.
              </div>
            ) : (
              <div className="divide-y-2 divide-[#1B1F24]/15 max-h-[420px] overflow-y-auto pr-1">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="py-2.5 first:pt-1 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#475569]">
                      <span>
                        <strong
                          className={
                            log.category === 'TAKEOVER'
                              ? 'text-[#FF4733]'
                              : log.category === 'PAYPAL_MCP'
                              ? 'text-[#1B4332]'
                              : log.category === 'MODERATION'
                              ? 'text-[#DC2626]'
                              : 'text-[#141414]'
                          }
                        >
                          {log.companyName}
                        </strong>{' '}
                        · {log.category}
                      </span>
                      <span className="tabular-nums font-bold">
                        ${(log.rateCentsPerMin / 100).toFixed(3)}/m ·{' '}
                        {new Date(log.createdAtMs).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[#141414] font-medium leading-relaxed">{log.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
