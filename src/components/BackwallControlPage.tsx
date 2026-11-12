import React, { useState, useEffect, useRef } from 'react';
import {
  ArenaSnapshot,
  CompiledStrategy,
  AgentPersonality,
  AdTemplateId,
} from '../types';
import { LiveRateChart } from './LiveRateChart';
import { TourProgress, TOUR_DONE_STEP, prefersReducedMotion } from './OnboardingTour';
import {
  auth,
  signInWithGooglePopup,
  syncFirebaseUserToFirestore,
  listUserAuthorizedDomains,
  addUserAuthorizedDomain,
  removeUserAuthorizedDomain,
  AuthorizedDomainEntry,
  DEFAULT_WHITELISTED_DOMAINS,
  FIREBASE_PROJECT_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_AUTHORIZED_DOMAINS_CONSOLE_URL,
  GCP_CREDENTIALS_CONSOLE_URL,
  getVercelFirebaseEnvSnippet,
  isAdminEmail,
  saveAdminPayPalSettingsToFirestore,
} from '../firebase';
import {
  Sparkles,
  Play,
  Pause,
  Zap,
  ImagePlus,
  X,
  FastForward,
  ArrowUpRight,
  RefreshCw,
  LogOut,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Globe,
  ExternalLink,
  Plus,
  Trash2,
  ShieldCheck,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
} from 'lucide-react';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  provider: 'google' | 'paypal';
  paypalEmail: string;
  firebaseUid?: string;
}

interface PayPalServerStatus {
  configured: boolean;
  sandboxEnabled?: boolean;
  tokenVerified?: boolean;
  environment: 'SANDBOX' | 'LIVE';
  modeLabel: string;
  apiBaseUrl: string;
  clientIdPrefix?: string | null;
  webhookId?: string | null;
  mcpEndpoint?: string;
}

interface BackwallControlPageProps {
  snapshot: ArenaSnapshot;
  isDarkMode: boolean;
  userAccount: UserAccount | null;
  onSignIn: (account: UserAccount) => void;
  onSignOut: () => void;
  onClose: () => void;
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
    snipeImmediatelyOnDeploy?: boolean;
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
  onFastForwardCooling: (minutes: number) => Promise<void>;
  onCreateTopUpOrder: (
    agentId: string,
    amountDollars: number
  ) => Promise<void>;
  onCashOutPayout: (agentId: string) => Promise<void>;
  onboardingStep?: number;
  onAdvanceOnboarding?: (nextStep: number) => void;
}

type BoothTab = 'deploy' | 'wallet' | 'curve' | 'domains';

