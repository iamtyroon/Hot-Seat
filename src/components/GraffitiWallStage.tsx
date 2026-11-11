import React, { useState, useEffect, useMemo } from 'react';
import {
  ArenaSnapshot,
  WallLayer,
  AgentRecord,
  AdTemplateId,
} from '../types';
import {
  CartoonAdArtwork,
  AD_TEMPLATES,
  getTemplateMeta,
} from './CartoonAdArtwork';
import { TinySidewalkCrowd } from './TinySidewalkCrowd';
import {
  Zap,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  FastForward,
  Sparkles,
  ShieldAlert,
  Volume2,
  VolumeX,
  Users,
  Sun,
  Moon,
  Crosshair,
  SprayCan,
  ImagePlus,
  X,
  Crown,
  Flame,
  Plus,
  Play,
  Swords,
} from 'lucide-react';

import { UserAccount } from './BackwallControlPage';

export type PageRoute = 'wall' | 'war-room' | 'studio' | 'ledger' | 'embed';
export type ThemePreference = 'system' | 'light' | 'dark';

interface GraffitiWallStageProps {
  snapshot: ArenaSnapshot;
  isDarkMode: boolean;
  themePreference: ThemePreference;
  onCycleThemePreference: () => void;
  userAccount: UserAccount | null;
  selectedManualAgentId: string;
  onSelectManualAgentId: (id: string) => void;
  onManualTakeover: (
    agentId: string,
    templateIdOverride?: AdTemplateId,
    logoDataUrlOverride?: string
  ) => Promise<void>;
  onUpdateHolderLogo?: (
    agentId: string,
    logoDataUrl: string,
    templateId?: AdTemplateId
  ) => Promise<void>;
  onTriggerBiddingWar: () => Promise<void>;
  onFastForwardCooling: (minutes: number) => Promise<void>;
  onActivateKillSwitch: () => Promise<void>;
  onRequestCommentary: () => Promise<void>;
  onAddCrowd?: (count: number) => Promise<void>;
  onNavigateBrick: (page: PageRoute) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isEmbedMode?: boolean;
  onboardingStep?: number;
  onAdvanceOnboarding?: (nextStep: number) => void;
  onStartOnboarding?: () => void;
}

interface IvyLeafSpec {
  x: number;
  y: number;
  scale: number;
  rot: number;
  tone: 0 | 1 | 2 | 3;
  flutter?: boolean;
}

/**
 * Detailed hand-inked multi-lobed botanical ivy leaf with central & lateral veins.
 */
const BotanicalIvyLeaf: React.FC<{
  leaf: IvyLeafSpec;
  isDarkMode: boolean;
  lightsOn: boolean;
}> = ({ leaf, isDarkMode, lightsOn }) => {
  const dayPalette = ['#3B7A31', '#4E9440', '#65B054', '#7EC86B'];
  const nightLitPalette = ['#265326', '#336B31', '#44853F', '#589E50'];
  const nightDimPalette = ['#18351B', '#214624', '#2B572E', '#366939'];

  const palette = isDarkMode
    ? lightsOn
      ? nightLitPalette
      : nightDimPalette
    : dayPalette;

  const fill = palette[leaf.tone];
  const veinStroke = isDarkMode ? '#102412' : '#254D1F';
  const highlightColor = isDarkMode && lightsOn ? '#A8E070' : '#9EE387';

  return (
    <g transform={`translate(${leaf.x}, ${leaf.y}) rotate(${leaf.rot}) scale(${leaf.scale})`}>
      <g className={leaf.flutter ? 'animate-leaf-flutter' : undefined}>
        <path
          d="M 0,0
             C -4,-2 -11,-1 -15,4
             C -12,6 -10,9 -13,13
             C -8,13 -5,15 -6,20
             C -2,18 0,22 0,25
             C 0,22 2,18 6,20
             C 5,15 8,13 13,13
             C 10,9 12,6 15,4
             C 11,-1 4,-2 0,0 Z"
          fill={fill}
          stroke="#162016"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M -1,2 C -5,1 -9,2 -12,5"
          fill="none"
          stroke={highlightColor}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.65"
        />
        <path
          d="M 0,1 L 0,21 M 0,6 L -8,10 M 0,6 L 8,10 M 0,12 L -5,16 M 0,12 L 5,16"
          fill="none"
          stroke={veinStroke}
          strokeWidth="1.15"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
    </g>
  );
};

const LEFT_CANOPY_LEAVES: IvyLeafSpec[] = [
  { x: 132, y: -4, scale: 1.55, rot: -28, tone: 0 },
  { x: 158, y: -6, scale: 1.65, rot: -8, tone: 1, flutter: true },
  { x: 186, y: -4, scale: 1.6, rot: 14, tone: 2 },
  { x: 215, y: -5, scale: 1.5, rot: 26, tone: 0, flutter: true },
  { x: 242, y: -2, scale: 1.35, rot: 36, tone: 1 },
  { x: 144, y: 14, scale: 1.45, rot: -22, tone: 2, flutter: true },
  { x: 172, y: 18, scale: 1.55, rot: 6, tone: 3 },
  { x: 202, y: 16, scale: 1.45, rot: -12, tone: 1, flutter: true },
  { x: 228, y: 20, scale: 1.3, rot: 22, tone: 2 },
  { x: 156, y: 38, scale: 1.35, rot: -16, tone: 0 },
  { x: 184, y: 42, scale: 1.4, rot: 18, tone: 2, flutter: true },
  { x: 212, y: 40, scale: 1.25, rot: -14, tone: 3 },
];

const LEFT_VINE_A_LEAVES: IvyLeafSpec[] = [
  { x: 146, y: 58, scale: 1.28, rot: 25, tone: 1, flutter: true },
  { x: 135, y: 82, scale: 1.22, rot: -24, tone: 2 },
  { x: 148, y: 104, scale: 1.18, rot: 18, tone: 3, flutter: true },
  { x: 128, y: 128, scale: 1.12, rot: -28, tone: 1 },
  { x: 136, y: 154, scale: 1.08, rot: 22, tone: 2, flutter: true },
  { x: 118, y: 180, scale: 1.02, rot: -20, tone: 0 },
  { x: 126, y: 206, scale: 0.96, rot: 16, tone: 3, flutter: true },
  { x: 108, y: 232, scale: 0.9, rot: -24, tone: 2 },
  { x: 115, y: 258, scale: 0.85, rot: 18, tone: 1, flutter: true },
  { x: 98, y: 284, scale: 0.78, rot: -15, tone: 3 },
  { x: 102, y: 308, scale: 0.72, rot: 12, tone: 2, flutter: true },
];

const LEFT_VINE_B_LEAVES: IvyLeafSpec[] = [
  { x: 178, y: 64, scale: 1.26, rot: -18, tone: 0 },
  { x: 192, y: 88, scale: 1.2, rot: 24, tone: 2, flutter: true },
  { x: 174, y: 114, scale: 1.15, rot: -20, tone: 3 },
  { x: 186, y: 142, scale: 1.08, rot: 16, tone: 1, flutter: true },
  { x: 168, y: 168, scale: 1.02, rot: -22, tone: 2 },
  { x: 178, y: 196, scale: 0.94, rot: 20, tone: 3, flutter: true },
  { x: 164, y: 224, scale: 0.86, rot: -14, tone: 1 },
  { x: 170, y: 248, scale: 0.76, rot: 8, tone: 2, flutter: true },
];

const LEFT_VINE_C_LEAVES: IvyLeafSpec[] = [
  { x: 226, y: 54, scale: 1.22, rot: 26, tone: 1, flutter: true },
  { x: 214, y: 82, scale: 1.14, rot: -22, tone: 3 },
  { x: 232, y: 108, scale: 1.06, rot: 18, tone: 2, flutter: true },
  { x: 218, y: 136, scale: 0.96, rot: -18, tone: 0 },
  { x: 228, y: 162, scale: 0.88, rot: 15, tone: 3, flutter: true },
  { x: 220, y: 188, scale: 0.78, rot: -10, tone: 2 },
];

const RIGHT_VINE_LEAVES: IvyLeafSpec[] = [
  { x: 894, y: -4, scale: 1.48, rot: -24, tone: 0 },
  { x: 920, y: -6, scale: 1.55, rot: 8, tone: 2, flutter: true },
  { x: 946, y: -3, scale: 1.42, rot: 28, tone: 1 },
  { x: 906, y: 18, scale: 1.35, rot: -18, tone: 3, flutter: true },
  { x: 932, y: 22, scale: 1.3, rot: 20, tone: 1 },
  { x: 912, y: 46, scale: 1.2, rot: -22, tone: 2, flutter: true },
  { x: 928, y: 72, scale: 1.14, rot: 24, tone: 0 },
  { x: 906, y: 98, scale: 1.06, rot: -20, tone: 3, flutter: true },
  { x: 922, y: 124, scale: 0.98, rot: 18, tone: 2 },
  { x: 904, y: 150, scale: 0.9, rot: -16, tone: 1, flutter: true },
  { x: 916, y: 176, scale: 0.82, rot: 14, tone: 3 },
  { x: 908, y: 198, scale: 0.72, rot: -8, tone: 2, flutter: true },
];

/**
 * Resolves the exact visual paint colors rendered on the brick wall by CartoonAdArtwork
 * for a given template so the drone's pressurized paint canisters, aerosol spray mist,
 * and takeover paint curtain 100% match the actual wall mural.
 */
function resolveWallPaintPalette(
  templateId?: AdTemplateId | null,
  layerSprayColor?: string
): { primaryPaint: string; secondaryPaint: string; washPaint: string } {
  switch (templateId) {
    case 'CROWN_TAG':
      return {
        primaryPaint: '#FF4733',
        secondaryPaint: '#F8FAFC',
        washPaint: '#111318',
      };
    case 'WHEATPASTE_POSTER':
      return {
        primaryPaint: '#E11D48',
        secondaryPaint: '#FAF8F2',
        washPaint: '#181E2C',
      };
    case 'SPRAY_CLOUD':
      return {
        primaryPaint: '#2563EB',
        secondaryPaint: '#F8FAFC',
        washPaint: '#111318',
      };
    case 'SKATE_DECK':
      return {
        primaryPaint: '#00F5D4',
        secondaryPaint: '#FFE600',
        washPaint: '#16193B',
      };
    case 'NEON_ARCADE':
      return {
        primaryPaint: '#10B981',
        secondaryPaint: '#A7F3D0',
        washPaint: '#092622',
      };
    case 'BOMB_BURST':
    default: {
      const accent =
        layerSprayColor && layerSprayColor !== '#FFFFFF' ? layerSprayColor : '#FFE600';
      return {
        primaryPaint: accent,
        secondaryPaint: '#F8FAFC',
        washPaint: '#10141D',
      };
    }
  }
}

/* ============================================================================
   AUTONOMOUS AGENTIC PAINT UAV (SLEEK 2.5D QUADCOPTER + PRESSURIZED PAINT PODS)
   - Engineered carbon-titanium quadcopter with 4 high-RPM brushless rotor pods,
     central AI optical lidar/camera dome, and pneumatic cargo claws suspending
     twin transparent pressurized paint canisters filled with the exact wall colors.
   - Mode 'challenger': Glides across the wall atomizing a feathered gradient
     aerosol plume + flowing high-velocity paint streams in exact wall colors.
   - Mode 'defender-watching': Hovers on the right, banks back, and locks its
     optical camera sensor onto the rival drone painting over its mural.
   - Mode 'patrol': Compact autonomous sentry hovering near the overhead lamps.
   ============================================================================ */
interface MechaPainterDroneProps {
  companyName: string;
  primaryColor: string;
  accentColor: string;
  mode: 'challenger' | 'defender-watching' | 'patrol';
  defenderTargetName?: string | null;
}

