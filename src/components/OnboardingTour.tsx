import React from 'react';
import { X } from 'lucide-react';

// Steps 1-4 are the guided path; step 5 is the "you're live" card; 0 means no tour.
export const TOUR_STEPS = ['Open studio', 'Name your app', 'Write headline', 'Fund & launch'] as const;
export const TOUR_TOTAL = TOUR_STEPS.length;
export const TOUR_DONE_STEP = TOUR_TOTAL + 1;

const TOUR_STORAGE_KEY = 'hotseat_tour_done_v1';

export function readTourDone(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourDone(): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // Storage blocked (private mode): tour will just show again next visit.
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Returns true only the first time it is called for `key` in this browser. */
export function claimOneTimeTip(key: string): boolean {
  const storageKey = `hotseat_tip_${key}_v1`;
  try {
    if (window.localStorage.getItem(storageKey) === '1') return false;
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Storage blocked: still show the tip this once.
  }
  return true;
}

const MY_AGENTS_KEY = 'hotseat_my_agents_v1';

/** Agent ids launched from this browser, used to tell "your" drone apart from rivals. */
export function readMyAgentIds(): string[] {
  try {
    const raw = window.localStorage.getItem(MY_AGENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberMyAgentId(id: string): string[] {
  const next = Array.from(new Set([...readMyAgentIds(), id]));
  try {
    window.localStorage.setItem(MY_AGENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the id is still kept in memory for this session.
  }
  return next;
}

interface TourProgressProps {
  step: number;
  onSkip: () => void;
  skipLabel?: string;
}

/** Segmented progress + step label + skip control shared by every tour card. */
export function TourProgress({ step, onSkip, skipLabel = 'Skip tour' }: TourProgressProps) {
  const done = step >= TOUR_DONE_STEP;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-hud text-xs font-bold uppercase text-[#FFE66D] tabular-nums">
          {done ? 'Tour complete' : `Step ${step} of ${TOUR_TOTAL} · ${TOUR_STEPS[step - 1]}`}
        </span>
        <button
          type="button"
          onClick={onSkip}
          aria-label={skipLabel}
          title={skipLabel}
          className="w-7 h-7 -mr-1 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#FFE66D] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${TOUR_TOTAL}, minmax(0, 1fr))` }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOUR_TOTAL}
        aria-valuenow={done ? TOUR_TOTAL : step - 1}
        aria-label="Tour progress"
      >
        {TOUR_STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1 rounded-full transition-colors duration-300 ${
              done || i < step - 1 ? 'bg-[#7CFF00]' : i === step - 1 ? 'bg-[#FFE66D]' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