export const BackwallControlPage: React.FC<BackwallControlPageProps> = ({
  snapshot,
  isDarkMode,
  userAccount,
  onSignIn,
  onSignOut,
  onClose,
  onCompileStrategy,
  onDeployAgent,
  onUpdateAgent,
  onManualTakeover,
  onFastForwardCooling,
  onCreateTopUpOrder,
  onCashOutPayout,
  onboardingStep = 0,
  onAdvanceOnboarding,
}) => {
  const [activeTab, setActiveTab] = useState<BoothTab>('deploy');
  const [showAuthDrawer, setShowAuthDrawer] = useState<boolean>(false);
  const [authProviderPrompt, setAuthProviderPrompt] = useState<'google' | 'paypal' | null>(null);
  const [authNameInput, setAuthNameInput] = useState<string>('');
  const [authEmailInput, setAuthEmailInput] = useState<string>('');
  const [isGooglePopupLoading, setIsGooglePopupLoading] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const isAdmin = isAdminEmail(userAccount?.email);

  // Domains & PayPal Status State (pre-whitelisted with hotseat.vercel.app)
  const [authorizedDomains, setAuthorizedDomains] = useState<AuthorizedDomainEntry[]>(
    DEFAULT_WHITELISTED_DOMAINS
  );
  const [newDomainInput, setNewDomainInput] = useState<string>('');
  const [newDomainEnv, setNewDomainEnv] = useState<
    'vercel-production' | 'vercel-preview' | 'custom-domain'
  >('vercel-production');
  const [isSavingDomain, setIsSavingDomain] = useState<boolean>(false);
  const [domainFeedback, setDomainFeedback] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState<boolean>(false);
  const [paypalStatus, setPaypalStatus] = useState<PayPalServerStatus | null>(null);

  // Admin PayPal API & Sandbox Toggle State
  const [paypalSandboxEnabled, setPaypalSandboxEnabled] = useState<boolean>(true);
  const [paypalClientIdInput, setPaypalClientIdInput] = useState<string>('');
  const [paypalClientSecretInput, setPaypalClientSecretInput] = useState<string>('');
  const [paypalWebhookIdInput, setPaypalWebhookIdInput] = useState<string>('');
  const [paypalMcpEndpointInput, setPaypalMcpEndpointInput] = useState<string>(
    'https://api-m.sandbox.paypal.com/v1/mcp'
  );
  const [isSavingPaypalConfig, setIsSavingPaypalConfig] = useState<boolean>(false);
  const [paypalConfigFeedback, setPaypalConfigFeedback] = useState<string | null>(null);
  const [copiedGitFix, setCopiedGitFix] = useState<boolean>(false);
  const [copiedVercelEnv, setCopiedVercelEnv] = useState<boolean>(false);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [activeHeadline, setActiveHeadline] = useState<string>('');
  const [logoDataUrl, setLogoDataUrl] = useState<string>('');
  const [paypalEmail, setPaypalEmail] = useState(userAccount?.paypalEmail || '');
  const [topUpDollars, setTopUpDollars] = useState<number>(5);
  const [sprayThemeIndex, setSprayThemeIndex] = useState<number>(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<AdTemplateId>('BOMB_BURST');
  const [snipeImmediatelyOnDeploy, setSnipeImmediatelyOnDeploy] = useState<boolean>(true);
  const [showAiAssistant, setShowAiAssistant] = useState<boolean>(false);
  const [goalPlainEnglish, setGoalPlainEnglish] = useState('');

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
    summaryExplanation: '',
  });

  const [headlines, setHeadlines] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (userAccount?.paypalEmail && !paypalEmail) {
      setPaypalEmail(userAccount.paypalEmail);
    }
  }, [userAccount, paypalEmail]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'domains') {
      setActiveTab('deploy');
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (onboardingStep >= 2 && onboardingStep <= 4) {
      setActiveTab('deploy');
    }
  }, [onboardingStep]);

  // Bring the box the current tour step refers to into view.
  const identityBoxRef = useRef<HTMLDivElement>(null);
  const headlineBoxRef = useRef<HTMLDivElement>(null);
  const fundBoxRef = useRef<HTMLDivElement>(null);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const target =
      onboardingStep === 2
        ? identityBoxRef.current
        : onboardingStep === 3
        ? headlineBoxRef.current
        : onboardingStep === 4
        ? fundBoxRef.current
        : null;
    if (!target) return;
    const id = window.setTimeout(() => {
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [onboardingStep]);

  useEffect(() => {
    fetch('/api/paypal/status')
      .then((r) => r.json())
      .then((data: PayPalServerStatus) => {
        setPaypalStatus(data);
        if (typeof data.sandboxEnabled === 'boolean') {
          setPaypalSandboxEnabled(data.sandboxEnabled);
        }
        if (data.webhookId) {
          setPaypalWebhookIdInput(data.webhookId);
        }
        if (data.mcpEndpoint) {
          setPaypalMcpEndpointInput(data.mcpEndpoint);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid || userAccount?.firebaseUid;
    if (!uid || !isAdmin) return;
    listUserAuthorizedDomains(uid)
      .then((list) => setAuthorizedDomains(list))
      .catch(() => {});
  }, [userAccount?.firebaseUid, isAdmin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleStartOAuthSignIn = async (provider: 'google' | 'paypal') => {
    setAuthNotice(null);
    if (provider !== 'google') {
      setAuthNotice('PayPal sign-in is not configured. Use Firebase Google sign-in.');
      return;
    }
    {
      setIsGooglePopupLoading(true);
      try {
        const synced = await signInWithGooglePopup();
        const newAccount: UserAccount = {
          id: synced.uid,
          name: synced.name,
          email: synced.email,
          provider: 'google',
          paypalEmail: synced.paypalEmail,
          firebaseUid: synced.uid,
        };
        onSignIn(newAccount);
        setPaypalEmail(synced.paypalEmail);
        setAuthProviderPrompt(null);
        setShowAuthDrawer(false);
        return;
      } catch (err: any) {
        const code = err?.code || '';
        if (code === 'auth/popup-closed-by-user') {
          setIsGooglePopupLoading(false);
          return;
        }
        setAuthNotice(
          'Google popup is restricted in this preview window — click below for 1-click Google sign-in.'
        );
      } finally {
        setIsGooglePopupLoading(false);
      }
    }

      setAuthProviderPrompt(provider);
      setShowAuthDrawer(true);
  };

  const handleCompleteSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authProviderPrompt) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setAuthNotice('Complete Firebase Google sign-in before continuing.');
      return;
    }
    const synced = await syncFirebaseUserToFirestore(
      firebaseUser,
      firebaseUser.email || ''
    );
    const newAccount: UserAccount = {
      id: synced.uid,
      name: synced.name,
      email: synced.email,
      provider: 'google',
      paypalEmail: synced.paypalEmail,
      firebaseUid: synced.uid,
    };
    onSignIn(newAccount);
    setPaypalEmail(synced.paypalEmail);
    setAuthProviderPrompt(null);
    setShowAuthDrawer(false);
  };

  const handleAddAuthorizedDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newDomainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!cleaned || !cleaned.includes('.')) {
      setDomainFeedback('Enter a valid domain (e.g. hotseat.vercel.app)');
      return;
    }
    setIsSavingDomain(true);
    setDomainFeedback(null);
    try {
      const uid = auth.currentUser?.uid || userAccount?.firebaseUid;
      if (uid) {
        const entry = await addUserAuthorizedDomain(uid, cleaned, newDomainEnv);
        setAuthorizedDomains((prev) => [
          ...prev.filter((d) => d.id !== entry.id),
          entry,
        ]);
        setDomainFeedback(`Saved ${entry.domain} to Firestore.`);
      } else {
        const localEntry: AuthorizedDomainEntry = {
          id: cleaned.replace(/[^a-z0-9_-]/g, '-'),
          ownerId: userAccount?.id || 'local',
          domain: cleaned,
          environment: newDomainEnv,
        };
        setAuthorizedDomains((prev) => [
          ...prev.filter((d) => d.id !== localEntry.id),
          localEntry,
        ]);
        setDomainFeedback(
          `Added ${localEntry.domain}. Sign in with Google to persist in Firestore.`
        );
      }
      setNewDomainInput('');
    } catch (err: any) {
      setDomainFeedback(err.message || 'Could not save domain.');
    } finally {
      setIsSavingDomain(false);
    }
  };

  const handleDeleteAuthorizedDomain = async (domainId: string) => {
    const uid = auth.currentUser?.uid || userAccount?.firebaseUid;
    if (uid) {
      await removeUserAuthorizedDomain(uid, domainId).catch(() => {});
    }
    setAuthorizedDomains((prev) => prev.filter((d) => d.id !== domainId));
  };

  const applyPayPalAdminUpdate = async (options: {
    nextSandboxEnabled: boolean;
    clearKeys?: boolean;
  }) => {
    if (!isAdmin || !userAccount?.email) {
      setPaypalConfigFeedback('Only admin (imtyroon@gmail.com) can update PayPal settings.');
      return;
    }
    setIsSavingPaypalConfig(true);
    setPaypalConfigFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        adminEmail: userAccount.email,
        sandboxEnabled: options.nextSandboxEnabled,
        webhookId: options.clearKeys ? '' : paypalWebhookIdInput.trim(),
        mcpEndpoint: paypalMcpEndpointInput.trim(),
      };
      if (options.clearKeys) {
        payload.clientId = '';
        payload.clientSecret = '';
      } else {
        if (paypalClientIdInput.trim()) {
          payload.clientId = paypalClientIdInput.trim();
        }
        if (paypalClientSecretInput.trim()) {
          payload.clientSecret = paypalClientSecretInput.trim();
        }
      }

      const res = await fetch('/api/paypal/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update PayPal settings');
      }

      if (data.status) {
        setPaypalStatus(data.status);
        if (typeof data.status.sandboxEnabled === 'boolean') {
          setPaypalSandboxEnabled(data.status.sandboxEnabled);
        }
      }

      await saveAdminPayPalSettingsToFirestore({
        sandboxEnabled: options.nextSandboxEnabled,
        environment: options.nextSandboxEnabled ? 'SANDBOX' : 'LIVE',
        clientIdPrefix: data.status?.clientIdPrefix || '',
        webhookId: options.clearKeys ? '' : paypalWebhookIdInput.trim(),
      }).catch(() => {});

      if (options.clearKeys) {
        setPaypalClientIdInput('');
        setPaypalClientSecretInput('');
        setPaypalWebhookIdInput('');
        setPaypalConfigFeedback('Cleared live keys — reverted to instant Sandbox Demo mode.');
      } else {
        setPaypalClientSecretInput('');
        setPaypalConfigFeedback(
          `Saved PayPal configuration (${
            options.nextSandboxEnabled ? 'SANDBOX MODE ON' : 'LIVE MODE ON'
          }).`
        );
      }
    } catch (err: any) {
      setPaypalConfigFeedback(err.message || 'Could not update PayPal configuration.');
    } finally {
      setIsSavingPaypalConfig(false);
    }
  };

  const handleSavePayPalAdminConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await applyPayPalAdminUpdate({ nextSandboxEnabled: paypalSandboxEnabled });
  };

  const handleTogglePayPalSandbox = async () => {
    const nextVal = !paypalSandboxEnabled;
    setPaypalSandboxEnabled(nextVal);
    await applyPayPalAdminUpdate({ nextSandboxEnabled: nextVal });
  };

  const handleCopyHostname = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.hostname).catch(() => {});
    setCopiedHost(true);
    setTimeout(() => setCopiedHost(false), 2000);
  };

  const handleCopyGitRmCommand = () => {
    const cmd = `git rm --cached firebase-applet-config.json && git commit -m "chore: untrack firebase-applet-config.json and use VITE_FIREBASE env vars" && git push`;
    navigator.clipboard?.writeText(cmd).catch(() => {});
    setCopiedGitFix(true);
    setTimeout(() => setCopiedGitFix(false), 2500);
  };

  const handleCopyVercelEnvBlock = () => {
    navigator.clipboard?.writeText(getVercelFirebaseEnvSnippet()).catch(() => {});
    setCopiedVercelEnv(true);
    setTimeout(() => setCopiedVercelEnv(false), 2500);
  };

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

  const handleCompile = async () => {
    if (!companyName.trim() || !goalPlainEnglish.trim()) {
      setErrorMsg('Enter your brand name and bidding goal first.');
      return;
    }
    setErrorMsg(null);
    setIsCompiling(true);
    try {
      const res = await onCompileStrategy({
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim() || 'startup.com',
        goalPlainEnglish: goalPlainEnglish.trim(),
        dailyBudgetDollars: topUpDollars,
      });
      setStrategy(res.compiledStrategy);
      setHeadlines(res.headlines);
      if (!activeHeadline && res.headlines[0]) {
        setActiveHeadline(res.headlines[0]);
      }
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
      setErrorMsg('Brand name and website URL are required.');
      return;
    }
    setErrorMsg(null);
    setIsDeploying(true);
    try {
      const finalHeadline =
        activeHeadline.trim() || `${companyName.trim().toUpperCase()} ON THE WALL`;
      await onDeployAgent({
        ownerName: userAccount?.name || 'Founder',
        paypalEmail:
          paypalEmail.trim() || userAccount?.paypalEmail || '',
        companyName: companyName.trim(),
        companyUrl: companyUrl.trim(),
        logoDataUrl,
        goalPlainEnglish:
          goalPlainEnglish.trim() ||
          `Bid up to $${(strategy.maxRateCentsPerMin / 100).toFixed(2)}/min within a $${topUpDollars} budget.`,
        compiledStrategy: strategy,
        headlines: headlines.length > 0 ? headlines : [finalHeadline],
        activeHeadline: finalHeadline,
        sprayThemeIndex,
        templateId: selectedTemplateId,
        topUpDollars,
        snipeImmediatelyOnDeploy,
      });
      if (onboardingStep > 0 && onAdvanceOnboarding) {
        onAdvanceOnboarding(TOUR_DONE_STEP);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Deployment failed.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* FOCUSED, SIMPLISTIC VENDOR BOOTH MODAL */}
      <div className="relative w-full max-w-[640px] max-h-[90vh] flex flex-col bg-white dark:bg-[#121620] text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Subtle Vendor Awning Accent Strip */}
        <div
          className="h-1.5 w-full shrink-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #FF4733 0px, #FF4733 24px, #F8FAFC 24px, #F8FAFC 48px)',
          }}
        />

        {/* Modal Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="font-btn text-xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
              Launch Your Web App on the Billboard
            </h2>
            {onboardingStep > 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                Taking #1 now: ~${(snapshot.billboard.nextTakeoverBlockCostCents / 100).toFixed(2)} for 5 minutes
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                <span>
                  Next 5m snipe: ${(snapshot.billboard.nextTakeoverBlockCostCents / 100).toFixed(2)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  ${(snapshot.billboard.currentDecayedRateCentsPerMin / 100).toFixed(3)}/min (
                  {snapshot.billboard.multipleOfBase.toFixed(1)}×)
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {userAccount ? (
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium truncate max-w-[130px]">
                  {userAccount.name}
                </span>
                {isAdmin && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-[#FF4733]/15 text-[#FF4733] border border-[#FF4733]/30">
                    ADMIN
                  </span>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign out"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer ml-0.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthDrawer((prev) => !prev)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Account Sign-In Bar (Firebase Google Auth & PayPal) */}
        {/* Hidden while the tour is on name/headline steps; asked for again at funding. */}
        {((!userAccount && onboardingStep !== 2 && onboardingStep !== 3) || showAuthDrawer) && (
          <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-[#0D1118]/90 border-b border-slate-200 dark:border-slate-800/80 shrink-0">
            {!authProviderPrompt ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {onboardingStep === 4 ? (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      Sign in to fund your drone
                    </span>{' '}
                    so refunds for unused time come back to you. Optional for a sandbox launch.
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      Sign in
                    </span>{' '}
                    with Google or PayPal so refunds for unused time come back to you.
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isGooglePopupLoading}
                    onClick={() => handleStartOAuthSignIn('google')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171C28] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                      />
                    </svg>
                    <span>{isGooglePopupLoading ? 'Connecting...' : 'Google'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartOAuthSignIn('paypal')}
                    className="px-3 py-1.5 rounded-lg border border-[#0070BA]/30 bg-[#0070BA]/10 hover:bg-[#0070BA]/15 dark:bg-[#0070BA]/20 dark:hover:bg-[#0070BA]/30 text-xs font-medium text-[#005EA6] dark:text-[#60A5FA] inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 2.79A.859.859 0 0 1 5.792 2h7.606c2.812 0 4.828.694 5.993 2.063 1.076 1.264 1.385 2.948.92 5.007-.647 2.865-2.553 4.82-5.665 5.812-.83.264-1.805.396-2.924.396H8.95a.86.86 0 0 0-.848.723l-.926 5.336z" />
                    </svg>
                    <span>PayPal</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCompleteSignIn} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Continue with {authProviderPrompt === 'google' ? 'Google' : 'PayPal'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthProviderPrompt(null);
                      setAuthNotice(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                {authNotice && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                    <span>{authNotice}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthProviderPrompt(null);
                          setActiveTab('domains');
                        }}
                        className="font-semibold underline shrink-0 cursor-pointer"
                      >
                        Domains Setup
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Your name"
                    value={authNameInput}
                    onChange={(e) => setAuthNameInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171C28] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Account / PayPal email"
                    value={authEmailInput}
                    onChange={(e) => setAuthEmailInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171C28] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    Connect Account
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Segmented Navigation Tabs */}
        <div className="px-6 pt-3.5 pb-0 border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('deploy')}
            className={`px-3.5 py-2 font-btn text-xs font-extrabold uppercase tracking-tight border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'deploy'
                ? 'border-[#FF4733] text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Deploy Agent
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wallet')}
            className={`px-3.5 py-2 font-btn text-xs font-extrabold uppercase tracking-tight border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'wallet'
                ? 'border-[#FF4733] text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Agents &amp; Vault ({snapshot.agents.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('curve')}
            className={`px-3.5 py-2 font-btn text-xs font-extrabold uppercase tracking-tight border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'curve'
                ? 'border-[#FF4733] text-slate-900 dark:text-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Live Rate Curve
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('domains')}
              className={`px-3.5 py-2 font-btn text-xs font-extrabold uppercase tracking-tight border-b-2 transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeTab === 'domains'
                  ? 'border-[#FF4733] text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Vercel &amp; Domains</span>
            </button>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* ===============================================================
              TAB 1: SIMPLE, STREAMLINED WEB APP DEPLOYMENT + ONBOARDING HAPPY PATH
             =============================================================== */}
          {activeTab === 'deploy' && (
            <form onSubmit={handleDeploy} className="space-y-4">
              {/* Onboarding tour banner for steps 2-4 */}
              {onboardingStep >= 2 && onboardingStep <= 4 && (
                <div
                  role="region"
                  aria-label="Launch tour"
                  aria-live="polite"
                  className="sticky top-0 z-10 rounded-xl bg-[#111318] text-white border-2 border-[#FFE66D] shadow-[0_8px_24px_rgba(0,0,0,0.35)] p-4 space-y-3"
                >
                  <TourProgress step={onboardingStep} onSkip={() => onAdvanceOnboarding?.(0)} />

                  {onboardingStep === 2 && (
                    <div className="space-y-2.5">
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        Enter your app&apos;s <strong className="text-white">name</strong> and{' '}
                        <strong className="text-white">live URL</strong>. Visitors who tap the mural land there.
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCompanyName('PixelFlow Studio');
                            setCompanyUrl('pixelflow.app');
                          }}
                          className="text-xs text-[#FFE66D] hover:text-white underline-offset-4 hover:underline cursor-pointer"
                        >
                          Use a sample app
                        </button>
                        <button
                          type="button"
                          disabled={!companyName.trim() || !companyUrl.trim()}
                          onClick={() => onAdvanceOnboarding?.(3)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#FF4733] hover:bg-[#E83A27] text-white font-btn font-extrabold text-xs uppercase inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFE66D]"
                        >
                          <span>Next</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {onboardingStep === 3 && (
                    <div className="space-y-2.5">
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        Write the <strong className="text-white">headline</strong> painted on the wall, or start from one of these.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'DESIGN & SHIP WEB APPS IN SECONDS',
                          'REALTIME CANVAS FOR PRODUCT TEAMS',
                          'AI WORKSPACE FOR MODERN DEVELOPERS',
                        ].map((sampleHl) => (
                          <button
                            key={sampleHl}
                            type="button"
                            aria-pressed={activeHeadline === sampleHl}
                            onClick={() => setActiveHeadline(sampleHl)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-btn font-bold text-left cursor-pointer transition-colors ${
                              activeHeadline === sampleHl
                                ? 'bg-[#FFE66D] text-[#111318]'
                                : 'bg-white/10 text-slate-200 hover:bg-white/15'
                            }`}
                          >
                            {sampleHl}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onAdvanceOnboarding?.(2)}
                          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Back</span>
                        </button>
                        <button
                          type="button"
                          disabled={!activeHeadline.trim()}
                          onClick={() => onAdvanceOnboarding?.(4)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#FF4733] hover:bg-[#E83A27] text-white font-btn font-extrabold text-xs uppercase inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFE66D]"
                        >
                          <span>Next</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {onboardingStep === 4 && (
                    <div className="space-y-2.5">
                      <p className="text-[13px] text-slate-300 leading-relaxed">
                        Pick how your drone bids and a starting wallet. Then hit{' '}
                        <strong className="text-[#FFE66D]">Fund &amp; Launch</strong> at the bottom.
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onAdvanceOnboarding?.(3)}
                          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Back</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            launchButtonRef.current?.scrollIntoView({
                              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                              block: 'center',
                            })
                          }
                          className="text-xs text-[#7CFF00] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Jump to launch</span>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Row 1: Web App Name & Website URL */}
              <div
                ref={identityBoxRef}
                className={`rounded-xl p-3.5 transition-all ${
                  onboardingStep === 2
                    ? 'ring-3 ring-[#FF4733] bg-amber-50/50 dark:bg-[#1A1618] border border-[#FF4733]'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#171C28]/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-btn font-bold text-slate-800 dark:text-slate-200">
                    Your app
                  </span>
                  {onboardingStep === 2 && (
                    <span className="text-[10px] font-mono font-bold uppercase text-[#FF4733]">
                      Start here
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Web App or Brand Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={28}
                      placeholder="PixelFlow Studio"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700/90 bg-white dark:bg-[#0D1118] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Live Web App URL
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={38}
                      placeholder="pixelflow.app"
                      value={companyUrl}
                      onChange={(e) => setCompanyUrl(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700/90 bg-white dark:bg-[#0D1118] px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Billboard Headline + Optional Logo + Mural Style */}
              <div
                ref={headlineBoxRef}
                className={`rounded-xl p-3.5 space-y-3.5 transition-all ${
                  onboardingStep === 3
                    ? 'ring-3 ring-[#FF4733] bg-amber-50/50 dark:bg-[#1A1618] border border-[#FF4733]'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#171C28]/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-btn font-bold text-slate-800 dark:text-slate-200">
                    Headline &amp; mural style
                  </span>
                  {onboardingStep === 3 && (
                    <span className="text-[10px] font-mono font-bold uppercase text-[#FF4733]">
                      You are here
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Billboard Headline (What your web app does)
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {activeHeadline.length}/46
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="text"
                      maxLength={46}
                      placeholder="Design and ship interactive web apps in seconds"
                      value={activeHeadline}
                      onChange={(e) => setActiveHeadline(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700/90 bg-white dark:bg-[#0D1118] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                    />

                    <label
                      title="Upload optional brand logo"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700/90 bg-slate-50 hover:bg-slate-100 dark:bg-[#171C28] dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>{logoDataUrl ? 'Logo Set' : 'Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleStudioLogoUpload}
                        className="hidden"
                      />
                    </label>

                    {logoDataUrl && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1118]">
                        <img
                          src={logoDataUrl}
                          alt="Uploaded brand logo"
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setLogoDataUrl('')}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {headlines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {headlines.map((hl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActiveHeadline(hl)}
                          className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                            activeHeadline === hl
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {hl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spray Pigment Swatch & Mural Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Drone Spray Color
                    </label>
                    <div className="flex items-center gap-2">
                      {[
                        { idx: 0, color: '#FFE600', label: 'Volt' },
                        { idx: 1, color: '#FF4733', label: 'Coral' },
                        { idx: 2, color: '#00E5FF', label: 'Cyan' },
                        { idx: 3, color: '#FF3399', label: 'Pink' },
                        { idx: 4, color: '#7CFF00', label: 'Lime' },
                        { idx: 6, color: '#8F33FF', label: 'Grape' },
                      ].map((sw) => (
                        <button
                          key={sw.idx}
                          type="button"
                          onClick={() => setSprayThemeIndex(sw.idx)}
                          title={sw.label}
                          style={{ backgroundColor: sw.color }}
                          className={`w-6 h-6 rounded-full border-2 border-slate-900 cursor-pointer transition-transform ${
                            sprayThemeIndex === sw.idx
                              ? 'scale-120 ring-2 ring-[#FF4733]'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Billboard Mural Template
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value as AdTemplateId)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1118] px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                    >
                      <option value="BOMB_BURST">Swiss Grid (Yellow Impact)</option>
                      <option value="CROWN_TAG">Monumental Type (Direct on Brick)</option>
                      <option value="SKATE_DECK">Kinetic Slash (Indigo / Cyan)</option>
                      <option value="NEON_ARCADE">Emerald Spotlight (Monogram + Pitch)</option>
                      <option value="WHEATPASTE_POSTER">Editorial Frame (Warm Gallery)</option>
                      <option value="SPRAY_CLOUD">Split Showcase (Two-Column Crest)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 3: Simple Bidding Controls + Wallet Top-Up & Launch */}
              <div
                ref={fundBoxRef}
                className={`rounded-xl p-4 space-y-3.5 transition-all ${
                  onboardingStep === 4
                    ? 'ring-3 ring-[#FF4733] bg-amber-50/50 dark:bg-[#1A1618] border border-[#FF4733]'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#171C28]/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-btn font-bold text-slate-800 dark:text-slate-200">
                    Bidding &amp; wallet
                  </span>
                  {onboardingStep === 4 && (
                    <span className="text-[10px] font-mono font-bold uppercase text-[#FF4733]">
                      You are here
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Bidding style
                    </label>
                    <select
                      value={strategy.personality}
                      onChange={(e) =>
                        setStrategy({
                          ...strategy,
                          personality: e.target.value as AgentPersonality,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1118] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                    >
                      <option value="sniper">Sniper: jumps in when the price dips</option>
                      <option value="aggressive">Aggressive: holds #1 and fights back</option>
                      <option value="patient">Patient: waits for the cheapest moments</option>
                      <option value="peak">Peak hour: goes for high-traffic times</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Most you'll pay per minute
                      </label>
                      <span className="text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ${(strategy.maxRateCentsPerMin / 100).toFixed(3)}/min (
                        {(strategy.maxRateCentsPerMin / 4).toFixed(1)}×)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4.0}
                      max={40.0}
                      step={0.8}
                      value={strategy.maxRateCentsPerMin}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setStrategy({
                          ...strategy,
                          maxRateCentsPerMin: val,
                          entryMaxMultiple: Number((val / 4.0).toFixed(2)),
                        });
                      }}
                      className="w-full accent-[#FF4733] cursor-pointer mt-1.5"
                    />
                  </div>
                </div>

                {/* Retaliation & Immediate Snipe Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={strategy.retaliateOnKick}
                      onChange={(e) =>
                        setStrategy({
                          ...strategy,
                          retaliateOnKick: e.target.checked,
                          retaliateTargetCompany: e.target.checked ? 'ANY' : '',
                        })
                      }
                      className="accent-[#FF4733] rounded"
                    />
                    <span>Take #1 back if someone outbids me</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={snipeImmediatelyOnDeploy}
                      onChange={(e) => setSnipeImmediatelyOnDeploy(e.target.checked)}
                      className="accent-[#FF4733] rounded"
                    />
                    <span>Grab #1 as soon as I launch</span>
                  </label>
                </div>

                {/* Collapsible Plain-English AI Strategy Compiler */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAiAssistant((prev) => !prev)}
                    className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF4733]" />
                      <span>Write custom bidding strategy in plain English (optional)</span>
                    </span>
                    {showAiAssistant ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showAiAssistant && (
                    <div className="mt-3 space-y-2.5">
                      <textarea
                        rows={2}
                        placeholder="e.g. Claim the billboard whenever the rate drops below $0.10/min and retaliate if kicked off..."
                        value={goalPlainEnglish}
                        onChange={(e) => setGoalPlainEnglish(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1118] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={isCompiling}
                          onClick={handleCompile}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isCompiling ? 'Compiling...' : 'Compile Strategy'}</span>
                        </button>
                        {compiledBy && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                            Compiled ({compiledBy})
                          </span>
                        )}
                      </div>
                      {strategy.summaryExplanation && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {strategy.summaryExplanation}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Wallet Top-Up */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div>
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Starting wallet
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Time you don&apos;t use is refunded automatically
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1118] border border-slate-200/80 dark:border-slate-800">
                    {[5, 10, 20].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopUpDollars(amt)}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                          topUpDollars === amt
                            ? 'bg-white dark:bg-[#1E2536] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        ${amt}.00
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <button
                ref={launchButtonRef}
                type="submit"
                disabled={isDeploying || moderationStatus === 'flagged'}
                className={`street-ui-btn w-full py-3 px-4 rounded-xl bg-[#FF4733] hover:bg-[#E83A27] text-white font-btn font-extrabold uppercase text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                  onboardingStep === 4
                    ? 'ring-4 ring-[#FFE66D]'
                    : ''
                }`}
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>
                  {isDeploying
                    ? 'Funding Wallet & Painting Billboard...'
                    : `Fund $${topUpDollars}.00 & Launch Web App onto Billboard`}
                </span>
              </button>
            </form>
          )}

          {/* ===============================================================
              TAB 2: ACTIVE AGENTS & PAYPAL VAULT
             =============================================================== */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              {/* Active Agents List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Deployed Agents ({snapshot.agents.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('deploy')}
                    className="text-xs font-semibold text-[#FF4733] hover:underline cursor-pointer"
                  >
                    + New Agent
                  </button>
                </div>

                {snapshot.agents.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Your drones will show up here
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      A drone bids for the #1 spot for you and refunds unused time if it gets outbid.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('deploy')}
                      className="mt-2 px-4 py-2 rounded-lg bg-[#FF4733] text-white text-xs font-semibold cursor-pointer"
                    >
                      Launch your first drone
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0D1118]/60 overflow-hidden">
                    {snapshot.agents.map((agent) => {
                      const isHolding = snapshot.billboard.currentHolderAgentId === agent.id;
                      return (
                        <div key={agent.id} className="p-4 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: agent.sprayColor }}
                              />
                              <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                {agent.companyName}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                · {agent.compiledStrategy.personality} · max $
                                {(agent.compiledStrategy.maxRateCentsPerMin / 100).toFixed(2)}/m
                                {isHolding ? ' · On Wall' : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums mr-1.5">
                                ${(agent.balanceCents / 100).toFixed(2)}
                              </span>

                              <button
                                type="button"
                                onClick={async () => {
                                  await onManualTakeover(agent.id, agent.templateId);
                                  onClose();
                                }}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FF4733] hover:bg-[#E83A27] text-white cursor-pointer"
                              >
                                Claim
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateAgent(agent.id, { isActive: !agent.isActive })
                                }
                                className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171C28] text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1"
                              >
                                {agent.isActive ? (
                                  <>
                                    <Pause className="w-3 h-3" />
                                    <span>Pause</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3" />
                                    <span>Resume</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={async () => {
                                  setBusyId(`topup-${agent.id}`);
                                  try {
                                    await onCreateTopUpOrder(agent.id, 5);
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-md text-xs font-mono font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171C28] text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                              >
                                +$5
                              </button>

                              <button
                                type="button"
                                disabled={agent.balanceCents <= 0 || busyId !== null}
                                onClick={async () => {
                                  setBusyId(`payout-${agent.id}`);
                                  try {
                                    await onCashOutPayout(agent.id);
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171C28] text-slate-700 dark:text-slate-200 hover:bg-slate-50 inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                              >
                                <span>Cash Out</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span className="truncate">{agent.lastDecisionText}</span>
                            {agent.totalRefundedCents > 0 && (
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
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

              {/* PayPal Orders & Atomic Refund Ledger */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    PayPal &amp; Pro-Rata Refund Activity ({snapshot.ledger.length})
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    {snapshot.paypalMode}
                  </span>
                </div>

                {snapshot.pendingOrders.some(
                  (o) => o.status === 'CREATED_AWAITING_WEBHOOK'
                ) && (
                  <div className="space-y-1.5">
                    {snapshot.pendingOrders
                      .filter((o) => o.status === 'CREATED_AWAITING_WEBHOOK')
                      .map((ord) => (
                        <div
                          key={ord.orderId}
                          className="p-3 rounded-lg border border-amber-300/80 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-mono text-slate-800 dark:text-slate-200">
                            {ord.orderId} · {ord.companyName} (+$
                            {(ord.amountCents / 100).toFixed(2)})
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {snapshot.ledger.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                    No wallet transactions yet. Top-ups, billboard claims, and pro-rata refunds appear here in real time.
                  </div>
                ) : (
                  <div className="max-h-[210px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0D1118]/60 px-4">
                    {snapshot.ledger.map((entry) => {
                      const isCredit = entry.amountCents > 0;
                      return (
                        <div
                          key={entry.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 font-medium">
                              <span>{entry.companyName}</span>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {entry.type}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {entry.description}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div
                              className={`font-semibold ${
                                isCredit
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {isCredit ? '+' : '-'}$
                              {(Math.abs(entry.amountCents) / 100).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Bal ${(entry.balanceAfterCents / 100).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===============================================================
              TAB 3: LIVE RATE CURVE & 10-MINUTE HALF-LIFE DECAY
             =============================================================== */}
          {activeTab === 'curve' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  Current rate: ${(snapshot.billboard.currentDecayedRateCentsPerMin / 100).toFixed(3)}/min · Next takeover: $
                  {(snapshot.billboard.nextTakeoverBlockCostCents / 100).toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => onFastForwardCooling(5)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-[#171C28] dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <FastForward className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Simulate +5m Cooling</span>
                </button>
              </div>

              <LiveRateChart
                billboard={snapshot.billboard}
                priceHistory={snapshot.priceHistory}
                isDarkMode={isDarkMode}
              />
            </div>
          )}

          {/* ===============================================================
              TAB 4: VERCEL DEPLOYMENT, FIREBASE AUTHORIZED DOMAINS & PAYPAL
              (Restricted strictly to Admin: imtyroon@gmail.com)
             =============================================================== */}
          {isAdmin && activeTab === 'domains' && (
            <div className="space-y-5">
              {/* 1. Firebase Auth & Authorized Domains Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#171C28]/60 p-4 space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                        Firebase Auth &amp; Authorized Domains (Admin: imtyroon@gmail.com)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Whitelist your Vercel production &amp; preview domains so Google Sign-In works after deployment.
                    </p>
                  </div>

                  <a
                    href={FIREBASE_AUTHORIZED_DOMAINS_CONSOLE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <span>Firebase Auth Settings</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                      Firebase Project ID
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {FIREBASE_PROJECT_ID}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                      Auth Domain
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate block">
                      {FIREBASE_AUTH_DOMAIN}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                        Current Hostname
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate block">
                        {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      title="Copy current hostname"
                      className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
                    >
                      {copiedHost ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Add Vercel / Custom Domain Form */}
                <form onSubmit={handleAddAuthorizedDomain} className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Register Vercel / Custom Domain in Firestore
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="your-project.vercel.app"
                      value={newDomainInput}
                      onChange={(e) => setNewDomainInput(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1118] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                    />
                    <select
                      value={newDomainEnv}
                      onChange={(e) =>
                        setNewDomainEnv(
                          e.target.value as
                            | 'vercel-production'
                            | 'vercel-preview'
                            | 'custom-domain'
                        )
                      }
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1118] px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
                    >
                      <option value="vercel-production">Vercel Production</option>
                      <option value="vercel-preview">Vercel Preview</option>
                      <option value="custom-domain">Custom Domain</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isSavingDomain}
                      className="px-3.5 py-1.5 rounded-lg bg-[#FF4733] hover:bg-[#E83A27] text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Domain</span>
                    </button>
                  </div>
                  {domainFeedback && (
                    <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {domainFeedback}
                    </p>
                  )}
                </form>

                {/* Registered Domains List */}
                {authorizedDomains.length > 0 && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] overflow-hidden">
                    {authorizedDomains.map((item) => (
                      <div
                        key={item.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.domain}
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            WHITELISTED · {item.environment}
                          </span>
                        </div>
                        {item.domain !== 'hotseat.vercel.app' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAuthorizedDomain(item.id)}
                            className="text-slate-400 hover:text-red-500 cursor-pointer p-1"
                            title="Remove domain"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Local development PayPal controls only. Production credentials belong in Vercel. */}
              {!import.meta.env.PROD && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#171C28]/60 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      PayPal APIs &amp; Sandbox Mode Control
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Toggle Sandbox Mode ON/OFF and configure your PayPal Orders v2 &amp; Payouts v1 API credentials when approved.
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border ${
                      paypalSandboxEnabled
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {paypalStatus?.modeLabel ||
                      (paypalSandboxEnabled
                        ? 'SANDBOX DEMO ACTIVE (READY FOR DEMO)'
                        : 'LIVE PRODUCTION MODE')}
                  </span>
                </div>

                {/* Sandbox ON/OFF Switch */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        PayPal Sandbox Mode
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          paypalSandboxEnabled
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {paypalSandboxEnabled ? 'SANDBOX ON' : 'SANDBOX OFF (LIVE)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {paypalSandboxEnabled
                        ? 'Using api-m.sandbox.paypal.com (or instant simulated top-ups & pro-rata refunds when no keys are entered).'
                        : 'Using api-m.paypal.com for live production Orders v2 & Payouts v1.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isSavingPaypalConfig}
                    onClick={handleTogglePayPalSandbox}
                    role="switch"
                    aria-checked={paypalSandboxEnabled}
                    className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                      paypalSandboxEnabled
                        ? 'bg-emerald-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        paypalSandboxEnabled ? 'translate-x-7' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* PayPal API Credentials Form */}
                <form
                  onSubmit={handleSavePayPalAdminConfig}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1118] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      PayPal REST API Credentials (Orders v2 &amp; Payouts v1)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {paypalStatus?.configured
                        ? `Active Key: ${paypalStatus.clientIdPrefix || 'Configured'}`
                        : 'No Live Keys Set (Demo Simulation)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        PayPal Client ID
                      </label>
                      <input
                        type="text"
                        placeholder={
                          paypalStatus?.clientIdPrefix
                            ? `${paypalStatus.clientIdPrefix} (leave blank to keep)`
                            : 'Enter PAYPAL_CLIENT_ID...'
                        }
                        value={paypalClientIdInput}
                        onChange={(e) => setPaypalClientIdInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171C28] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        PayPal Client Secret
                      </label>
                      <input
                        type="password"
                        placeholder={
                          paypalStatus?.configured
                            ? '•••••••••••••••• (leave blank to keep)'
                            : 'Enter PAYPAL_CLIENT_SECRET...'
                        }
                        value={paypalClientSecretInput}
                        onChange={(e) => setPaypalClientSecretInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171C28] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        PayPal Webhook ID (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Enter PAYPAL_WEBHOOK_ID..."
                        value={paypalWebhookIdInput}
                        onChange={(e) => setPaypalWebhookIdInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171C28] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        PayPal MCP / API Endpoint
                      </label>
                      <input
                        type="text"
                        placeholder="https://api-m.sandbox.paypal.com/v1/mcp"
                        value={paypalMcpEndpointInput}
                        onChange={(e) => setPaypalMcpEndpointInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#171C28] px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4733]/40"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Target Base URL:{' '}
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                        {paypalStatus?.apiBaseUrl ||
                          (paypalSandboxEnabled
                            ? 'https://api-m.sandbox.paypal.com'
                            : 'https://api-m.paypal.com')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {paypalStatus?.configured && (
                        <button
                          type="button"
                          disabled={isSavingPaypalConfig}
                          onClick={() =>
                            applyPayPalAdminUpdate({
                              nextSandboxEnabled: true,
                              clearKeys: true,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                        >
                          Reset to Demo Sandbox
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingPaypalConfig}
                        className="px-3.5 py-1.5 rounded-lg bg-[#FF4733] hover:bg-[#E83A27] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isSavingPaypalConfig ? 'Saving...' : 'Save PayPal API Config'}
                      </button>
                    </div>
                  </div>

                  {paypalConfigFeedback && (
                    <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 pt-1">
                      {paypalConfigFeedback}
                    </p>
                  )}
                </form>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
