import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { UserAccount } from './BackwallControlPage';

type PublisherGame = { id: string; name: string; platform: string; max_players_per_server: number; status: string };
type PublisherPlacement = { id: string; game_id: string; name: string; aspect_ratio: number; enabled: number; viewable_impressions_today: number };
type ServerCredential = { id: string; game_id: string; server_id: string; created_at_ms: number; last_used_at_ms: number | null };
type PublisherProfile = {
  publisher: { id: string; email: string; displayName: string; countryCode: string; status: string; payoutRecipientConfigured: boolean };
  games: PublisherGame[];
  placements: PublisherPlacement[];
  serverCredentials: ServerCredential[];
  earnings: { gross_share_cents: number | string; withholding_cents: number | string; net_payable_cents: number | string; recovery_balance_cents: number | string };
  payouts: Array<{ id: string; period: string; currency: string; amount_cents: number | string; status: string; failure_reason: string }>;
  taxReadiness: string;
  payoutGate: { enabled: boolean; checks: Record<string, boolean> };
};

interface PublisherDashboardProps {
  isDarkMode: boolean;
  userAccount: UserAccount | null;
  onSignIn: () => Promise<void>;
  onClose: () => void;
}

function money(cents: number | string | undefined) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export const PublisherDashboard: React.FC<PublisherDashboardProps> = ({ isDarkMode, userAccount, onSignIn, onClose }) => {
  const [profile, setProfile] = useState<PublisherProfile | null>(null);
  const [audience, setAudience] = useState({ activeWebsiteSessions: 0, activeGamePlayers: 0, combinedAudience: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [credentialSecret, setCredentialSecret] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in again to continue.');
    const token = await user.getIdToken();
    const response = await fetch(`/api/game-ads${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }, []);

  const load = useCallback(async () => {
    if (!userAccount) { setProfile(null); return; }
    setLoading(true);
    try {
      const [publisherResult, audienceResult] = await Promise.all([
        request('/publishers/me'),
        fetch('/api/game-ads/audience', { cache: 'no-store' }).then(async (response) => ({ response, data: await response.json() })),
      ]);
      if (publisherResult.response.status === 404) setProfile(null);
      else if (!publisherResult.response.ok) throw new Error(publisherResult.data.error || 'Could not load publisher profile.');
      else setProfile(publisherResult.data as PublisherProfile);
      if (audienceResult.response.ok) setAudience(audienceResult.data);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load publisher data.');
    } finally {
      setLoading(false);
    }
  }, [request, userAccount]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      fetch('/api/game-ads/audience', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => { if (data) setAudience(data); })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  const submit = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Request failed.'); }
    finally { setBusy(false); }
  };

  const handlePublisherSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void submit(async () => {
      const { response, data } = await request('/publishers', {
        method: 'POST',
        body: JSON.stringify({
          countryCode: 'KE',
          displayName: fields.get('displayName'),
          countryEvidence: fields.get('countryEvidence'),
          projectAccessEvidence: fields.get('projectEvidence'),
          trustedServerEvidence: fields.get('serverEvidence'),
        }),
      });
      if (!response.ok) throw new Error(data.error || 'Could not submit publisher profile.');
      await load();
    });
  };

  const handleGameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void submit(async () => {
      const { response, data } = await request('/games', {
        method: 'POST',
        body: JSON.stringify({
          name: fields.get('name'),
          platform: fields.get('platform'),
          maxPlayersPerServer: Number(fields.get('maxPlayersPerServer')),
          projectEvidence: fields.get('projectEvidence'),
        }),
      });
      if (!response.ok) throw new Error(data.error || 'Could not register game.');
      form.reset();
      await load();
    });
  };

  const addPlacement = (gameId: string, form: HTMLFormElement) => {
    const fields = new FormData(form);
    void submit(async () => {
      const { response, data } = await request(`/games/${encodeURIComponent(gameId)}/placements`, {
        method: 'POST', body: JSON.stringify({ name: fields.get('name'), aspectRatio: Number(fields.get('aspectRatio')) }),
      });
      if (!response.ok) throw new Error(data.error || 'Could not register placement.');
      form.reset();
      await load();
    });
  };

  const issueCredential = (gameId: string, serverId: string) => void submit(async () => {
    setCredentialSecret('');
    const { response, data } = await request(`/games/${encodeURIComponent(gameId)}/credentials`, { method: 'POST', body: JSON.stringify({ serverId }) });
    if (!response.ok) throw new Error(data.error || 'Could not issue server credential.');
    setCredentialSecret(data.credential);
    await load();
  });

  const revokeCredential = (credentialId: string) => void submit(async () => {
    const { response, data } = await request(`/credentials/${encodeURIComponent(credentialId)}/revoke`, { method: 'POST' });
    if (!response.ok) throw new Error(data.error || 'Could not revoke server credential.');
    await load();
  });

  const handlePayoutRecipientSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void submit(async () => {
      const { response, data } = await request('/publishers/me/payout-recipient', {
        method: 'PUT', body: JSON.stringify({ email: paypalEmail }),
      });
      if (!response.ok) throw new Error(data.error || 'Could not save payout recipient.');
      setPaypalEmail('');
      form.reset();
      await load();
    });
  };

  const surface = isDarkMode ? 'bg-[#10151d] text-white' : 'bg-[#F8F7F2] text-[#141414]';
  const panel = isDarkMode ? 'border-white/15 bg-[#171e28]' : 'border-[#1B1F24]/20 bg-white';
  const input = isDarkMode ? 'border-white/20 bg-[#0d1118] text-white' : 'border-[#1B1F24]/30 bg-white text-[#141414]';

  return (
    <section className={`fixed inset-0 z-50 overflow-y-auto ${surface}`} aria-label="Game publisher dashboard">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-current/15 bg-inherit px-4 py-3 sm:px-8">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#00A9D6]">Hot Seat · Kenya V1</p>
          <h1 className="text-xl font-btn font-extrabold uppercase">Game Publisher</h1>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-current/25 px-3 py-1.5 text-xs font-bold uppercase">Close</button>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 p-4 pb-12 sm:p-8">
        <section className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-4 ${panel}`} aria-label="Live audience">
          <div><p className="text-xs opacity-70">Website sessions</p><strong className="text-2xl font-mono">{audience.activeWebsiteSessions}</strong></div>
          <div><p className="text-xs opacity-70">Game players</p><strong className="text-2xl font-mono">{audience.activeGamePlayers}</strong></div>
          <div><p className="text-xs opacity-70">Combined audience</p><strong className="text-2xl font-mono">{audience.combinedAudience}</strong></div>
          <p className="self-center text-xs leading-relaxed opacity-70">Active players set pricing. Viewable impressions are reported separately and do not affect payouts.</p>
        </section>

        {error && <p role="alert" className="rounded-lg border border-red-400/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
        {loading && <p className="text-sm opacity-70">Refreshing publisher data…</p>}

        {!userAccount ? (
          <section className={`rounded-xl border p-6 ${panel}`}>
            <h2 className="text-lg font-btn font-bold">Sign in to register a game</h2>
            <p className="mt-1 text-sm opacity-70">Publisher identity uses verified Google sign-in. V1 onboarding is limited to Kenya.</p>
            <button type="button" onClick={() => void submit(onSignIn)} disabled={busy} className="mt-4 rounded-md bg-[#7CFF00] px-4 py-2 text-sm font-bold text-[#111318] disabled:opacity-50">Sign in with Google</button>
          </section>
        ) : !profile ? (
          <form onSubmit={handlePublisherSubmit} className={`space-y-4 rounded-xl border p-5 ${panel}`}>
            <div><h2 className="text-lg font-btn font-bold">Publisher review</h2><p className="text-sm opacity-70">Submit project access and trusted server deployment evidence. Credentials stay locked until review passes.</p></div>
            <label className="block text-sm font-semibold">Publisher or studio name<input name="displayName" required maxLength={100} defaultValue={userAccount.name} className={`mt-1 w-full rounded-md border px-3 py-2 ${input}`} /></label>
            <label className="block text-sm font-semibold">Kenya eligibility evidence<textarea name="countryEvidence" required minLength={8} maxLength={1000} className={`mt-1 min-h-20 w-full rounded-md border px-3 py-2 ${input}`} placeholder="Describe a verifiable Kenya residency or business registration record for admin review." /></label>
            <label className="block text-sm font-semibold">Project access evidence<textarea name="projectEvidence" required minLength={8} maxLength={1000} className={`mt-1 min-h-20 w-full rounded-md border px-3 py-2 ${input}`} placeholder="Describe project ownership or access for review." /></label>
            <label className="block text-sm font-semibold">Trusted server deployment evidence<textarea name="serverEvidence" required minLength={8} maxLength={1000} className={`mt-1 min-h-20 w-full rounded-md border px-3 py-2 ${input}`} placeholder="Describe the dedicated server deployment that will hold the credential." /></label>
            <button disabled={busy} className="rounded-md bg-[#00B9E8] px-4 py-2 text-sm font-bold text-[#07131a] disabled:opacity-50">Submit for Kenya publisher review</button>
          </form>
        ) : (
          <>
            <section className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-5 ${panel}`}>
              <div><h2 className="text-lg font-btn font-bold">{profile.publisher.displayName}</h2><p className="text-sm opacity-70">{profile.publisher.email} · Kenya · {profile.publisher.status}</p></div>
              <button type="button" onClick={() => void load()} className="rounded-md border border-current/25 px-3 py-1.5 text-xs font-bold uppercase">Refresh</button>
            </section>

            {profile.publisher.status !== 'verified' ? (
              <section className={`rounded-xl border p-5 ${panel}`}><h3 className="font-bold">Review pending</h3><p className="mt-1 text-sm opacity-70">Game registration and server credentials unlock after publisher review.</p></section>
            ) : (
              <>
                <form onSubmit={handleGameSubmit} className={`grid gap-3 rounded-xl border p-5 md:grid-cols-2 ${panel}`}>
                  <div className="md:col-span-2"><h3 className="font-btn font-bold">Register a game</h3><p className="text-xs opacity-70">Unity, Unreal Engine, and Godot only. Approval required before serving.</p></div>
                  <label className="text-sm font-semibold">Game name<input name="name" required maxLength={100} className={`mt-1 w-full rounded-md border px-3 py-2 ${input}`} /></label>
                  <label className="text-sm font-semibold">Engine<select name="platform" className={`mt-1 w-full rounded-md border px-3 py-2 ${input}`}><option value="unity">Unity</option><option value="unreal">Unreal Engine</option><option value="godot">Godot</option></select></label>
                  <label className="text-sm font-semibold">Maximum players per server<input name="maxPlayersPerServer" type="number" min={1} max={10000} defaultValue={100} required className={`mt-1 w-full rounded-md border px-3 py-2 ${input}`} /></label>
                  <label className="text-sm font-semibold">Project evidence<input name="projectEvidence" required minLength={8} maxLength={1000} className={`mt-1 w-full rounded-md border px-3 py-2 ${input}`} placeholder="Repository, build, or project access" /></label>
                  <button disabled={busy} className="rounded-md bg-[#00B9E8] px-4 py-2 text-sm font-bold text-[#07131a] disabled:opacity-50 md:col-span-2">Submit game for review</button>
                </form>

                {profile.games.map((game) => {
                  const placements = profile.placements.filter((placement) => placement.game_id === game.id);
                  const credentials = profile.serverCredentials.filter((credential) => credential.game_id === game.id);
                  return <section key={game.id} className={`space-y-3 rounded-xl border p-5 ${panel}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-btn font-bold">{game.name}</h3><p className="text-xs opacity-70">{game.platform} · cap {game.max_players_per_server} · {game.status}</p></div></div>
                    {game.status === 'verified' && <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const serverId = String(new FormData(form).get('serverId') || '').trim(); issueCredential(game.id, serverId); form.reset(); }} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <label className="text-xs font-semibold">Stable server ID<input name="serverId" required maxLength={100} pattern="[A-Za-z0-9_.:-]+" className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${input}`} placeholder="prod-eu-01" /></label>
                      <button type="submit" disabled={busy} className="self-end rounded-md border border-[#00B9E8]/50 px-3 py-2 text-xs font-bold text-[#00B9E8] disabled:opacity-50">Issue server credential</button>
                    </form>}
                    {game.status === 'verified' && <form onSubmit={(event) => { event.preventDefault(); addPlacement(game.id, event.currentTarget); }} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                      <label className="text-xs font-semibold">Placement name<input name="name" required maxLength={100} className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${input}`} /></label>
                      <label className="text-xs font-semibold">Aspect ratio<input name="aspectRatio" type="number" min={0.5} max={10} step={0.1} defaultValue={2} required className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${input}`} /></label>
                      <button disabled={busy} className="self-end rounded-md bg-[#FFE66D] px-3 py-2 text-xs font-bold text-[#141414] disabled:opacity-50">Add placement</button>
                    </form>}
                    {placements.length > 0 && <ul className="divide-y divide-current/10 text-sm">{placements.map((placement) => <li key={placement.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{placement.name} · {placement.aspect_ratio}:1 · {placement.enabled ? 'enabled' : 'awaiting review'}</span><span className="text-xs opacity-70">{Number(placement.viewable_impressions_today || 0)} viewable impressions today</span></li>)}</ul>}
                    {credentials.map((credential) => <div key={credential.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/10 px-3 py-2 text-xs"><span>Server {credential.server_id} credential · created {new Date(credential.created_at_ms).toLocaleDateString()}</span><button type="button" onClick={() => revokeCredential(credential.id)} disabled={busy} className="font-bold text-red-400">Revoke</button></div>)}
                  </section>;
                })}
              </>
            )}

            {credentialSecret && <section className="rounded-xl border-2 border-[#FFE66D] bg-[#282414] p-5 text-[#FFF7CF]"><h3 className="font-bold">Copy this server credential now</h3><p className="mt-1 text-xs">Shown once. Store on your trusted server only. Never put it in a public game client or source control.</p><code className="mt-3 block break-all rounded bg-black/30 p-3 text-xs">{credentialSecret}</code><button type="button" onClick={() => setCredentialSecret('')} className="mt-3 text-xs underline">I saved it</button></section>}

            <section className={`grid gap-4 rounded-xl border p-5 md:grid-cols-2 ${panel}`}>
              <div><h3 className="font-btn font-bold">Earnings ledger</h3><p className="mt-2 text-sm">Gross share: {money(profile.earnings?.gross_share_cents)}</p><p className="text-sm">Withholding: {money(profile.earnings?.withholding_cents)}</p><p className="text-sm">Net payable: {money(profile.earnings?.net_payable_cents)}</p><p className="text-sm">Unsettled share adjustments: {money(profile.earnings?.recovery_balance_cents)}</p><p className="mt-2 text-xs opacity-70">Tax readiness: {profile.taxReadiness}. Remittance and withholding requirements must be reviewed before payout eligibility.</p></div>
              <div><h3 className="font-btn font-bold">Payout gates</h3><p className="mt-1 text-xs">Automated USD payouts run only when every production check is ready.</p><ul className="mt-2 space-y-1 text-xs">{Object.entries(profile.payoutGate?.checks || {}).map(([name, passed]) => <li key={name} className="flex justify-between gap-3"><span>{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span><span>{passed ? 'ready' : 'blocked'}</span></li>)}</ul></div>
              {profile.publisher.status === 'verified' && <div className="md:col-span-2"><h3 className="font-btn font-bold">USD payout recipient</h3><p className="mt-1 text-xs opacity-70">PayPal email is stored encrypted. {profile.publisher.payoutRecipientConfigured ? 'A recipient is saved.' : 'No recipient is saved.'} Saving details does not enable payouts.</p><form onSubmit={handlePayoutRecipientSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="publisher-paypal-email">PayPal email</label><input id="publisher-paypal-email" type="email" autoComplete="email" required maxLength={127} value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm ${input}`} placeholder="PayPal email" /><button disabled={busy || !profile.payoutGate.checks.recipientEncryptionReady} className="rounded-md bg-[#00B9E8] px-4 py-2 text-xs font-bold text-[#07131a] disabled:opacity-50">Save encrypted recipient</button></form></div>}
              {profile.payouts?.length > 0 && <div className="md:col-span-2"><h3 className="font-btn font-bold">Monthly payout records</h3><ul className="mt-2 space-y-1 text-sm">{profile.payouts.map((payout) => <li key={payout.id}>{payout.period}: {money(payout.amount_cents)} {payout.currency} · {payout.status}{payout.failure_reason ? ` · ${payout.failure_reason}` : ''}</li>)}</ul></div>}
            </section>
          </>
        )}
      </div>
    </section>
  );
};