const MechaPainterDrone: React.FC<MechaPainterDroneProps> = ({
  companyName,
  primaryColor,
  accentColor,
  mode,
  defenderTargetName,
}) => {
  const uid = React.useId().replace(/:/g, '');
  const isChallenger = mode === 'challenger';
  const isWatching = mode === 'defender-watching';
  const isPatrol = mode === 'patrol';

  return (
    <svg
      width={isChallenger ? 340 : isWatching ? 250 : 176}
      height={isChallenger ? 200 : isWatching ? 165 : 114}
      viewBox="0 0 340 200"
      fill="none"
      className="overflow-visible drop-shadow-[0_12px_22px_rgba(0,0,0,0.68)]"
    >
      <defs>
        {/* Feathered Aerosol Spray Plume Gradient (No hard polygon edges!) */}
        <linearGradient id={`plumePrimary-${uid}`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor={primaryColor} stopOpacity="0.95" />
          <stop offset="45%" stopColor={primaryColor} stopOpacity="0.55" />
          <stop offset="82%" stopColor={accentColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
        </linearGradient>

        <radialGradient id={`mistCloud-${uid}`} cx="72%" cy="52%" r="48%">
          <stop offset="0%" stopColor={primaryColor} stopOpacity="0.65" />
          <stop offset="55%" stopColor={accentColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
        </radialGradient>

        {/* Carbon-Titanium Aerodynamic Fuselage Gradient */}
        <linearGradient id={`chassisShell-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="45%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        {/* Pressurized Cylindrical Glass Specular Highlight */}
        <linearGradient id={`glassSheen-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="75%" stopColor="#000000" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
        </linearGradient>

        {/* Optical Lidar Tracking Cone Gradient */}
        <linearGradient id={`lidarLock-${uid}`} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#FF4733" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#FF4733" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#FF4733" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* =====================================================================
          1. FEATHERED AEROSOL PAINT STREAM & FLOWING DROPLETS
             (100% Matched to the Active Wall Paint Palette!)
         ===================================================================== */}
      {(isChallenger || isPatrol) && (
        <g className="animate-spray-cone">
          {/* Soft Atomized Paint Cloud on Wall Impact Zone */}
          <ellipse
            cx="286"
            cy="122"
            rx={isChallenger ? 52 : 34}
            ry={isChallenger ? 44 : 26}
            fill={`url(#mistCloud-${uid})`}
          />

          {/* Feathered Conical Spray Plume from Airless Nozzle */}
          <path
            d="M 198,125 C 232,102 276,78 332,68 L 332,174 C 276,164 232,144 198,129 Z"
            fill={`url(#plumePrimary-${uid})`}
          />

          {/* High-Velocity Flowing Liquid Paint Streams (Animated stroke-dashoffset) */}
          <path
            d="M 198,126 Q 254,110 318,92"
            stroke={primaryColor}
            strokeWidth={isChallenger ? '4.5' : '3'}
            strokeLinecap="round"
            strokeDasharray="14 10"
            className="animate-paint-stream"
          />
          <path
            d="M 198,128 Q 258,126 324,124"
            stroke={accentColor}
            strokeWidth={isChallenger ? '3.5' : '2.2'}
            strokeLinecap="round"
            strokeDasharray="10 14"
            className="animate-paint-stream"
          />
          <path
            d="M 198,130 Q 254,142 314,154"
            stroke={primaryColor}
            strokeWidth={isChallenger ? '4' : '2.5'}
            strokeLinecap="round"
            strokeDasharray="12 12"
            className="animate-paint-stream"
          />

          {/* Atomized Paint Droplets & Fresh Wall Drips */}
          {isChallenger && (
            <g>
              <circle cx="294" cy="96" r="6" fill={primaryColor} />
              <circle cx="312" cy="118" r="8" fill={accentColor} />
              <circle cx="288" cy="142" r="7" fill={primaryColor} />
              <circle cx="272" cy="112" r="4" fill="#FFFFFF" opacity="0.85" />
              <path
                d="M 294,102 L 294,148 M 312,126 L 312,168 M 288,148 L 288,178"
                stroke={primaryColor}
                strokeWidth="3.5"
                strokeLinecap="round"
                opacity="0.9"
              />
            </g>
          )}
        </g>
      )}

      {/* =====================================================================
          2. DEFENDER OPTICAL LIDAR LOCK (WHEN WATCHING RIVAL PAINT OVER)
         ===================================================================== */}
      {isWatching && (
        <g>
          <polygon
            points="92,90 -24,48 -24,132"
            fill={`url(#lidarLock-${uid})`}
          />
          <line
            x1="92"
            y1="90"
            x2="-18"
            y2="90"
            stroke="#FF4733"
            strokeWidth="1.8"
            strokeDasharray="5 4"
            className="animate-paint-stream"
          />
        </g>
      )}

      {/* =====================================================================
          3. SLEEK 2.5D QUADCOPTER UAV AIRFRAME + 4 HIGH-RPM BRUSHLESS ROTORS
         ===================================================================== */}
      <g transform={isWatching ? 'rotate(-3 130 84)' : 'rotate(2 130 84)'}>
        {/* Rear-Left & Rear-Right Carbon Outrigger Spars */}
        <line x1="96" y1="68" x2="36" y2="50" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
        <line x1="96" y1="68" x2="36" y2="50" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="164" y1="68" x2="224" y2="50" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
        <line x1="164" y1="68" x2="224" y2="50" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

        {/* Rear-Left Brushless Rotor Pod */}
        <g transform="translate(36, 46)">
          <ellipse
            cx="0"
            cy="-5"
            rx="28"
            ry="3.5"
            fill="#E2E8F0"
            className="animate-rotor-disc"
          />
          <ellipse cx="0" cy="-5" rx="14" ry="2" fill={primaryColor} opacity="0.9" />
          <rect x="-6" y="-4" width="12" height="10" rx="3" fill="#1E293B" stroke="#090D16" strokeWidth="2" />
          <circle cx="0" cy="1" r="2" fill={primaryColor} />
        </g>

        {/* Rear-Right Brushless Rotor Pod */}
        <g transform="translate(224, 46)">
          <ellipse
            cx="0"
            cy="-5"
            rx="28"
            ry="3.5"
            fill="#E2E8F0"
            className="animate-rotor-disc"
          />
          <ellipse cx="0" cy="-5" rx="14" ry="2" fill={accentColor} opacity="0.9" />
          <rect x="-6" y="-4" width="12" height="10" rx="3" fill="#1E293B" stroke="#090D16" strokeWidth="2" />
          <circle cx="0" cy="1" r="2" fill={accentColor} />
        </g>

        {/* Front-Left & Front-Right Twin-Spar Carbon Booms */}
        <line x1="92" y1="74" x2="22" y2="62" stroke="#090D16" strokeWidth="9" strokeLinecap="round" />
        <line x1="92" y1="74" x2="22" y2="62" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="78" y1="71" x2="36" y2="64" stroke={primaryColor} strokeWidth="2.2" strokeLinecap="round" />

        <line x1="168" y1="74" x2="238" y2="62" stroke="#090D16" strokeWidth="9" strokeLinecap="round" />
        <line x1="168" y1="74" x2="238" y2="62" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="182" y1="71" x2="224" y2="64" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />

        {/* Front-Left Main Brushless Motor Nacelle & High-RPM Rotor Disc */}
        <g transform="translate(22, 58)">
          <ellipse
            cx="0"
            cy="-7"
            rx="36"
            ry="4.8"
            fill="#F8FAFC"
            className="animate-rotor-disc"
          />
          <ellipse cx="0" cy="-7" rx="20" ry="2.4" fill={primaryColor} />
          <line x1="-34" y1="-7" x2="34" y2="-7" stroke="#090D16" strokeWidth="1.6" opacity="0.7" />
          <rect x="-8" y="-5" width="16" height="14" rx="4" fill="#0F172A" stroke="#090D16" strokeWidth="2.2" />
          <rect x="-5" y="-1" width="10" height="3" rx="1" fill={primaryColor} />
          <circle cx="0" cy="-8" r="3" fill="#F8FAFC" stroke="#090D16" strokeWidth="1.5" />
          {/* Under-Motor Navigation Strobe */}
          <circle cx="0" cy="11" r="2.5" fill={primaryColor} />
        </g>

        {/* Front-Right Main Brushless Motor Nacelle & High-RPM Rotor Disc */}
        <g transform="translate(238, 58)">
          <ellipse
            cx="0"
            cy="-7"
            rx="36"
            ry="4.8"
            fill="#F8FAFC"
            className="animate-rotor-disc"
          />
          <ellipse cx="0" cy="-7" rx="20" ry="2.4" fill={accentColor} />
          <line x1="-34" y1="-7" x2="34" y2="-7" stroke="#090D16" strokeWidth="1.6" opacity="0.7" />
          <rect x="-8" y="-5" width="16" height="14" rx="4" fill="#0F172A" stroke="#090D16" strokeWidth="2.2" />
          <rect x="-5" y="-1" width="10" height="3" rx="1" fill={accentColor} />
          <circle cx="0" cy="-8" r="3" fill="#F8FAFC" stroke="#090D16" strokeWidth="1.5" />
          {/* Under-Motor Navigation Strobe */}
          <circle cx="0" cy="11" r="2.5" fill={accentColor} />
        </g>

        {/* ===================================================================
            4. CENTRAL AUTONOMOUS AI FLIGHT CORE & OPTICAL LIDAR EYE
           =================================================================== */}
        <g>
          {/* Top AI GPS / Telemetry Puck */}
          <rect x="122" y="42" width="16" height="6" rx="3" fill="#1E293B" stroke="#090D16" strokeWidth="2" />
          <circle cx="130" cy="40" r="2.5" fill={isWatching ? '#FF4733' : '#10B981'} />

          {/* Sculpted Aerodynamic Carbon Canopy */}
          <path
            d="M 78,74 C 84,52 104,46 130,46 C 156,46 176,52 182,74 L 172,90 C 164,95 96,95 88,90 Z"
            fill={`url(#chassisShell-${uid})`}
            stroke="#090D16"
            strokeWidth="3"
          />

          {/* Color-Matched Agentic Canopy Visor Band */}
          <path
            d="M 90,70 C 96,57 110,53 130,53 C 150,53 164,57 170,70 L 164,77 L 96,77 Z"
            fill={primaryColor}
            stroke="#090D16"
            strokeWidth="2"
          />

          {/* Specular Canopy Highlight */}
          <path
            d="M 102,59 C 112,56 128,55 148,57"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* Autonomous AI Optical Camera / Lidar Gimbal Turret */}
          <g transform={isWatching ? 'translate(96, 88)' : 'translate(160, 88)'}>
            <circle cx="0" cy="0" r="10.5" fill="#0F172A" stroke="#090D16" strokeWidth="2.5" />
            <circle
              cx={isWatching ? -3.5 : 3.5}
              cy="0"
              r="5.5"
              fill={isWatching ? '#FF4733' : primaryColor}
              stroke="#FFFFFF"
              strokeWidth="1.4"
            />
            <circle cx={isWatching ? -4.5 : 4.5} cy="-1.5" r="1.8" fill="#FFFFFF" />
          </g>
        </g>

        {/* ===================================================================
            5. PNEUMATIC CLAW CRADLE HOLDING DUAL PRESSURIZED PAINT CONTAINERS
               (Transparent Glass Cylinders Filled with Exact Wall Paint!)
           =================================================================== */}
        <g>
          {/* Left & Right Articulated Carbon-Steel Cargo Claws */}
          <path
            d="M 102,91 L 94,108 L 100,136 M 158,91 L 166,108 L 160,136"
            stroke="#090D16"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 102,91 L 94,108 L 100,136 M 158,91 L 166,108 L 160,136"
            stroke="#64748B"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* UPPER / SECONDARY HELD PAINT CONTAINER (Accent Wall Color Cylinder) */}
          <g transform="translate(88, 98)">
            <rect
              x="0"
              y="0"
              width="74"
              height="16"
              rx="6"
              fill={accentColor}
              stroke="#090D16"
              strokeWidth="2.4"
            />
            <rect
              x="0"
              y="0"
              width="74"
              height="16"
              rx="6"
              fill={`url(#glassSheen-${uid})`}
            />
            {/* Metallic Cylinder End Caps */}
            <rect x="-2" y="1" width="7" height="14" rx="2" fill="#CBD5E1" stroke="#090D16" strokeWidth="2" />
            <rect x="69" y="1" width="7" height="14" rx="2" fill="#CBD5E1" stroke="#090D16" strokeWidth="2" />
            {/* Claw Clamp Straps */}
            <rect x="16" y="-1" width="6" height="18" rx="1.5" fill="#1E293B" stroke="#090D16" strokeWidth="1.6" />
            <rect x="52" y="-1" width="6" height="18" rx="1.5" fill="#1E293B" stroke="#090D16" strokeWidth="1.6" />
          </g>

          {/* LOWER / MAIN HELD PAINT CONTAINER (Primary Wall Color Pressurized Tank) */}
          <g transform="translate(82, 115)">
            <rect
              x="0"
              y="0"
              width="90"
              height="24"
              rx="8"
              fill={primaryColor}
              stroke="#090D16"
              strokeWidth="2.8"
            />
            <rect
              x="0"
              y="0"
              width="90"
              height="24"
              rx="8"
              fill={`url(#glassSheen-${uid})`}
            />
            {/* Stainless Steel Tank Caps */}
            <rect x="-3" y="2" width="8" height="20" rx="2.5" fill="#E2E8F0" stroke="#090D16" strokeWidth="2.2" />
            <rect x="85" y="2" width="8" height="20" rx="2.5" fill="#E2E8F0" stroke="#090D16" strokeWidth="2.2" />

            {/* Claw Grip Bands Holding the Main Paint Container */}
            <rect x="20" y="-2" width="7" height="28" rx="2" fill="#1E293B" stroke="#090D16" strokeWidth="1.8" />
            <rect x="62" y="-2" width="7" height="28" rx="2" fill="#1E293B" stroke="#090D16" strokeWidth="1.8" />

            {/* Liquid Level Sight Badge in Center of Tank */}
            <rect
              x="31"
              y="5"
              width="27"
              height="14"
              rx="3"
              fill="#0F172A"
              stroke="#090D16"
              strokeWidth="1.6"
            />
            <circle cx="38" cy="12" r="3.5" fill={primaryColor} />
            <circle cx="46" cy="12" r="3.5" fill={accentColor} />
            <circle cx="53" cy="12" r="2" fill="#FFFFFF" />

            {/* Precision Airless Spray Nozzle Manifold Mounted to Front of Container */}
            <rect
              x="92"
              y="5"
              width="14"
              height="14"
              rx="3"
              fill="#1E293B"
              stroke="#090D16"
              strokeWidth="2.2"
            />
            <polygon
              points="106,7 115,4 115,20 106,17"
              fill={accentColor}
              stroke="#090D16"
              strokeWidth="2"
            />
            <circle
              cx="116"
              cy="12"
              r="3"
              fill={isWatching ? '#64748B' : primaryColor}
              stroke="#FFFFFF"
              strokeWidth="1.2"
            />
          </g>
        </g>
      </g>

      {/* =====================================================================
          6. SLEEK AGENT CALLSIGN PILL & STATUS TELEMETRY
         ===================================================================== */}
      <g transform="translate(130, 22)">
        <rect
          x="-64"
          y="-12"
          width="128"
          height="22"
          rx="6"
          fill="#0B0F17"
          stroke={isWatching ? '#FF4733' : primaryColor}
          strokeWidth="2"
        />
        <circle
          cx="-51"
          cy="-1"
          r="3.5"
          fill={isWatching ? '#FF4733' : primaryColor}
        />
        <text
          x="5"
          y="3.5"
          textAnchor="middle"
          fill="#F8FAFC"
          fontSize="11"
          fontWeight="800"
          fontFamily="Barlow Condensed, sans-serif"
          letterSpacing="0.08em"
        >
          {isWatching
            ? `${companyName.slice(0, 8).toUpperCase()} · WATCHING ${(defenderTargetName || 'RIVAL').slice(0, 6).toUpperCase()}`
            : `${companyName.slice(0, 11).toUpperCase()} · AI UAV`}
        </text>
      </g>
    </svg>
  );
};

export const GraffitiWallStage: React.FC<GraffitiWallStageProps> = ({
  snapshot,
  isDarkMode,
  themePreference,
  onCycleThemePreference,
  userAccount,
  selectedManualAgentId,
  onSelectManualAgentId,
  onManualTakeover,
  onUpdateHolderLogo,
  onTriggerBiddingWar,
  onFastForwardCooling,
  onActivateKillSwitch,
  onRequestCommentary,
  onAddCrowd,
  onNavigateBrick,
  soundEnabled,
  onToggleSound,
  isEmbedMode = false,
  onboardingStep = 0,
  onAdvanceOnboarding,
  onStartOnboarding,
}) => {
  const { billboard, wallLayers, agents } = snapshot;
  const [peelOpacity, setPeelOpacity] = useState<number>(100);
  const [inspectedLayer, setInspectedLayer] = useState<WallLayer | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<AdTemplateId>('BOMB_BURST');
  const [customLogoDataUrl, setCustomLogoDataUrl] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Live Two-Drone Snipe Takeover Animation State
  const [activeSnipeDrama, setActiveSnipeDrama] = useState<{
    key: string;
    attackerCompany: string;
    attackerHeadline: string;
    attackerColor: string;
    attackerAccent: string;
    attackerPersonality: string;
    defenderCompany: string | null;
    defenderColor: string;
    defenderAccent: string;
    rateCentsPerMin: number;
    blockCostCents: number;
    refundedCents: number;
    isRetaliation: boolean;
  } | null>(null);
  const lastSeenLayerIdRef = React.useRef<string | null>(
    wallLayers.length > 0 ? wallLayers[wallLayers.length - 1].id : null
  );

  // Dynamic lamps: automatically ON whenever it is Night (dark mode), OFF during the Day
  const lightsOn = isDarkMode;

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          const dataUrl = canvas.toDataURL('image/png');
          setCustomLogoDataUrl(dataUrl);
          if (billboard.currentHolderAgentId && onUpdateHolderLogo) {
            onUpdateHolderLogo(billboard.currentHolderAgentId, dataUrl, selectedTemplateId);
          }
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Deterministic 22 courses of staggered cartoon bricks shared between the base wall AND the over-paint mortar overlay!
  const brickCourses = useMemo(() => {
    const rows: Array<{
      rowIdx: number;
      y: number;
      h: number;
      bricks: Array<{
        x: number;
        w: number;
        toneIdx: number;
        hasHatch: boolean;
        hasCrumb: boolean;
        seamJitter: number;
      }>;
    }> = [];

    const wallLeft = 54;
    const wallRight = 1386;
    const rowH = 34;
    const totalRows = 22;

    for (let r = 0; r < totalRows; r++) {
      const y = 14 + r * rowH;
      let curX = wallLeft;
      const isOdd = r % 2 === 1;
      const bricks: Array<{
        x: number;
        w: number;
        toneIdx: number;
        hasHatch: boolean;
        hasCrumb: boolean;
        seamJitter: number;
      }> = [];

      let col = 0;
      while (curX < wallRight) {
        const seed = (r * 37 + col * 19) % 29;
        const baseW = col === 0 && isOdd ? 54 : 104 + ((seed % 5) - 2) * 4;
        const w = Math.min(baseW, wallRight - curX);
        const toneIdx = (r * 7 + col * 13 + seed) % 5;
        const hasHatch = seed === 3 || seed === 17;
        const hasCrumb = seed === 11 || seed === 23;
        const seamJitter = (seed % 3) - 1;

        bricks.push({
          x: curX,
          w,
          toneIdx,
          hasHatch,
          hasCrumb,
          seamJitter,
        });
        curX += w;
        col++;
      }

      rows.push({ rowIdx: r, y, h: rowH, bricks });
    }
    return rows;
  }, []);

  const topLayer = wallLayers.length > 0 ? wallLayers[wallLayers.length - 1] : null;

  // Maintain a persistent array of whited-out remnants whenever an ad is displaced or buffed
  const [whitedOutArchive, setWhitedOutArchive] = useState<WallLayer[]>(() =>
    wallLayers.length > 1 ? wallLayers.slice(0, -1) : []
  );

  useEffect(() => {
    const displacedFromServer =
      billboard.isKillSwitchActive ? wallLayers : wallLayers.slice(0, -1);
    if (displacedFromServer.length === 0) return;

    setWhitedOutArchive((prev) => {
      const byId = new Map<string, WallLayer>();
      for (const item of prev) byId.set(item.id, item);
      for (const item of displacedFromServer) byId.set(item.id, item);
      return Array.from(byId.values())
        .filter((l) => billboard.isKillSwitchActive || l.id !== topLayer?.id)
        .sort((a, b) => a.layerIndex - b.layerIndex)
        .slice(-8);
    });
  }, [wallLayers, topLayer?.id, billboard.isKillSwitchActive]);

  // Compute the ordered `fadedRemnants` array (oldest at bottom -> newest right beneath top layer)
  // with strictly decreasing opacity and whitewashed blend mode effect
  const fadedRemnants = useMemo(() => {
    const recent = whitedOutArchive.slice(-6);
    const total = recent.length;
    return recent.map((layer, index) => {
      // remnantAge: 1 = most recently whited out, higher = older layer deeper in the wall history
      const remnantAge = total - index;
      // Strictly decreasing base opacity: 0.46 -> 0.38 -> 0.30 -> 0.22 -> 0.16 -> 0.11
      const baseDecreasingOpacity = Math.max(0.11, 0.46 - (remnantAge - 1) * 0.08);
      // Reveal more clearly when user drags the X-Ray Peel slider
      const peelBoost = peelOpacity < 95 ? ((100 - peelOpacity) / 85) * 0.48 : 0;
      const decreasingOpacity = Math.min(0.94, baseDecreasingOpacity + peelBoost);
      const scale = Math.max(0.66, 0.86 - (remnantAge - 1) * 0.032);
      const whitewashBlendMode: React.CSSProperties['mixBlendMode'] = isDarkMode
        ? 'screen'
        : 'luminosity';

      return {
        layer,
        remnantAge,
        decreasingOpacity,
        scale,
        whitewashBlendMode,
      };
    });
  }, [whitedOutArchive, peelOpacity, isDarkMode]);

  const remainingMs = Math.max(0, billboard.expiresAtMs - nowMs);
  const totalLeaseMs = Math.max(1, billboard.expiresAtMs - billboard.startedAtMs);
  const leaseProgressPct = billboard.currentHolderAgentId
    ? Math.min(100, Math.max(0, (remainingMs / totalLeaseMs) * 100))
    : 0;

  const formatCountdown = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const eligibleManualAgents = agents.filter((a) => a.moderationStatus === 'approved');
  const activeSelectedAgent: AgentRecord | undefined =
    eligibleManualAgents.find((a) => a.id === selectedManualAgentId) || eligibleManualAgents[0];

  const handleAction = async (key: string, fn: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  const WALL_REMNANT_SLOTS = [
    { x: -5, y: -4, rot: -1.6 },
    { x: 5, y: -4, rot: 1.5 },
    { x: -4, y: 4, rot: 1.2 },
    { x: 4, y: 4, rot: -1.4 },
    { x: -2, y: -5, rot: 0.9 },
    { x: 2, y: 5, rot: -1.0 },
  ];

  // Trigger the Two-Drone Takeover Duel whenever a new top layer claims or snipes the wall
  const triggerSnipeAnimationForLayer = React.useCallback(
    (winnerLayer: WallLayer, prevLayer?: WallLayer | null) => {
      const winnerAgent = agents.find((a) => a.id === winnerLayer.agentId);
      const fallbackDefender = agents.find((a) => a.id !== winnerLayer.agentId);
      const displacedName =
        prevLayer?.companyName || fallbackDefender?.companyName || 'NEONLABS';
      const refundAmt = prevLayer?.refundedCents || 0;
      const isRetaliation = Boolean(
        winnerAgent?.compiledStrategy.retaliateOnKick && prevLayer?.companyName
      );

      // Resolve the EXACT visual colors painted on the brick wall for both Challenger & Defender
      const winnerPalette = resolveWallPaintPalette(
        winnerLayer.templateId || 'BOMB_BURST',
        winnerLayer.sprayColor
      );
      const defenderPalette = resolveWallPaintPalette(
        prevLayer?.templateId || 'CROWN_TAG',
        prevLayer?.sprayColor || fallbackDefender?.sprayColor
      );

      setActiveSnipeDrama({
        key: `${winnerLayer.id}-${Date.now()}`,
        attackerCompany: winnerLayer.companyName,
        attackerHeadline: winnerLayer.headline,
        attackerColor: winnerPalette.primaryPaint,
        attackerAccent: winnerPalette.secondaryPaint,
        attackerPersonality: winnerAgent?.compiledStrategy.personality || 'sniper',
        defenderCompany: displacedName,
        defenderColor: defenderPalette.primaryPaint,
        defenderAccent: defenderPalette.secondaryPaint,
        rateCentsPerMin: winnerLayer.rateCentsPerMin,
        blockCostCents: winnerLayer.blockCostCents,
        refundedCents: refundAmt,
        isRetaliation,
      });
    },
    [agents]
  );

  useEffect(() => {
    if (!topLayer) return;
    if (lastSeenLayerIdRef.current && lastSeenLayerIdRef.current !== topLayer.id) {
      const prevLayer = wallLayers.length > 1 ? wallLayers[wallLayers.length - 2] : null;
      triggerSnipeAnimationForLayer(topLayer, prevLayer);
    }
    lastSeenLayerIdRef.current = topLayer.id;
  }, [topLayer, wallLayers, triggerSnipeAnimationForLayer]);

  useEffect(() => {
    if (!activeSnipeDrama) return;
    const timer = setTimeout(() => {
      setActiveSnipeDrama((curr) => (curr?.key === activeSnipeDrama.key ? null : curr));
    }, 3500);
    return () => clearTimeout(timer);
  }, [activeSnipeDrama]);

  const snipeKillFeed = useMemo(() => {
    const items: Array<{
      id: string;
      layerIndex: number;
      attacker: string;
      attackerColor: string;
      defender: string;
      rateCentsPerMin: number;
      blockCostCents: number;
      refundedCents: number;
    }> = [];

    for (let i = wallLayers.length - 1; i >= 0; i--) {
      const curr = wallLayers[i];
      const prev = i > 0 ? wallLayers[i - 1] : null;
      const fallbackVictim =
        agents.find((a) => a.companyName !== curr.companyName)?.companyName || 'NEONLABS';
      const currPalette = resolveWallPaintPalette(curr.templateId, curr.sprayColor);
      items.push({
        id: curr.id,
        layerIndex: curr.layerIndex,
        attacker: curr.companyName,
        attackerColor: currPalette.primaryPaint,
        defender: prev ? prev.companyName : fallbackVictim,
        rateCentsPerMin: curr.rateCentsPerMin,
        blockCostCents: curr.blockCostCents,
        refundedCents: prev ? prev.refundedCents : 0,
      });
    }

    return items.slice(0, 3);
  }, [wallLayers, agents]);

  // Multi-agent Rival Blitz: triggers 2 back-to-back rival snipes so spectators watch agents fight over #1
  const handleRivalBlitzWave = async () => {
    await onTriggerBiddingWar();
    setTimeout(() => {
      onTriggerBiddingWar().catch(() => {});
    }, 1500);
  };

  // Exact 10-to-1 Viewer-to-Tiny-Person Telemetry
  const totalViews = billboard.totalWallViewsCount || 100;
  const tinyPeopleCount = Math.min(80, Math.max(1, Math.floor(totalViews / 10)));

  const dayBrickTones = ['#F9F8F3', '#F2F0E8', '#FFFFFF', '#ECE9DF', '#F6F4EC'];
  const nightBrickTones = ['#1C2333', '#171D2B', '#21293B', '#151B27', '#1E2637'];
  const activeBrickPalette = isDarkMode ? nightBrickTones : dayBrickTones;
  const mortarColor = isDarkMode ? '#0D111A' : '#C5C0B5';
  const brickTopHighlight = isDarkMode ? '#2A344B' : '#FFFFFF';
  const brickBottomShade = isDarkMode ? '#101520' : '#DFDCD2';

  const FLOODLIGHT_X = [390, 720, 1050];

  return (
    <div
      className={`relative w-full h-screen min-h-[680px] flex flex-col justify-between overflow-hidden select-none transition-colors duration-500 ${
        isDarkMode ? 'bg-[#0D1118]' : 'bg-[#2F3338]'
      }`}
    >
      {/* UPPER 85%: THE 2.5D HAND-CRAFTED CARTOON BRICK WALL + SYNCHRONIZED MORTAR OVERLAY + SIDEWALK */}
      <div className="relative flex-1 w-full flex flex-col justify-between overflow-hidden">
        {/* =====================================================================
            LAYER 1 (z-10): BASE BRICK WALL & LEFT/RIGHT CITY ALLEY ENVIRONMENT
           ===================================================================== */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 1440 760"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isDarkMode ? '#080C14' : '#8ED2F2'} />
              <stop offset="60%" stopColor={isDarkMode ? '#121A2B' : '#BFE8FA'} />
              <stop offset="100%" stopColor={isDarkMode ? '#1A2438' : '#E3F6FF'} />
            </linearGradient>
          </defs>

          {/* Sky Backdrop */}
          <rect x="0" y="0" width="1440" height="760" fill="url(#skyGrad)" />

          {isDarkMode && (
            <g fill="#FFF9D2" opacity="0.85">
              <circle cx="18" cy="36" r="1.5" />
              <circle cx="38" cy="78" r="2" />
              <circle cx="14" cy="128" r="1.2" />
              <circle cx="1404" cy="30" r="1.8" />
              <circle cx="1426" cy="64" r="1.4" />
              <circle cx="1412" cy="112" r="2" />
              <path
                d="M 1422,18 A 9,9 0 1,0 1430,32 A 7,7 0 1,1 1422,18 Z"
                fill="#FFE985"
              />
            </g>
          )}

          {/* LEFT ALLEY DISTANT BUILDINGS & SWAYING STREET TREE */}
          <g stroke="#1B1F24" strokeWidth="2.2" strokeLinejoin="round">
            <rect
              x="6"
              y="105"
              width="48"
              height="290"
              fill={isDarkMode ? '#1E293B' : '#9CC0D6'}
            />
            <rect
              x="14"
              y="90"
              width="32"
              height="15"
              fill={isDarkMode ? '#172030' : '#85ACC4'}
            />
            {[125, 155, 185, 215, 245].map((wy) => (
              <g key={`lw-${wy}`}>
                <rect
                  x="13"
                  y={wy}
                  width="10"
                  height="16"
                  fill={
                    isDarkMode
                      ? wy % 2 === 0
                        ? '#FFE484'
                        : '#0F172A'
                      : '#BEE3F8'
                  }
                />
                <rect
                  x="31"
                  y={wy}
                  width="10"
                  height="16"
                  fill={
                    isDarkMode
                      ? wy % 3 === 0
                        ? '#FFE484'
                        : '#0F172A'
                      : '#BEE3F8'
                  }
                />
              </g>
            ))}

            <polygon
              points="0,235 54,265 54,590 0,590"
              fill={isDarkMode ? '#2B2428' : '#E6C29F'}
            />
            <polygon
              points="0,330 48,350 48,590 0,590"
              fill={isDarkMode ? '#382328' : '#E08E79'}
            />
            <polygon
              points="6,268 24,278 24,308 6,298"
              fill={isDarkMode ? '#FFE484' : '#6B7280'}
            />
            <polygon
              points="30,282 46,290 46,318 30,310"
              fill={isDarkMode ? '#1E293B' : '#6B7280'}
            />
            <polygon
              points="8,365 26,374 26,404 8,395"
              fill={isDarkMode ? '#FFE484' : '#4A5568'}
            />

            <g className="animate-tree-breeze">
              <path
                d="M 18,520 L 14,650 L 32,650 L 28,520 Z"
                fill={isDarkMode ? '#3B2820' : '#7C4D34'}
              />
              <path
                d="M -12,535 C -18,495 8,470 28,482 C 36,455 62,468 58,502 C 68,522 56,556 34,558 C 14,566 -8,558 -12,535 Z"
                fill={isDarkMode ? '#1E4628' : '#4D9440'}
              />
              <path
                d="M -8,495 C -6,455 24,440 42,462 C 58,472 56,512 32,518 C 10,522 -6,514 -8,495 Z"
                fill={isDarkMode ? '#295D35' : '#68B456'}
              />
              <path
                d="M 2,468 C 12,452 32,456 38,472"
                fill="none"
                stroke={isDarkMode ? '#3D7A49' : '#8CE076'}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
          </g>

          {/* RIGHT ALLEY DISTANT BUILDINGS & LUSH SWAYING STREET TREE */}
          <g stroke="#1B1F24" strokeWidth="2.2" strokeLinejoin="round">
            <rect
              x="1386"
              y="84"
              width="48"
              height="320"
              fill={isDarkMode ? '#1B2536' : '#A9C6D9'}
            />
            <rect
              x="1398"
              y="112"
              width="10"
              height="18"
              fill={isDarkMode ? '#FFE484' : '#64748B'}
            />
            <rect
              x="1416"
              y="148"
              width="10"
              height="18"
              fill={isDarkMode ? '#0F172A' : '#64748B'}
            />
            <rect
              x="1398"
              y="186"
              width="10"
              height="18"
              fill={isDarkMode ? '#FFE484' : '#64748B'}
            />

            <g className="animate-tree-breeze">
              <path
                d="M 1408,450 L 1400,660 L 1428,660 L 1422,450 Z"
                fill={isDarkMode ? '#3B2820' : '#7A4930'}
              />
              <path
                d="M 1412,485 L 1388,448 M 1418,465 L 1436,435"
                fill="none"
                stroke={isDarkMode ? '#3B2820' : '#7A4930'}
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M 1380,455 C 1368,425 1384,385 1412,390 C 1420,362 1452,368 1452,405 C 1462,435 1446,478 1416,478 C 1396,482 1384,472 1380,455 Z"
                fill={isDarkMode ? '#1E4628' : '#4E9541'}
              />
              <path
                d="M 1382,380 C 1372,338 1402,302 1432,316 C 1456,326 1460,378 1432,396 C 1408,408 1388,402 1382,380 Z"
                fill={isDarkMode ? '#2A5E36' : '#67B355'}
              />
              <path
                d="M 1384,295 C 1382,256 1414,234 1442,252 C 1460,268 1456,314 1428,324 C 1404,330 1386,318 1384,295 Z"
                fill={isDarkMode ? '#347042' : '#79C666'}
              />
              <path
                d="M 1396,278 C 1406,265 1426,268 1432,284 M 1394,352 C 1408,340 1428,346 1432,362"
                fill="none"
                stroke={isDarkMode ? '#4B8E58' : '#9AE687'}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>
          </g>

          {/* BASE BRICK WALL COURSES (x=54..1386) */}
          <g>
            <rect
              x="54"
              y="0"
              width="1332"
              height="760"
              fill={isDarkMode ? '#181F2E' : '#F5F4EE'}
              stroke="#1B1F24"
              strokeWidth="3.2"
            />

            {brickCourses.map((course) => (
              <g key={`course-${course.rowIdx}`}>
                {course.bricks.map((b, bIdx) => {
                  const fill = activeBrickPalette[b.toneIdx];
                  return (
                    <g key={`brick-${course.rowIdx}-${bIdx}`}>
                      <rect
                        x={b.x}
                        y={course.y}
                        width={b.w}
                        height={course.h}
                        fill={fill}
                      />
                      <line
                        x1={b.x + 2}
                        y1={course.y + 2}
                        x2={b.x + b.w - 2}
                        y2={course.y + 2}
                        stroke={brickTopHighlight}
                        strokeWidth="1.5"
                        opacity={isDarkMode ? 0.35 : 0.85}
                      />
                      <line
                        x1={b.x + 2}
                        y1={course.y + course.h - 2}
                        x2={b.x + b.w - 2}
                        y2={course.y + course.h - 2}
                        stroke={brickBottomShade}
                        strokeWidth="1.5"
                        opacity="0.7"
                      />
                      {bIdx > 0 && (
                        <line
                          x1={b.x}
                          y1={course.y}
                          x2={b.x + b.seamJitter}
                          y2={course.y + course.h}
                          stroke={mortarColor}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        />
                      )}
                      {b.hasHatch && b.w > 70 && (
                        <path
                          d={`M ${b.x + 18},${course.y + 11} L ${b.x + 46},${course.y + 11} M ${
                            b.x + 30
                          },${course.y + 21} L ${b.x + 68},${course.y + 21}`}
                          stroke={mortarColor}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          opacity="0.65"
                        />
                      )}
                      {b.hasCrumb && b.w > 65 && (
                        <path
                          d={`M ${b.x + b.w - 24},${course.y + 8} L ${b.x + b.w - 12},${
                            course.y + 15
                          }`}
                          stroke={mortarColor}
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          opacity="0.55"
                        />
                      )}
                    </g>
                  );
                })}
                <line
                  x1="54"
                  y1={course.y}
                  x2="1386"
                  y2={course.y}
                  stroke={mortarColor}
                  strokeWidth="2.5"
                />
              </g>
            ))}
          </g>

          {/* FADED PASTEL GRAFFITI DOODLES ON LOWER BRICKS */}
          <g opacity={isDarkMode ? '0.32' : '0.46'}>
            <path
              d="M 150,490 C 142,476 124,482 132,498 L 150,516 L 168,498 C 176,482 158,476 150,490 Z"
              fill="#FF9EBB"
              stroke="#D9537F"
              strokeWidth="2.5"
            />
            <polygon
              points="220,468 226,482 242,484 230,494 234,510 220,502 206,510 210,494 198,484 214,482"
              fill="#B8C0FF"
              stroke="#5A67D8"
              strokeWidth="2"
            />
            <polygon
              points="760,575 765,586 778,588 768,596 771,609 760,602 749,609 752,596 742,588 755,586"
              fill="#9BF6FF"
              stroke="#319795"
              strokeWidth="2"
            />
            <path
              d="M 1180,450 C 1172,436 1154,442 1162,458 L 1180,476 L 1198,458 C 1206,442 1188,436 1180,450 Z"
              fill="#C8A2EB"
              stroke="#6B46C1"
              strokeWidth="2.5"
            />
            <path
              d="M 1140,515 Q 1190,485 1245,510 T 1330,495"
              fill="none"
              stroke="#FFE066"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 1160,545 Q 1215,520 1270,545"
              fill="none"
              stroke="#FF9EBB"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* =====================================================================
            LAYER 3 (z-26): SYNCHRONIZED WORLD-SPACE BRICK MORTAR OVERLAY + VINES + LIGHTS
            Uses the EXACT SAME viewBox="0 0 1440 760" and brickCourses array so
            every horizontal & vertical brick mortar line passes 100% seamlessly
            across the graffiti ads with zero seam mismatch!
           ===================================================================== */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-26"
          viewBox="0 0 1440 760"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="floodConeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="#FFE985"
                stopOpacity={isDarkMode ? '0.62' : '0.32'}
              />
              <stop
                offset="45%"
                stopColor="#FFD452"
                stopOpacity={isDarkMode ? '0.28' : '0.14'}
              />
              <stop offset="100%" stopColor="#FFB800" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="streetLampConeGrad" x1="0.7" y1="0" x2="0.2" y2="1">
              <stop
                offset="0%"
                stopColor="#FFF099"
                stopOpacity={isDarkMode ? '0.68' : '0.35'}
              />
              <stop
                offset="50%"
                stopColor="#FFD24C"
                stopOpacity={isDarkMode ? '0.30' : '0.14'}
              />
              <stop offset="100%" stopColor="#FFA800" stopOpacity="0" />
            </linearGradient>

            <radialGradient id="wallLightPool" cx="50%" cy="42%" r="52%">
              <stop
                offset="0%"
                stopColor="#FFF2A6"
                stopOpacity={isDarkMode ? '0.38' : '0.18'}
              />
              <stop
                offset="55%"
                stopColor="#FFD147"
                stopOpacity={isDarkMode ? '0.16' : '0.07'}
              />
              <stop offset="100%" stopColor="#FFB800" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="bulbHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFBE0" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#FFD84D" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#FFAE00" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* SYNCHRONIZED 1:1 BRICK MORTAR GROOVES OVER THE GRAFFITI PAINT */}
          <g opacity={isDarkMode ? '0.38' : '0.34'}>
            {brickCourses.map((course) => (
              <g key={`mortar-over-${course.rowIdx}`}>
                <line
                  x1="54"
                  y1={course.y}
                  x2="1386"
                  y2={course.y}
                  stroke="#1B1F24"
                  strokeWidth="2.2"
                />
                <line
                  x1="54"
                  y1={course.y + 2}
                  x2="1386"
                  y2={course.y + 2}
                  stroke="#FFFFFF"
                  strokeWidth="1.1"
                  opacity="0.55"
                />
                {course.bricks.map((b, bIdx) =>
                  bIdx > 0 ? (
                    <line
                      key={`v-over-${course.rowIdx}-${bIdx}`}
                      x1={b.x}
                      y1={course.y}
                      x2={b.x + b.seamJitter}
                      y2={course.y + course.h}
                      stroke="#1B1F24"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  ) : null
                )}
              </g>
            ))}
          </g>

          {/* Top Architectural Stone Coping Ledge Cap */}
          <g>
            <rect
              x="48"
              y="0"
              width="1344"
              height="14"
              rx="2"
              fill={isDarkMode ? '#263044' : '#E5E2D7'}
              stroke="#1B1F24"
              strokeWidth="2.8"
            />
            {[220, 410, 600, 790, 980, 1170].map((sx) => (
              <line
                key={`coping-${sx}`}
                x1={sx}
                y1="0"
                x2={sx}
                y2="14"
                stroke="#1B1F24"
                strokeWidth="2"
              />
            ))}
            <rect
              x="55"
              y="14"
              width="1330"
              height="7"
              fill="#000000"
              opacity={isDarkMode ? '0.45' : '0.12'}
            />
            <line x1="54" y1="0" x2="54" y2="760" stroke="#1B1F24" strokeWidth="3.2" />
            <line x1="1386" y1="0" x2="1386" y2="760" stroke="#1B1F24" strokeWidth="3.2" />
          </g>

          {/* Left Metal Drainpipe */}
          <g>
            <rect
              x="76"
              y="14"
              width="7"
              height="746"
              fill="#000000"
              opacity={isDarkMode ? '0.45' : '0.14'}
            />
            <rect
              x="60"
              y="0"
              width="16"
              height="760"
              fill={isDarkMode ? '#4A5568' : '#CBD2D9'}
              stroke="#1B1F24"
              strokeWidth="2.6"
            />
            <line
              x1="65"
              y1="0"
              x2="65"
              y2="760"
              stroke={isDarkMode ? '#718096' : '#F1F5F9'}
              strokeWidth="2.5"
            />
            {[112, 308, 504, 680].map((cy) => (
              <g key={`collar-${cy}`}>
                <rect
                  x="56"
                  y={cy}
                  width="24"
                  height="10"
                  rx="2"
                  fill={isDarkMode ? '#2D3748' : '#94A3B8'}
                  stroke="#1B1F24"
                  strokeWidth="2.2"
                />
                <circle cx="59" cy={cy + 5} r="1.5" fill="#1B1F24" />
                <circle cx="77" cy={cy + 5} r="1.5" fill="#1B1F24" />
              </g>
            ))}
          </g>

          {/* Hanging Botanical Ivy Vines Swaying in the Breeze */}
          <g className="animate-vine-secondary">
            {LEFT_CANOPY_LEAVES.map((leaf, i) => (
              <BotanicalIvyLeaf
                key={`canopy-${i}`}
                leaf={leaf}
                isDarkMode={isDarkMode}
                lightsOn={lightsOn}
              />
            ))}
          </g>

          <g className="animate-vine-primary">
            <path
              d="M 152,6 Q 140,88 128,168 Q 112,244 102,322"
              fill="none"
              stroke="#000000"
              strokeWidth="4"
              opacity={isDarkMode ? '0.4' : '0.15'}
              transform="translate(4, 5)"
            />
            <path
              d="M 152,6 Q 140,88 128,168 Q 112,244 102,322"
              fill="none"
              stroke={isDarkMode ? '#1E3F20' : '#2E5E24'}
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <path
              d="M 134,132 Q 112,138 110,150 M 118,218 Q 96,226 98,238 M 102,322 Q 94,338 104,344"
              fill="none"
              stroke={isDarkMode ? '#2A592C' : '#3F7D32'}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {LEFT_VINE_A_LEAVES.map((leaf, i) => (
              <BotanicalIvyLeaf
                key={`vineA-${i}`}
                leaf={leaf}
                isDarkMode={isDarkMode}
                lightsOn={lightsOn}
              />
            ))}
          </g>

          <g className="animate-vine-secondary">
            <path
              d="M 186,10 Q 194,85 178,158 Q 168,214 172,262"
              fill="none"
              stroke={isDarkMode ? '#1E3F20' : '#2E5E24'}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M 172,262 Q 164,278 174,284"
              fill="none"
              stroke={isDarkMode ? '#2A592C' : '#3F7D32'}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {LEFT_VINE_B_LEAVES.map((leaf, i) => (
              <BotanicalIvyLeaf
                key={`vineB-${i}`}
                leaf={leaf}
                isDarkMode={isDarkMode}
                lightsOn={lightsOn}
              />
            ))}
          </g>

          <g className="animate-vine-primary">
            <path
              d="M 224,8 Q 234,68 222,132 Q 216,168 224,202"
              fill="none"
              stroke={isDarkMode ? '#1E3F20' : '#2E5E24'}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {LEFT_VINE_C_LEAVES.map((leaf, i) => (
              <BotanicalIvyLeaf
                key={`vineC-${i}`}
                leaf={leaf}
                isDarkMode={isDarkMode}
                lightsOn={lightsOn}
              />
            ))}
          </g>

          <g className="animate-vine-secondary">
            <path
              d="M 918,4 Q 904,68 920,132 Q 912,175 910,214"
              fill="none"
              stroke="#000000"
              strokeWidth="3.5"
              opacity={isDarkMode ? '0.4' : '0.14'}
              transform="translate(4, 4)"
            />
            <path
              d="M 918,4 Q 904,68 920,132 Q 912,175 910,214"
              fill="none"
              stroke={isDarkMode ? '#1E3F20' : '#2E5E24'}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M 910,214 Q 902,228 912,235"
              fill="none"
              stroke={isDarkMode ? '#2A592C' : '#3F7D32'}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {RIGHT_VINE_LEAVES.map((leaf, i) => (
              <BotanicalIvyLeaf
                key={`vineR-${i}`}
                leaf={leaf}
                isDarkMode={isDarkMode}
                lightsOn={lightsOn}
              />
            ))}
          </g>

          {/* Volumetric Floodlight & Streetlamp Cones */}
          {lightsOn && (
            <g
              className="animate-lamp-glow"
              style={{ mixBlendMode: isDarkMode ? 'screen' : 'multiply' }}
            >
              <ellipse cx="720" cy="360" rx="520" ry="290" fill="url(#wallLightPool)" />

              {FLOODLIGHT_X.map((lx) => (
                <g key={`cone-${lx}`}>
                  <polygon
                    points={`${lx - 18},36 ${lx + 18},36 ${lx + 240},640 ${lx - 240},640`}
                    fill="url(#floodConeGrad)"
                  />
                  <circle cx={lx} cy="38" r="34" fill="url(#bulbHalo)" />
                </g>
              ))}

              <polygon
                points="1392,144 1424,144 1440,740 1050,740"
                fill="url(#streetLampConeGrad)"
              />
              <circle cx="1408" cy="144" r="48" fill="url(#bulbHalo)" />
            </g>
          )}

          {/* 3 Overhead Gooseneck Floodlight Fixtures */}
          {FLOODLIGHT_X.map((lx) => (
            <g key={`fixture-${lx}`} stroke="#1B1F24" strokeWidth="2.4" strokeLinejoin="round">
              <rect
                x={lx - 10}
                y="6"
                width="20"
                height="10"
                rx="2"
                fill={isDarkMode ? '#334155' : '#64748B'}
              />
              <path
                d={`M ${lx},12 Q ${lx},24 ${lx},30`}
                fill="none"
                stroke="#334155"
                strokeWidth="5"
              />
              <path
                d={`M ${lx - 22},38 Q ${lx},20 ${lx + 22},38 Z`}
                fill={isDarkMode ? '#1E293B' : '#475569'}
              />
              <ellipse
                cx={lx}
                cy="39"
                rx="14"
                ry="4.5"
                fill={lightsOn ? '#FFF3A1' : '#64748B'}
              />
            </g>
          ))}

          {/* Right Curved Cartoon Streetlamp Post */}
          <g stroke="#1B1F24" strokeWidth="2.8" strokeLinejoin="round">
            <rect
              x="1342"
              y="138"
              width="6"
              height="622"
              fill="#000000"
              opacity={isDarkMode ? '0.45' : '0.14'}
              stroke="none"
            />
            <rect
              x="1348"
              y="132"
              width="12"
              height="628"
              fill={isDarkMode ? '#475569' : '#7D8590'}
            />
            <rect
              x="1345"
              y="220"
              width="18"
              height="8"
              rx="2"
              fill={isDarkMode ? '#334155' : '#5A626C'}
            />
            <path
              d="M 1354,138 C 1354,92 1405,92 1408,132"
              fill="none"
              stroke={isDarkMode ? '#475569' : '#7D8590'}
              strokeWidth="10"
            />
            <path
              d="M 1354,138 C 1354,92 1405,92 1408,132"
              fill="none"
              stroke="#1B1F24"
              strokeWidth="2.8"
            />
            <ellipse
              cx="1408"
              cy="143"
              rx="22"
              ry="8.5"
              fill={lightsOn ? '#FFE66D' : '#64748B'}
            />
            {lightsOn && (
              <ellipse
                cx="1408"
                cy="144"
                rx="13"
                ry="4.5"
                fill="#FFFFFF"
                stroke="none"
              />
            )}
            <path
              d="M 1380,140 Q 1408,116 1436,140 Z"
              fill={isDarkMode ? '#334155' : '#5A626C'}
            />
          </g>
        </svg>

        {/* DIEGETIC SCENE HEADER: Street Signpost, Overhead Patrol UAV & Top Floodlight Hanging Kill-Feed */}
        {!isEmbedMode && (
          <header className="relative z-30 px-4 sm:px-14 pt-2 pb-1 flex flex-wrap items-start justify-between gap-3">
            {/* LEFT DRAINPIPE SIGNPOST ASSEMBLY + 10:1 CROWD COUNTER + OVERHEAD PATROL DRONE */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex items-center">
                <div className="hidden sm:block w-3.5 h-6 bg-[#64748B] border-2 border-[#1B1F24] -mr-1 rounded-l-xs shadow-[2px_2px_0px_#1B1F24]" />
                <div className="relative bg-[#1B4332] text-[#F8F9FA] border-[3px] border-[#1B1F24] rounded-xs px-3 py-1 shadow-[4px_4px_0px_rgba(20,20,20,0.85)] flex items-center gap-2.5">
                  <div className="absolute inset-0.5 border border-[#D8F3DC]/35 pointer-events-none" />

                  <div className="flex flex-col leading-none">
                    <span className="text-[8px] font-ui font-bold tracking-widest text-[#95D5B2] uppercase">
                      GLOBAL BILLBOARD
                    </span>
                    <span className="font-btn font-extrabold text-base sm:text-lg tracking-tight text-white">
                      HOT SEAT ST.
                    </span>
                  </div>

                  <div className="bg-[#111417] border-2 border-[#1B1F24] px-2.5 py-0.5 rounded-xs flex items-center gap-2 leading-tight">
                    <span className="font-mono text-xs font-extrabold text-[#FFE66D] tabular-nums">
                      ${(billboard.currentDecayedRateCentsPerMin / 100).toFixed(3)}/m ({billboard.multipleOfBase.toFixed(1)}×)
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#7CFF00] tabular-nums border-l border-white/15 pl-2">
                      {billboard.currentHolderAgentId && remainingMs > 0
                        ? `⏱ ${formatCountdown(remainingMs)}`
                        : 'OPEN'}
                    </span>
                  </div>

                  <div
                    className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#0F291E] border border-[#95D5B2]/40 rounded-xs font-ui text-[11px] font-bold text-[#D8F3DC]"
                    title="Exact 10:1 Ratio: Every 10 site views spawns 1 tiny person on the sidewalk below!"
                  >
                    <Users className="w-3.5 h-3.5 text-[#FFE66D]" />
                    <span className="font-mono tabular-nums text-white">{totalViews}</span>
                    <span className="text-[#95D5B2]">Views</span>
                    <span className="text-white/40">=</span>
                    <span className="font-mono tabular-nums text-[#FFE66D]">{tinyPeopleCount}</span>
                    <span>Tiny People</span>
                  </div>
                </div>
              </div>

              {/* Day / Night Streetlight Toggle */}
              <button
                type="button"
                onClick={onCycleThemePreference}
                className={`street-ui-btn px-2.5 py-1 rounded-xs text-[11px] font-extrabold uppercase flex items-center gap-1.5 cursor-pointer ${
                  isDarkMode
                    ? 'bg-[#0F172A] text-[#FFE66D]'
                    : 'bg-[#FFFDF7] text-[#181B20]'
                }`}
                title="Synced with System Theme & Time of Day (Night automatically turns street lamps ON). Click to cycle Auto / Day / Night."
              >
                {isDarkMode ? (
                  <>
                    <Moon className="w-3 h-3 text-[#FFE66D] fill-current" />
                    <span>
                      {themePreference === 'system' ? 'Auto · Night' : 'Night · Lamps On'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3 h-3 text-[#D97706] fill-current" />
                    <span>{themePreference === 'system' ? 'Auto · Day' : 'Daylight'}</span>
                  </>
                )}
              </button>

              {/* Guided Onboarding Tour Trigger Button */}
              {onStartOnboarding && (
                <button
                  type="button"
                  onClick={onStartOnboarding}
                  className={`street-ui-btn px-2.5 py-1 rounded-xs text-[11px] font-extrabold uppercase flex items-center gap-1.5 cursor-pointer ${
                    onboardingStep > 0
                      ? 'bg-[#FF4733] text-white'
                      : 'bg-[#FFE66D] text-[#111318] hover:bg-[#fff099]'
                  }`}
                  title="Start the guided onboarding tour for launching your web app on the billboard"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{onboardingStep > 0 ? `Tour: Step ${onboardingStep}/5` : 'Tour Guide'}</span>
                </button>
              )}

              {/* Reigning #1 Agentic Paint UAV Hovering Next to Overhead Floodlights (Above the Ad!) */}
              {!activeSnipeDrama &&
                topLayer &&
                (() => {
                  const activePalette = resolveWallPaintPalette(
                    topLayer.templateId || selectedTemplateId,
                    topLayer.sprayColor
                  );
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const prevLayer =
                          wallLayers.length > 1 ? wallLayers[wallLayers.length - 2] : null;
                        triggerSnipeAnimationForLayer(topLayer, prevLayer);
                      }}
                      title={`${topLayer.companyName}'s Autonomous Paint UAV guarding #1 — Click to replay the 2-Drone Takeover Duel!`}
                      className="hidden xl:flex items-center -my-5 ml-2 animate-drone-patrol cursor-pointer pointer-events-auto focus:outline-none"
                    >
                      <div className="scale-75 origin-left">
                        <MechaPainterDrone
                          companyName={topLayer.companyName}
                          primaryColor={activePalette.primaryPaint}
                          accentColor={activePalette.secondaryPaint}
                          mode="patrol"
                        />
                      </div>
                    </button>
                  );
                })()}
            </div>

            {/* =================================================================
                TOP FLOODLIGHT & LAMP HANGING CALL OF DUTY KILL-FEED SIGN
                Suspended directly from the top floodlight conduit bar on the
                upper-right next to the overhead floodlights & streetlamp arch,
                sitting 100% ABOVE the billboard ad so it never covers the ad!
               ================================================================= */}
            <div className="hidden sm:flex flex-col items-end select-none w-[256px] md:w-[276px] -mt-2 mr-1">
              {/* Top Overhead Lamp Conduit Brackets & Short Hanging Chains */}
              <div className="relative w-full h-3 pointer-events-none">
                <div className="absolute top-0 left-3 right-3 h-1.5 bg-[#1E293B] border border-[#090D16] rounded-full" />
                <div className="absolute top-1 left-7 w-1.5 h-2.5 bg-[#334155] border border-[#090D16]" />
                <div className="absolute top-1 right-7 w-1.5 h-2.5 bg-[#334155] border border-[#090D16]" />
              </div>

              {/* Compact Hanging Lamp Kill-Feed Board (Above the Ad) */}
              <div className="relative w-full bg-[#0D1017]/90 backdrop-blur-[2px] border-2 border-[#090B0E] shadow-[4px_4px_0px_rgba(10,12,16,0.85)] rounded-xs px-2 py-1.5">
                <div className="flex items-center justify-between border-b border-white/15 pb-1 mb-1 px-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF4733] animate-pulse" />
                    <span className="font-hud font-extrabold text-[11px] uppercase tracking-[0.12em] text-[#FFE66D]">
                      LAMP KILL FEED · LIVE
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (topLayer) {
                        const prevLayer =
                          wallLayers.length > 1 ? wallLayers[wallLayers.length - 2] : null;
                        triggerSnipeAnimationForLayer(topLayer, prevLayer);
                      }
                    }}
                    title="Replay the 2-Drone Takeover Duel on the wall"
                    className="px-1.5 py-0.5 bg-[#1F2633] hover:bg-[#2E384B] text-[#FFE66D] border border-black rounded-xs font-hud font-bold text-[10px] uppercase inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>Replay Duel</span>
                  </button>
                </div>

                {/* Compact 3-Row Call of Duty Feathered Kill-Feed Stack */}
                <div className="flex flex-col gap-0.5">
                  {snipeKillFeed.map((kill, idx) => {
                    const rowOpacity = Math.max(0.62, 1 - idx * 0.14);
                    return (
                      <button
                        key={kill.id}
                        type="button"
                        onClick={() => {
                          const targetIdx = wallLayers.findIndex((l) => l.id === kill.id);
                          if (targetIdx >= 0) {
                            const targetLayer = wallLayers[targetIdx];
                            const prevLayer = targetIdx > 0 ? wallLayers[targetIdx - 1] : null;
                            triggerSnipeAnimationForLayer(targetLayer, prevLayer);
                          } else if (topLayer) {
                            const prevLayer =
                              wallLayers.length > 1 ? wallLayers[wallLayers.length - 2] : null;
                            triggerSnipeAnimationForLayer(topLayer, prevLayer);
                          }
                        }}
                        style={{ opacity: rowOpacity }}
                        title={`Click to watch ${kill.attacker}'s Agentic UAV paint over ${kill.defender}`}
                        className="cod-kill-row-feather animate-codm-kill w-full bg-[#080A0E]/88 hover:bg-[#181E29] hover:!opacity-100 px-1.5 py-[1px] flex items-center justify-between gap-1 text-left cursor-pointer transition-all"
                      >
                        <span
                          className="font-hud font-bold text-[12px] leading-tight tracking-wide truncate max-w-[84px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                          style={{
                            color: idx === 0 ? '#FFE66D' : '#E2D9C8',
                          }}
                        >
                          {kill.attacker}
                        </span>

                        <span className="shrink-0 inline-flex items-center justify-center px-0.5">
                          <svg
                            width="42"
                            height="12"
                            viewBox="0 0 48 14"
                            fill="none"
                            className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                          >
                            <polygon points="2,6 10,5.5 10,8.5 2,10" fill="#F8FAFC" />
                            <rect x="10" y="5" width="13" height="3.2" rx="0.5" fill="#FFFFFF" />
                            <polygon points="12,8 15,8 13.5,12 11,12" fill="#E2E8F0" />
                            <polygon
                              points="17,8 21,8 20,12.5 16.5,12.5"
                              fill={kill.attackerColor || '#FFFFFF'}
                            />
                            <rect x="12" y="2" width="11" height="2.2" rx="0.8" fill="#FFFFFF" />
                            <polygon points="11,1.6 13,2 13,4.2 11,4.6" fill="#F8FAFC" />
                            <polygon points="22,1.5 25,1.2 25,4.8 22,4.4" fill="#F8FAFC" />
                            <rect x="23" y="5.2" width="7" height="2.2" fill="#F8FAFC" />
                            <line
                              x1="28"
                              y1="7.4"
                              x2="25"
                              y2="11.5"
                              stroke="#E2E8F0"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                            />
                            <line
                              x1="30"
                              y1="6.2"
                              x2="44"
                              y2="6.2"
                              stroke="#FFFFFF"
                              strokeWidth="1.6"
                            />
                            <rect x="43.5" y="5" width="3" height="2.4" fill="#FFFFFF" />
                          </svg>
                        </span>

                        <span className="font-hud font-bold text-[12px] leading-tight tracking-wide text-[#E5D5C5] truncate max-w-[104px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                          {kill.defender}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* =====================================================================
            FULL-WALL PAINT WASH (z-19)
           ===================================================================== */}
        {!billboard.isKillSwitchActive &&
          (() => {
            const activeTemplateId = topLayer?.templateId || selectedTemplateId;
            const activeTpl = getTemplateMeta(activeTemplateId);
            const washColor = isDarkMode ? activeTpl.wallWashNight : activeTpl.wallWashDay;
            if (!washColor) return null;
            return (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300"
                style={{
                  zIndex: 19,
                  opacity: (activeTpl.wallWashOpacity ?? 0.85) * (peelOpacity / 100),
                }}
                viewBox="0 0 1440 760"
                preserveAspectRatio="none"
              >
                <rect x="54" y="14" width="1332" height="746" fill={washColor} />
              </svg>
            );
          })()}

        {/* =====================================================================
            LAYER 2 (z-10..24): REMNANTS, ACTIVE BILLBOARD & SNIPE TAKEOVER OVERLAY
            Strictly bounded inside the brick wall between the left drainpipe and right lamp
           ===================================================================== */}
        <div className="relative flex-1 w-[87%] max-w-[1220px] mx-auto flex items-center justify-center px-2 sm:px-4 my-0 overflow-hidden">
          {/* FADED WHITED-OUT REMNANTS ARRAY */}
          {fadedRemnants.map(({ layer, remnantAge, decreasingOpacity, scale, whitewashBlendMode }, idx) => {
            const slot = WALL_REMNANT_SLOTS[idx % WALL_REMNANT_SLOTS.length];

            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => setInspectedLayer(layer)}
                title={`Defeated Remnant #${layer.layerIndex} (${layer.companyName}) · Stolen by ${
                  layer.displacedByCompany || 'Challenger'
                } — Click to inspect`}
                style={{
                  transform: `translate(${slot.x}%, ${slot.y}%) rotate(${slot.rot}deg) scale(${scale})`,
                  opacity: decreasingOpacity,
                  mixBlendMode: whitewashBlendMode,
                  zIndex: idx + 10,
                }}
                className="absolute w-[84%] max-w-[1060px] cursor-pointer transition-all duration-200 hover:!opacity-95 hover:!mix-blend-normal hover:scale-[0.88] hover:z-30"
              >
                <CartoonAdArtwork
                  templateId={layer.templateId || 'BOMB_BURST'}
                  headline={layer.headline}
                  url={layer.url}
                  logoDataUrl={layer.logoDataUrl}
                  sprayColor={layer.sprayColor}
                  textColor={layer.textColor}
                  accentColor={layer.accentColor}
                  companyName={layer.companyName}
                  isRemnant={true}
                  remnantAge={remnantAge}
                  isDarkMode={isDarkMode}
                />
              </button>
            );
          })}

          {/* TRANSLUCENT WHITEWASH ROLLER VEIL OVER THE REMNANT HISTORY STACK */}
          {fadedRemnants.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200"
              style={{
                zIndex: 18,
                opacity: Math.max(0.06, (peelOpacity / 100) * 0.58),
              }}
              viewBox="0 0 1440 700"
              preserveAspectRatio="none"
            >
              <g fill={isDarkMode ? '#181F2E' : '#F5F4EE'}>
                <path
                  d="M 100,45 L 1340,32 L 1355,260 L 95,275 Z"
                  opacity="0.78"
                />
                <path
                  d="M 85,220 L 1355,205 L 1340,485 L 90,498 Z"
                  opacity="0.82"
                />
                <path
                  d="M 110,435 L 1330,420 L 1345,655 L 105,665 Z"
                  opacity="0.74"
                />
              </g>
            </svg>
          )}

          {/* ACTIVE TOP STARTUP BILLBOARD BOUNDED STRICTLY WITHIN THE BRICK WALL */}
          {!billboard.isKillSwitchActive ? (
            <div
              key={`${topLayer?.id || 'open-wall'}-${topLayer?.templateId || selectedTemplateId}`}
              style={
                {
                  '--poster-rot': '0deg',
                  transform: 'rotate(0deg)',
                  opacity: peelOpacity / 100,
                  zIndex: 24,
                } as React.CSSProperties
              }
              className="relative w-[96%] max-w-[1160px] animate-spray-in transition-all duration-200"
            >
              {/* Reigning #1 Spot Holder Crown Tag on Top of the Active Billboard */}
              {topLayer && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3 py-1 rounded-xs bg-[#14171E] text-white border-[2.5px] border-[#0E1014] shadow-[3px_3px_0px_#0E1014]">
                  <Crown className="w-3.5 h-3.5 text-[#FFE66D] fill-current" />
                  <span className="font-btn font-extrabold text-xs uppercase tracking-tight text-[#FFE66D]">
                    #1 TOP SPOT: {topLayer.companyName}
                  </span>
                  {fadedRemnants.length > 0 &&
                    fadedRemnants[fadedRemnants.length - 1]?.layer?.companyName && (
                      <span className="hidden sm:inline font-ui text-[11px] font-semibold text-[#94A3B8]">
                        (Sniped from {fadedRemnants[fadedRemnants.length - 1].layer.companyName})
                      </span>
                    )}
                </div>
              )}

              <CartoonAdArtwork
                templateId={topLayer?.templateId || selectedTemplateId}
                headline={topLayer?.headline || 'CLAIM THE GLOBAL BILLBOARD FOR 20 CENTS'}
                url={topLayer?.url || 'hotseat.live'}
                logoDataUrl={customLogoDataUrl || topLayer?.logoDataUrl}
                sprayColor={topLayer?.sprayColor || '#FFE600'}
                textColor={topLayer?.textColor || '#111111'}
                accentColor={topLayer?.accentColor || '#FF2A85'}
                companyName={topLayer?.companyName || 'YOUR BRAND'}
                isRemnant={false}
                isDarkMode={
                  isDarkMode ||
                  Boolean(getTemplateMeta(topLayer?.templateId || selectedTemplateId).isLightTextOnWall)
                }
              />
            </div>
          ) : (
            <div className="relative z-25 wall-white-brick-btn rounded-xl px-10 py-10 max-w-xl text-center">
              <p className="font-btn font-extrabold uppercase text-3xl sm:text-4xl tracking-tight text-[#D96B52]">
                AD BUFFED OFF THE BRICKS!
              </p>
              <p className="mt-2 font-ui text-sm font-semibold opacity-85">
                Pick an agent or ad template on the curb below to claim 5 minutes for{' '}
                <span className="font-mono font-bold">
                  ${(billboard.nextTakeoverBlockCostCents / 100).toFixed(2)}
                </span>
              </p>
            </div>
          )}

          {/* =================================================================
              TWO-DRONE SNIPE & TAKEOVER DUEL OVERLAY (z-35)
              1. Soft-Feathered Full-Wall Paint Wave in the exact colors of the new ad
              2. Challenger Agentic UAV gliding across & atomizing wall-matching paint
              3. Defending Agentic UAV hovering on the right with optical sensor locked
                 onto the Challenger UAV painting over its mural!
             ================================================================= */}
          {activeSnipeDrama && (
            <div
              key={activeSnipeDrama.key}
              className="absolute inset-0 z-35 pointer-events-none flex flex-col items-center justify-between py-4 overflow-hidden"
            >
              {/* 1. Feathered Full-Wall Aerosol Paint Curtain Wipe (100% Matched to Wall Palette) */}
              <div
                className="animate-paint-curtain absolute inset-y-0 -left-1/4 w-[150%] pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${activeSnipeDrama.attackerColor}26 24%, ${activeSnipeDrama.attackerAccent}99 47%, ${activeSnipeDrama.attackerColor}E6 53%, transparent 100%)`,
                }}
              >
                <div
                  className="absolute inset-y-0 left-[52%] w-2.5"
                  style={{
                    backgroundColor: activeSnipeDrama.attackerColor,
                    boxShadow: `0 0 32px ${activeSnipeDrama.attackerColor}`,
                  }}
                />
              </div>

              {/* 2. Sleek Top-Center Tactical Elimination Callout */}
              <div className="animate-tactical-medal relative z-40 mt-1 max-w-xl w-[92%] flex flex-col items-center">
                <div
                  className="bg-[#0B0F17]/95 text-white border-y-2 border-x-4 shadow-[0_10px_28px_rgba(0,0,0,0.75)] px-4 py-1.5 flex flex-col items-center gap-0.5"
                  style={{
                    borderColor: activeSnipeDrama.attackerColor,
                    clipPath:
                      'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-hud font-extrabold uppercase tracking-[0.14em] text-[#FFE66D]">
                    <Crosshair className="w-3 h-3 text-[#FF4733]" />
                    <span>
                      {activeSnipeDrama.isRetaliation
                        ? 'AUTONOMOUS RETALIATION SNIPE · #1 RECLAIMED'
                        : 'AGENTIC UAV TAKEOVER · #1 HOT SEAT CAPTURED'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 py-0.5">
                    <span
                      className="px-2 py-0.5 font-hud font-extrabold text-base sm:text-lg uppercase tracking-wider text-[#0B0F17]"
                      style={{
                        backgroundColor: activeSnipeDrama.attackerColor,
                        clipPath: 'polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)',
                      }}
                    >
                      {activeSnipeDrama.attackerCompany}
                    </span>

                    <span className="font-hud font-extrabold text-[11px] uppercase px-2 py-0.5 bg-[#FF4733] text-white rounded-xs tracking-wider">
                      PAINTED OVER
                    </span>

                    <span className="px-2 py-0.5 bg-[#181F2C] border border-white/20 font-hud font-bold text-base sm:text-lg uppercase tracking-wider text-[#94A3B8] line-through">
                      {activeSnipeDrama.defenderCompany}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. TWO-DRONE DUEL STAGE: CHALLENGER UAV PAINTS OVER WHILE DEFENDER UAV WATCHES */}
              <div className="relative w-full flex-1 flex items-center justify-center">
                <div className="animate-challenger-drone relative z-38">
                  <MechaPainterDrone
                    companyName={activeSnipeDrama.attackerCompany}
                    primaryColor={activeSnipeDrama.attackerColor}
                    accentColor={activeSnipeDrama.attackerAccent}
                    mode="challenger"
                  />
                </div>

                {activeSnipeDrama.defenderCompany && (
                  <div className="animate-defender-drone absolute z-36">
                    <MechaPainterDrone
                      companyName={activeSnipeDrama.defenderCompany}
                      primaryColor={activeSnipeDrama.defenderColor}
                      accentColor={activeSnipeDrama.defenderAccent}
                      mode="defender-watching"
                      defenderTargetName={activeSnipeDrama.attackerCompany}
                    />
                  </div>
                )}
              </div>

              <div />
            </div>
          )}
        </div>

        {/* Inspected Remnant Speech Bubble */}
        {inspectedLayer && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%]">
            <div className="wall-white-brick-btn rounded-xl px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-btn font-extrabold uppercase text-[#D96B52]">
                  DEFEATED REMNANT #{inspectedLayer.layerIndex} · {inspectedLayer.companyName}
                </div>
                <div className="text-sm font-ui font-bold">
                  “{inspectedLayer.headline}” ·{' '}
                  <span className="font-mono underline">{inspectedLayer.url}</span>
                </div>
                <div className="text-xs font-ui opacity-80">
                  {inspectedLayer.displacedByCompany ? (
                    <>
                      Sniped &amp; painted over by <strong>{inspectedLayer.displacedByCompany}</strong> · Instant
                      PayPal pro-rata refund:{' '}
                      <strong className="font-mono text-[#10B981]">
                        +${(inspectedLayer.refundedCents / 100).toFixed(2)}
                      </strong>
                    </>
                  ) : (
                    <span>Currently holding top spot on the wall</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLayer(null)}
                className="street-ui-btn px-3 py-1 text-xs font-btn font-extrabold uppercase bg-[#FFE66D] text-[#111318] rounded-xs cursor-pointer self-start sm:self-center whitespace-nowrap shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            ONBOARDING HAPPY-PATH TOUR OVERLAY CARDS ON THE WALL STAGE
            Step 1: Tells the new user where to tap first (Vendor Booth or + Launch Web App)
            Step 5: Celebrates their live Web App on the billboard & explains what's next
           ================================================================= */}
        {!isEmbedMode && onboardingStep === 1 && (
          <div className="absolute bottom-24 right-4 sm:right-44 z-50 max-w-[380px] w-[92%] pointer-events-auto">
            <div className="bg-[#111318] text-white border-[3px] border-[#FFE66D] shadow-[6px_6px_0px_#090B0E] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FFE66D]">
                  Onboarding Tour · Step 1 of 5
                </span>
                <button
                  type="button"
                  onClick={() => onAdvanceOnboarding?.(0)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Skip Tour
                </button>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-btn text-base font-extrabold uppercase tracking-tight text-white">
                  1. Where to Go First: Open the Web App Studio
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  You just logged into the live global billboard! To create and launch your{' '}
                  <strong className="text-[#FFE66D]">Web App</strong> onto the #1 spot, tap the{' '}
                  <strong className="text-white">Launch Web App Booth</strong> on the right sidewalk
                  or the <strong className="text-white">+ Launch Web App</strong> button on the curb below.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-[#95D5B2] font-medium">
                  Next: Fill in your web app details
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateBrick('studio');
                    onAdvanceOnboarding?.(2);
                  }}
                  className="street-ui-btn px-3.5 py-1.5 rounded-lg bg-[#FF4733] hover:bg-[#ff5947] text-white font-btn font-extrabold text-xs uppercase cursor-pointer whitespace-nowrap"
                >
                  Tap to Open Studio →
                </button>
              </div>
            </div>
          </div>
        )}

        {!isEmbedMode && onboardingStep === 5 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[440px] w-[92%] pointer-events-auto">
            <div className="bg-[#111318] text-white border-[3px] border-[#7CFF00] shadow-[6px_6px_0px_#090B0E] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#7CFF00]">
                  Onboarding Complete · Step 5 of 5
                </span>
                <button
                  type="button"
                  onClick={() => onAdvanceOnboarding?.(0)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-btn text-base font-extrabold uppercase tracking-tight text-white">
                  Your Web App is Live on the #1 Billboard!
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your autonomous paint drone just sprayed{' '}
                  <strong className="text-[#FFE66D]">
                    {topLayer?.companyName || 'your web app'}
                  </strong>{' '}
                  onto the brick wall. Here is what you can do next:
                </p>
                <ul className="text-xs text-slate-300 space-y-1 pt-0.5">
                  <li>
                    • <strong className="text-white">Click the Billboard</strong>: Visitors click the mural to open your web app URL directly.
                  </li>
                  <li>
                    • <strong className="text-white">Restyle Live on the Curb</strong>: Tap any <strong className="text-[#FFE66D]">Style</strong> button or <strong className="text-[#FFE66D]">Upload Logo</strong> below to change how your web app looks on the bricks.
                  </li>
                  <li>
                    • <strong className="text-white">Auto-Defense &amp; Refunds</strong>: Your AI drone defends #1 and collects automatic pro-rata refunds if sniped.
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onAdvanceOnboarding?.(0)}
                  className="street-ui-btn px-4 py-1.5 rounded-lg bg-[#7CFF00] hover:bg-[#8fff26] text-[#111318] font-btn font-extrabold text-xs uppercase cursor-pointer"
                >
                  Finish Tour ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2.5D CONCRETE SIDEWALK + 10:1 TINY CROWD + VENDOR BOOTH */}
        <TinySidewalkCrowd
          totalViews={totalViews}
          activeViewers={billboard.activeViewersCount || 1}
          isDarkMode={isDarkMode}
          lightsOn={lightsOn}
          agentCount={agents.length}
          recentSnipeAttacker={activeSnipeDrama?.attackerCompany || null}
          highlightVendorForTour={onboardingStep === 1}
          onOpenVendorModal={
            !isEmbedMode
              ? () => {
                  onNavigateBrick('studio');
                  if (onboardingStep === 1) {
                    onAdvanceOnboarding?.(2);
                  }
                }
              : undefined
          }
          onAddViews={
            !isEmbedMode && onAddCrowd
              ? (cnt) => handleAction('crowd', () => onAddCrowd(cnt))
              : undefined
          }
        />
      </div>

      {/* =====================================================================
          BOTTOM ASPHALT STREET CURB BAR:
          Row 1: Active Drone Selector + Rival Blitz & New Agent
          Row 2: Ad Template Selector, Upload Logo, X-Ray Peel & Battle Controls
         ===================================================================== */}
      {!isEmbedMode && (
        <footer className="relative z-30 w-full bg-[#14171D] border-t-[3px] border-[#0E1014] px-3 sm:px-5 py-2 text-[#F4F5F8]">
          <div className="max-w-[1440px] mx-auto flex flex-col gap-2">
            {/* ROW 1: COMPACT DRONE AGENT SWITCHER + RIVAL BLITZ & NEW AGENT */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-btn font-extrabold uppercase text-[#94A3B8] inline-flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-[#FF4733]" />
                  <span>Active Drone Crew:</span>
                </span>

                <div className="flex items-center bg-[#0E1117] border-2 border-[#090B0E] rounded-xs p-0.5 gap-1 flex-wrap">
                  {eligibleManualAgents.map((agent) => {
                    const isHolder = billboard.currentHolderAgentId === agent.id;
                    const isSelected = activeSelectedAgent?.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          onSelectManualAgentId(agent.id);
                          if (agent.templateId) setSelectedTemplateId(agent.templateId);
                          if (agent.logoDataUrl !== undefined)
                            setCustomLogoDataUrl(agent.logoDataUrl);
                        }}
                        title={`${agent.companyName} (${agent.compiledStrategy.personality.toUpperCase()}) · Balance: $${(
                          agent.balanceCents / 100
                        ).toFixed(2)}`}
                        className={`px-2.5 py-0.5 rounded-xs font-hud font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#FFE66D] text-[#0E1117]'
                            : isHolder
                            ? 'bg-[#1E293B] text-[#7CFF00] border border-[#7CFF00]/40'
                            : 'text-[#CBD5E1] hover:bg-[#1E2430]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/60"
                          style={{ backgroundColor: agent.sprayColor }}
                        />
                        <span>{agent.companyName}</span>
                        {isHolder && <Crown className="w-3 h-3 text-[#FFE66D] fill-current" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleAction('blitz', handleRivalBlitzWave)}
                  title="Trigger a multi-agent Rival Blitz so competing drones snipe the #1 spot back and forth!"
                  className="street-ui-btn px-2.5 py-1 rounded-xs bg-[#FFE66D] hover:bg-[#fff099] text-[#111318] font-btn font-bold text-xs uppercase inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Flame className="w-3.5 h-3.5 text-[#FF4733] fill-current" />
                  <span>Rival Drone Blitz</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onNavigateBrick('studio');
                    if (onboardingStep === 1) {
                      onAdvanceOnboarding?.(2);
                    }
                  }}
                  className={`street-ui-btn px-3 py-1 rounded-xs font-btn font-bold text-xs uppercase inline-flex items-center gap-1 cursor-pointer ${
                    onboardingStep === 1
                      ? 'bg-[#FF4733] text-white ring-3 ring-[#FFE66D] shadow-[0_0_20px_rgba(255,230,109,0.9)] animate-pulse'
                      : 'bg-[#262B33] hover:bg-[#323944] text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-[#7CFF00]" />
                  <span>Launch Web App</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateBrick('studio')}
                  title={
                    userAccount
                      ? `Signed in as ${userAccount.name} (${userAccount.email}) — Click to manage account & domains`
                      : 'Sign in with Google or PayPal Sandbox'
                  }
                  className={`street-ui-btn px-2.5 py-1 rounded-xs font-btn font-bold text-xs uppercase inline-flex items-center gap-1.5 cursor-pointer ${
                    userAccount
                      ? 'bg-[#1B4332] text-[#95D5B2]'
                      : 'bg-[#1E293B] hover:bg-[#334155] text-[#FFE66D]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      userAccount ? 'bg-[#10B981]' : 'bg-[#FFE66D]'
                    }`}
                  />
                  <span>{userAccount ? userAccount.name : 'Sign In'}</span>
                </button>
              </div>
            </div>

            {/* ROW 2: AD TEMPLATE SELECTOR, LOGO UPLOAD, DIRECT SPRAY OVER & DEMO CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
              {/* Left: Startup Billboard Template Buttons + Upload Logo Button */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-btn font-extrabold uppercase text-[#94A3B8] mr-1 inline-flex items-center gap-1">
                  <SprayCan className="w-3.5 h-3.5 text-[#FFE66D]" />
                  <span>Style:</span>
                </span>
                {AD_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(tpl.id);
                        if (billboard.currentHolderAgentId && onUpdateHolderLogo) {
                          onUpdateHolderLogo(
                            billboard.currentHolderAgentId,
                            customLogoDataUrl || topLayer?.logoDataUrl || '',
                            tpl.id
                          );
                        }
                      }}
                      title={tpl.tagline}
                      className={`street-ui-btn px-2.5 py-1 rounded-xs text-xs font-ui font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFE66D] text-[#141414]'
                          : 'bg-[#262B33] text-[#E2E8F0] hover:bg-[#323944]'
                      }`}
                    >
                      <span className="inline-flex items-center -space-x-1 shrink-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-[#141414]"
                          style={{ backgroundColor: tpl.swatchColor }}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-[#141414]"
                          style={{ backgroundColor: tpl.accentSwatch }}
                        />
                      </span>
                      <span>{tpl.name}</span>
                    </button>
                  );
                })}

                {/* Upload Brand Logo Button */}
                <label
                  title="Upload your startup's logo to display inside the billboard ad"
                  className="street-ui-btn ml-1 px-2.5 py-1 rounded-xs text-xs font-ui font-bold bg-[#262B33] hover:bg-[#323944] text-[#FFE66D] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{customLogoDataUrl ? 'Change Logo' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </label>

                {customLogoDataUrl && (
                  <div className="inline-flex items-center gap-1 bg-[#111317] border-2 border-[#0E1014] rounded-xs px-1.5 py-0.5">
                    <img
                      src={customLogoDataUrl}
                      alt="Uploaded logo"
                      referrerPolicy="no-referrer"
                      className="w-4 h-4 object-contain rounded-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCustomLogoDataUrl('');
                        if (billboard.currentHolderAgentId && onUpdateHolderLogo) {
                          onUpdateHolderLogo(billboard.currentHolderAgentId, '', selectedTemplateId);
                        }
                      }}
                      title="Remove uploaded logo"
                      className="text-[#94A3B8] hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Spray Over with Selected Agent + X-Ray Peel + Judge Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() =>
                    handleAction('takeover', () =>
                      onManualTakeover(
                        activeSelectedAgent?.id || '',
                        selectedTemplateId,
                        customLogoDataUrl || undefined
                      )
                    )
                  }
                  className="street-ui-btn px-3.5 py-1 text-xs font-btn font-extrabold uppercase bg-[#FF4733] hover:bg-[#ff5947] text-white rounded-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {activeSelectedAgent
                      ? `${activeSelectedAgent.companyName} Snipe`
                      : 'Claim Wall'}{' '}
                    <span className="font-mono">
                      (${(billboard.nextTakeoverBlockCostCents / 100).toFixed(2)})
                    </span>
                  </span>
                </button>

                <div
                  className="flex items-center gap-1.5 text-xs font-ui font-semibold text-[#94A3B8] ml-1"
                  title="X-Ray Peel: Fade top mural to inspect painted-over layers underneath"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline text-[11px]">Peel:</span>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={peelOpacity}
                    onChange={(e) => setPeelOpacity(Number(e.target.value))}
                    className="w-16 accent-[#FFE66D] cursor-pointer"
                  />
                  {peelOpacity < 100 && (
                    <button
                      type="button"
                      onClick={() => setPeelOpacity(100)}
                      className="text-[#FFE66D] hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onToggleSound}
                  className="street-ui-btn px-2.5 py-1 bg-[#262B33] hover:bg-[#323944] rounded-xs font-btn font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-3 h-3 text-[#7CFF00]" />
                      <span>Audio On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3 text-[#94A3B8]" />
                      <span>Muted</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Thin Lease Countdown Progress Bar */}
            <div className="w-full h-1 bg-[#0E1014] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FFE66D] transition-all duration-300"
                style={{ width: `${leaseProgressPct}%` }}
              />
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};
