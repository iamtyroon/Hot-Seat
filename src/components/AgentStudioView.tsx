import React, { useState } from 'react';
import {
  ArenaSnapshot,
  CompiledStrategy,
  AgentPersonality,
  AdTemplateId,
} from '../types';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Zap,
  DollarSign,
  ImagePlus,
  X,
} from 'lucide-react';

interface AgentStudioViewProps {
  snapshot: ArenaSnapshot;
  onCompileStrategy: (payload: {
    companyName: string;
    companyUrl: string;
    goalPlainEnglish: string;
    dailyBudgetDollars: number;
  }) => Promise<{
    compiledStrategy: CompiledStrategy;
    headlines: string[];
    moderationStatus: 'approved' | 'flagged';
    moderationNote: string;
    compiledBy: string;
  }>;
  onDeployAgent: (payload: {
    ownerName: string;
    paypalEmail: string;
    companyName: string;
    companyUrl: string;
    logoDataUrl?: string;
    goalPlainEnglish: string;
    compiledStrategy: CompiledStrategy;
    headlines: string[];
    activeHeadline: string;
    sprayThemeIndex: number;
    templateId: AdTemplateId;
    topUpDollars: number;
  }) => Promise<void>;
  onUpdateAgent: (
    agentId: string,
    updates: {
      isActive?: boolean;
      activeHeadline?: string;
      templateId?: AdTemplateId;
      logoDataUrl?: string;
      maxRateCentsPerMin?: number;
      retaliateOnKick?: boolean;
    }
  ) => Promise<void>;
  onManualTakeover: (agentId: string, templateIdOverride?: AdTemplateId) => Promise<void>;
  onSwitchToArena: () => void;
}

