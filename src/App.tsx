import React, { useState, useEffect, useRef } from 'react';
import { ArenaSnapshot, CompiledStrategy } from './types';
import {
  GraffitiWallStage,
  PageRoute,
  ThemePreference,
} from './components/GraffitiWallStage';
import { BackwallControlPage, UserAccount } from './components/BackwallControlPage';
import {
  auth,
  onAuthStateChanged,
  syncFirebaseUserToFirestore,
  signOutFirebaseUser,
} from './firebase';
import {
  readTourDone,
  markTourDone,
  claimOneTimeTip,
  readMyAgentIds,
  rememberMyAgentId,
} from './components/OnboardingTour';

const ACCOUNT_STORAGE_KEY = 'hotseat_user_account_v1';

export function App() {
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [activePage, setActivePage] = useState<PageRoute>('wall');
  const [selectedManualAgentId, setSelectedManualAgentId] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Auto-start the tour only for first-time visitors; skip/finish is remembered.
  const [onboardingStep, setOnboardingStep] = useState<number>(() => (readTourDone() ? 0 : 1));
  const prevTakeoverCountRef = useRef<number | null>(null);
  const prevKickedAgentIdRef = useRef<string | null>(null);
  const myAgentIdsRef = useRef<string[]>(readMyAgentIds());

  const handleAdvanceOnboarding = (nextStep: number) => {
    if (nextStep === 0) markTourDone();
    setOnboardingStep(nextStep);
  };

  const handleStartOnboarding = () => {
    setActivePage('wall');
    setOnboardingStep(1);
  };

  // System Light/Dark Mode & Time-of-Day Sync
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const hr = new Date().getHours();
    return hr >= 19 || hr < 6;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const isDarkMode =
    themePreference === 'system' ? systemPrefersDark : themePreference === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleCycleThemePreference = () => {
    setThemePreference((prev) => {
      if (prev === 'system') return isDarkMode ? 'light' : 'dark';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  // Persistent User Account State (Firebase Google Auth / PayPal Sign-In)
  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as UserAccount) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const synced = await syncFirebaseUserToFirestore(fbUser);
          const account: UserAccount = {
            id: synced.uid,
            name: synced.name,
            email: synced.email,
            provider: 'google',
            paypalEmail: synced.paypalEmail,
            firebaseUid: synced.uid,
          };
          setUserAccount(account);
          try {
            window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
          } catch {
            // Ignore storage restrictions
          }
        } catch {
          // Fallback to basic Firebase Auth fields
          const fallbackAccount: UserAccount = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Founder',
            email: fbUser.email || 'founder@startup.io',
            provider: 'google',
            paypalEmail: fbUser.email || 'founder@startup.io',
            firebaseUid: fbUser.uid,
          };
          setUserAccount(fallbackAccount);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = (account: UserAccount) => {
    setUserAccount(account);
    try {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
    } catch {
      // Ignore storage restrictions
    }
    showToast(
      `Signed in as ${account.name} (${account.provider.toUpperCase()}) · ${account.email}`
    );
  };

  const handleSignOut = async () => {
    await signOutFirebaseUser().catch(() => {});
    setUserAccount(null);
    try {
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }
    showToast('Signed out of account.');
  };

  const isEmbedMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('embed') === '1';

  const playSpraySound = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const bufferSize = ctx.sampleRate * 0.16;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;

      const gain = ctx.createGain();
      gain.gain.value = 0.12;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {
      // Ignore audio restrictions
    }
  };

  const showToast = (msg: string, durationMs = 3600) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, durationMs);
  };

  useEffect(() => {
    let es: EventSource | null = null;

    fetch('/api/arena/snapshot')
      .then((r) => r.json())
      .then((data: ArenaSnapshot) => {
        setSnapshot(data);
        prevTakeoverCountRef.current = data.billboard.totalTakeoversCount;
        prevKickedAgentIdRef.current = data.billboard.lastKickedAgentId;
      })
      .catch(() => {});

    es = new EventSource('/api/arena/stream');
    es.onmessage = (event) => {
      try {
        const data: ArenaSnapshot = JSON.parse(event.data);
        if (
          prevTakeoverCountRef.current !== null &&
          data.billboard.totalTakeoversCount > prevTakeoverCountRef.current
        ) {
          playSpraySound();
        }
        prevTakeoverCountRef.current = data.billboard.totalTakeoversCount;

        // First time one of this browser's drones is knocked off #1, explain what happens next.
        const kickedId = data.billboard.lastKickedAgentId;
        if (
          kickedId &&
          kickedId !== prevKickedAgentIdRef.current &&
          myAgentIdsRef.current.includes(kickedId) &&
          claimOneTimeTip('first_outbid')
        ) {
          const kickedName =
            data.agents.find((a) => a.id === kickedId)?.companyName || 'Your app';
          showToast(
            `${kickedName} was outbid. Unused time is refunded to its wallet, and the drone will try to take #1 back.`,
            8000
          );
        }
        prevKickedAgentIdRef.current = kickedId;
        setSnapshot(data);
      } catch {
        // Ignore parse error
      }
    };

    return () => {
      es?.close();
    };
  }, [soundEnabled]);

  const handleManualTakeover = async (
    agentId: string,
    templateIdOverride?: string,
    logoDataUrlOverride?: string
  ) => {
    const res = await fetch('/api/billboard/takeover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        templateIdOverride,
        logoDataUrlOverride,
        idempotencyKey: `ui-takeover-${agentId}-${Date.now()}`,
        reason: 'Instant takeover triggered from billboard ledge',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Takeover failed');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      `${data.result.buyerCompany} claimed the billboard at $${(
        data.result.takeoverRate / 100
      ).toFixed(3)}/min!`
    );
  };

  const handleTriggerBiddingWar = async () => {
    const res = await fetch('/api/arena/trigger-bidding-war', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not trigger rival bid');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('Rival agent claimed the billboard!');
  };

  const handleFastForwardCooling = async (minutes: number) => {
    const res = await fetch('/api/arena/fast-forward-cooling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(`Fast-forwarded cooling clock by +${minutes}m (10m half-life decay).`);
  };

  const handleActivateKillSwitch = async () => {
    const res = await fetch('/api/arena/moderation-kill-switch', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Kill switch failed');
      return;
    }
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast('Emergency Moderation Kill Switch stripped the top ad layer.');
  };

  const handleRequestCommentary = async () => {
    const res = await fetch('/api/ai/narrate-war', { method: 'POST' });
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
    if (data.commentary) showToast(data.commentary);
  };

  const handleCompileStrategy = async (payload: {
    companyName: string;
    companyUrl: string;
    goalPlainEnglish: string;
    dailyBudgetDollars: number;
  }) => {
    const res = await fetch('/api/ai/compile-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to compile strategy');
    return data;
  };

  const handleDeployAgent = async (payload: {
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
    templateId: string;
    topUpDollars: number;
    snipeImmediatelyOnDeploy?: boolean;
  }) => {
    const res = await fetch('/api/agents/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to deploy agent');
    if (data.snapshot) setSnapshot(data.snapshot);
    setSelectedManualAgentId(data.agentId);
    if (data.agentId) myAgentIdsRef.current = rememberMyAgentId(data.agentId);
    showToast(
      `Launched ${payload.companyName.toUpperCase()} onto the billboard (${data.order.orderId})!`
    );
  };

  const handleUpdateAgent = async (
    agentId: string,
    updates: {
      isActive?: boolean;
      activeHeadline?: string;
      templateId?: string;
      logoDataUrl?: string;
      maxRateCentsPerMin?: number;
      retaliateOnKick?: boolean;
    }
  ) => {
    const res = await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleCreateTopUpOrder = async (
    agentId: string,
    amountDollars: number
  ) => {
    const res = await fetch('/api/paypal/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, amountDollars }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order creation failed');
    if (data.snapshot) setSnapshot(data.snapshot);
  };

  const handleCashOutPayout = async (agentId: string) => {
    const res = await fetch('/api/paypal/payouts/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cash-out failed');
    if (data.snapshot) setSnapshot(data.snapshot);
    showToast(
      `Disbursed $${(data.payoutAmountCents / 100).toFixed(2)} via PayPal Payouts (${
        data.payoutBatchId
      })!`
    );
  };

  const handleAddCrowd = async (count: number) => {
    const res = await fetch('/api/arena/add-crowd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    if (data.snapshot) setSnapshot(data.snapshot);
    const totalV = data.totalWallViewsCount || (snapshot?.billboard.totalWallViewsCount || 0) + count;
    const tinyCount = Math.floor(totalV / 10);
    showToast(
      `+${count} Views added (${totalV} Views total → ${tinyCount} Tiny People on the street at 10:1 ratio)!`
    );
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#0D1118] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="wall-white-brick-btn px-8 py-6 text-center space-y-1">
          <div className="font-btn font-extrabold text-3xl tracking-tight">
            HOT SEAT
          </div>
          <p className="text-xs font-ui font-semibold">Loading the global billboard wall...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full">
      {toastMessage && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] bg-[#14171E] text-white border-[2.5px] border-[#0E1014] shadow-[4px_4px_0px_#0E1014] px-4 py-2 rounded-xs text-xs font-ui font-bold flex items-center gap-3 max-w-xl">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[#FFE66D] hover:text-white font-btn font-extrabold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      <GraffitiWallStage
        snapshot={snapshot}
        isDarkMode={isDarkMode}
        themePreference={themePreference}
        onCycleThemePreference={handleCycleThemePreference}
        userAccount={userAccount}
        selectedManualAgentId={selectedManualAgentId}
        onSelectManualAgentId={setSelectedManualAgentId}
        onManualTakeover={handleManualTakeover}
        onUpdateHolderLogo={async (agentId, logoDataUrl, templateId) => {
          await handleUpdateAgent(agentId, { logoDataUrl, templateId });
          if (claimOneTimeTip('first_restyle')) {
            showToast('Restyled live. Everyone watching the wall sees the new look right away.', 6000);
          }
        }}
        onTriggerBiddingWar={handleTriggerBiddingWar}
        onFastForwardCooling={handleFastForwardCooling}
        onActivateKillSwitch={handleActivateKillSwitch}
        onRequestCommentary={handleRequestCommentary}
        onAddCrowd={handleAddCrowd}
        onNavigateBrick={(page) => {
          setActivePage(page);
          if (page === 'studio' && onboardingStep === 1) {
            setOnboardingStep(2);
          }
        }}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        isEmbedMode={isEmbedMode}
        onboardingStep={onboardingStep}
        onAdvanceOnboarding={handleAdvanceOnboarding}
        onStartOnboarding={handleStartOnboarding}
      />

      {activePage !== 'wall' && !isEmbedMode && (
        <BackwallControlPage
          snapshot={snapshot}
          isDarkMode={isDarkMode}
          userAccount={userAccount}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onClose={() => {
            setActivePage('wall');
            if (onboardingStep >= 2 && onboardingStep <= 4) {
              setOnboardingStep(1);
            }
          }}
          onCompileStrategy={handleCompileStrategy}
          onDeployAgent={handleDeployAgent}
          onUpdateAgent={handleUpdateAgent}
          onManualTakeover={async (agentId, templateIdOverride) => {
            await handleManualTakeover(agentId, templateIdOverride);
            setActivePage('wall');
          }}
          onFastForwardCooling={handleFastForwardCooling}
          onCreateTopUpOrder={handleCreateTopUpOrder}
          onCashOutPayout={handleCashOutPayout}
          onboardingStep={onboardingStep}
          onAdvanceOnboarding={handleAdvanceOnboarding}
        />
      )}
    </div>
  );
}

export default App;