export const AgentStudioView: React.FC<AgentStudioViewProps> = ({
  snapshot,
  onCompileStrategy,
  onDeployAgent,
  onUpdateAgent,
  onManualTakeover,
  onSwitchToArena,
}) => {
  const [ownerName, setOwnerName] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string>('');
  const [goalPlainEnglish, setGoalPlainEnglish] = useState('');
  const [dailyBudgetDollars, setDailyBudgetDollars] = useState<number>(5);
  const [topUpDollars, setTopUpDollars] = useState<number>(5);

  if (import.meta.env.PROD) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-slate-700 dark:text-slate-200">
        Live agent deployment is unavailable until persistent Firestore storage is configured.
      </div>
    );
  }

  const handleStudioLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 240;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setLogoDataUrl(canvas.toDataURL('image/png'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [isCompiling, setIsCompiling] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [compiledBy, setCompiledBy] = useState<string>('');
  const [moderationStatus, setModerationStatus] = useState<'approved' | 'flagged'>('approved');

  const [strategy, setStrategy] = useState<CompiledStrategy>({
    personality: 'sniper',
    maxRateCentsPerMin: 12.0,
    entryMaxMultiple: 3.0,
    retaliateOnKick: false,
    retaliateTargetCompany: '',
    peakHoursOnly: false,
    dailyBudgetCents: 500,
    minWaitSeconds: 12,
    summaryExplanation:
      'Enter your plain-English bidding goal on the left and click Compile Goal, or configure the deterministic rules directly below.',
  });

  const [headlines, setHeadlines] = useState<string[]>([]);
  const [activeHeadline, setActiveHeadline] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCompile = async () => {
    if (!companyName.trim() || !goalPlainEnglish.trim()) {
      setErrorMsg('Please enter your startup name and plain-English bidding goal first.');
      return;
    }
    setErrorMsg(null);
    setIsCompiling(true);
    try {
      const res = await onCompileStrategy({
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim() || 'startup.com',
        goalPlainEnglish: goalPlainEnglish.trim(),
        dailyBudgetDollars,
      });
      setStrategy(res.compiledStrategy);
      setHeadlines(res.headlines);
      setActiveHeadline(res.headlines[0] || companyName.toUpperCase());
      setModerationStatus(res.moderationStatus);
      setCompiledBy(res.compiledBy);
    } catch (err: any) {
      setErrorMsg(err.message || 'Strategy compilation failed.');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !companyUrl.trim()) {
      setErrorMsg('Startup name and destination URL are required.');
      return;
    }
    setErrorMsg(null);
    setIsDeploying(true);
    try {
      const finalHeadline =
        activeHeadline.trim() || `${companyName.trim().toUpperCase()} ON THE WALL`;
      await onDeployAgent({
        ownerName: ownerName.trim() || 'Founder',
        paypalEmail: paypalEmail.trim(),
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim(),
        logoDataUrl,
        goalPlainEnglish:
          goalPlainEnglish.trim() ||
          `Bid up to $${(strategy.maxRateCentsPerMin / 100).toFixed(2)}/min within a $${dailyBudgetDollars} daily budget.`,
        compiledStrategy: strategy,
        headlines: headlines.length > 0 ? headlines : [finalHeadline],
        activeHeadline: finalHeadline,
        sprayThemeIndex: 0,
        templateId: 'BOMB_BURST',
        topUpDollars,
      });
      onSwitchToArena();
    } catch (err: any) {
      setErrorMsg(err.message || 'Deployment failed.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleDeploy} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Startup Identity & Plain-English Bidding Goal */}
        <div className="lg:col-span-6 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#1B4332] text-white px-5 py-3 border-b-[3px] border-[#1B1F24]">
              <h2 className="font-mono text-xs font-black uppercase tracking-wider text-[#FFE66D]">
                01. Startup Identity &amp; Plain-English Bidding Goal
              </h2>
              <p className="text-xs font-mono text-[#D8F3DC] mt-0.5">
                Enter your brand details and describe how your autonomous agent should bid on the billboard.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Startup / Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={28}
                    placeholder="e.g. Acme Robotics"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm font-semibold text-[#141414] focus:outline-none focus:bg-[#FFFDF7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Destination URL *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={38}
                    placeholder="e.g. acmerobotics.com"
                    value={companyUrl}
                    onChange={(e) => setCompanyUrl(e.target.value)}
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm font-mono text-[#141414] focus:outline-none focus:bg-[#FFFDF7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Owner Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Your name or handle"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm text-[#141414] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    PayPal Email (For Cash-Out)
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm font-mono text-[#141414] focus:outline-none"
                  />
                </div>
              </div>

              {/* Brand Logo Upload */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs font-mono font-bold uppercase text-[#1E293B]">
                  Brand Logo (Optional):
                </span>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-xs text-xs font-mono font-black uppercase bg-[#181B20] hover:bg-[#262B33] text-[#FFE66D] border-2 border-[#1B1F24] cursor-pointer inline-flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{logoDataUrl ? 'Change Brand Logo' : 'Upload Brand Logo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleStudioLogoUpload}
                      className="hidden"
                    />
                  </label>
                  {logoDataUrl && (
                    <div className="inline-flex items-center gap-1.5 bg-white border-2 border-[#1B1F24] rounded-xs px-2 py-1">
                      <img
                        src={logoDataUrl}
                        alt="Uploaded brand logo"
                        className="w-5 h-5 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setLogoDataUrl('')}
                        className="text-[#475569] hover:text-[#141414] cursor-pointer"
                        title="Remove logo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                  Plain-English Bidding Goal
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe when your agent should claim the billboard, its max price per minute, and whether it should retaliate if kicked off..."
                  value={goalPlainEnglish}
                  onChange={(e) => setGoalPlainEnglish(e.target.value)}
                  className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm text-[#141414] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={isCompiling}
                  onClick={handleCompile}
                  className="px-4 py-2 text-xs font-mono font-black uppercase bg-[#FFE66D] hover:bg-[#f5da42] text-[#141414] border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] rounded-xs inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isCompiling
                      ? 'Compiling Strategy with Gemini...'
                      : 'Compile Goal with Gemini AI'}
                  </span>
                </button>

                {compiledBy && (
                  <span className="text-xs font-mono font-bold text-[#1B4332]">
                    Compiled via {compiledBy}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* PayPal Sandbox Prepaid Wallet Funding Box */}
          <div className="p-6 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black uppercase text-[#141414]">
                PayPal Sandbox Prepaid Balance Top-Up
              </span>
              <span className="text-xs font-mono text-[#475569]">
                Zero fees on internal 20¢ bids
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[5, 10, 20].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setTopUpDollars(amt);
                    setDailyBudgetDollars(amt);
                  }}
                  className={`py-2 px-3 rounded-xs text-xs font-mono font-black uppercase border-2 border-[#1B1F24] transition-all cursor-pointer ${
                    topUpDollars === amt
                      ? 'bg-[#1B4332] text-[#FFE66D] shadow-[3px_3px_0px_#1B1F24] -translate-y-0.5'
                      : 'bg-white text-[#141414] hover:bg-[#EAE6DA]'
                  }`}
                >
                  Top Up ${amt}.00
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Right Column: Compiled Strategy Rules & Ad Headline */}
        <div className="lg:col-span-6 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between gap-2">
              <div>
                <h2 className="font-mono text-xs font-black uppercase tracking-wider text-[#FFE66D]">
                  02. Deterministic Bidding Rules &amp; Billboard Headline
                </h2>
                <p className="text-xs font-mono text-[#94A3B8] mt-0.5">
                  Executed every 3.5s against the live rate and 10-minute decay curve
                </p>
              </div>
              <div className="text-xs font-mono font-bold shrink-0">
                {moderationStatus === 'approved' ? (
                  <span className="text-[#95D5B2] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approved</span>
                  </span>
                ) : (
                  <span className="text-[#FF4733] inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Flagged</span>
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Compiled Summary Note */}
              <div className="p-3.5 bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs text-xs font-mono text-[#141414]">
                {strategy.summaryExplanation}
              </div>

              {/* Editable Deterministic Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Agent Mode
                  </label>
                  <select
                    value={strategy.personality}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        personality: e.target.value as AgentPersonality,
                      })
                    }
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-2.5 py-2 text-xs font-mono font-bold text-[#141414]"
                  >
                    <option value="sniper">SNIPER (Wait for Decay)</option>
                    <option value="aggressive">AGGRESSIVE (Defend Turf)</option>
                    <option value="patient">PATIENT (Steady Cadence)</option>
                    <option value="peak">PEAK-HOUR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Max Rate Ceiling (¢/min)
                  </label>
                  <input
                    type="number"
                    step="0.4"
                    min={4.0}
                    max={40.0}
                    value={strategy.maxRateCentsPerMin}
                    onChange={(e) => {
                      const val = Math.min(40, Math.max(4, Number(e.target.value)));
                      setStrategy({
                        ...strategy,
                        maxRateCentsPerMin: val,
                        entryMaxMultiple: Number((val / 4.0).toFixed(2)),
                      });
                    }}
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-2.5 py-2 text-xs font-mono font-black tabular-nums text-[#141414]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold uppercase text-[#1E293B] mb-1">
                    Counter-Bid Target
                  </label>
                  <input
                    type="text"
                    value={strategy.retaliateTargetCompany}
                    placeholder="Optional rival or ANY"
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        retaliateTargetCompany: e.target.value,
                        retaliateOnKick: Boolean(e.target.value),
                      })
                    }
                    className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-2.5 py-2 text-xs font-mono text-[#141414]"
                  />
                </div>
              </div>

              {/* Billboard Headline Input & AI Suggestions */}
              <div className="space-y-2.5">
                <label className="block text-xs font-mono font-bold uppercase text-[#1E293B]">
                  Billboard Ad Headline (Max 46 Chars) *
                </label>

                <input
                  type="text"
                  maxLength={46}
                  placeholder="e.g. SHIP PRODUCTION CLUSTERS IN ONE CLICK"
                  value={activeHeadline}
                  onChange={(e) => setActiveHeadline(e.target.value.toUpperCase())}
                  className="w-full bg-white border-2 border-[#1B1F24] rounded-xs px-3 py-2 text-sm font-mono font-bold uppercase text-[#141414]"
                />

                {headlines.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-mono font-bold text-[#475569]">
                      Gemini Suggested Headlines (Click to select):
                    </div>
                    {headlines.map((hl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveHeadline(hl)}
                        className={`w-full text-left px-3 py-2 rounded-xs text-xs font-mono font-bold transition-colors cursor-pointer border-2 border-[#1B1F24] ${
                          activeHeadline === hl
                            ? 'bg-[#FFE66D] text-[#141414]'
                            : 'bg-white text-[#1E293B] hover:bg-[#F5F3EB]'
                        }`}
                      >
                        0{i + 1}. {hl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB] space-y-3">
            {errorMsg && (
              <div className="text-xs font-mono font-bold text-white bg-[#DC2626] border-2 border-[#1B1F24] rounded-xs px-3 py-2">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isDeploying || moderationStatus === 'flagged'}
              className="w-full py-3 px-5 rounded-xs text-xs font-mono font-black uppercase bg-[#FF4733] hover:bg-[#ff321b] text-white border-2 border-[#1B1F24] shadow-[4px_4px_0px_#1B1F24] transition-all inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4" />
              <span>
                {isDeploying
                  ? 'Creating PayPal Order & Deploying Agent...'
                  : `Fund $${topUpDollars}.00 in PayPal Sandbox & Deploy Agent`}
              </span>
            </button>
          </div>
        </div>
      </form>

      {/* Deployed Agents Table (Only shows real user-deployed agents) */}
      {snapshot.agents.length > 0 && (
        <div className="bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden">
          <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24]">
            <h3 className="text-xs font-mono font-black uppercase tracking-wider text-[#FFE66D]">
              Deployed Autonomous Agents ({snapshot.agents.length})
            </h3>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[#1B1F24] text-[11px] font-mono font-bold uppercase text-[#475569]">
                  <th className="py-2.5 pr-4">Startup</th>
                  <th className="py-2.5 px-4">Headline</th>
                  <th className="py-2.5 px-4">Strategy</th>
                  <th className="py-2.5 px-4 text-right">Balance</th>
                  <th className="py-2.5 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1F24]/20 text-xs font-mono">
                {snapshot.agents.map((agent) => {
                  const isHolding = snapshot.billboard.currentHolderAgentId === agent.id;
                  return (
                    <tr key={agent.id}>
                      <td className="py-3 pr-4 font-black text-[#141414]">
                        {agent.companyName}{' '}
                        {isHolding && (
                          <span className="text-[10px] font-bold text-[#1B4332]">· ON WALL</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#1E293B] truncate max-w-xs">
                        {agent.activeHeadline}
                      </td>
                      <td className="py-3 px-4 text-[#141414]">
                        {agent.compiledStrategy.personality.toUpperCase()} · Max $
                        {(agent.compiledStrategy.maxRateCentsPerMin / 100).toFixed(3)}/m
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-black">
                        ${(agent.balanceCents / 100).toFixed(2)}
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAgent(agent.id, { isActive: !agent.isActive })
                            }
                            className="px-2.5 py-1 text-xs font-mono font-bold bg-[#EAE6DA] hover:bg-[#DCD7C8] text-[#141414] border border-[#1B1F24] rounded-xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            {agent.isActive ? (
                              <>
                                <Pause className="w-3 h-3" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-[#1B4332]" />
                                <span>Resume</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onManualTakeover(agent.id, agent.templateId)}
                            className="px-2.5 py-1 text-xs font-mono font-black uppercase bg-[#FF4733] text-white border border-[#1B1F24] rounded-xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Claim Wall</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
