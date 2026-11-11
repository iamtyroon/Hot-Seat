import React, { useMemo, useState } from 'react';
import { Users, Eye, Footprints, Plus } from 'lucide-react';

export type CrowdBehaviorMode = 'split' | 'all-walking' | 'all-admiring';

interface TinySidewalkCrowdProps {
  totalViews: number;
  activeViewers: number;
  isDarkMode: boolean;
  lightsOn: boolean;
  agentCount?: number;
  recentSnipeAttacker?: string | null;
  onOpenVendorModal?: () => void;
  onAddViews?: (count: number) => void;
  highlightVendorForTour?: boolean;
}

const HOODIE_COLORS = [
  '#E5A93C', // Warm Mustard
  '#3D7A8A', // Slate Teal
  '#D65A43', // Brick Coral
  '#5E8C5A', // Forest Sage
  '#8C6BA8', // Muted Plum
  '#3E5E88', // Denim Jacket
  '#D97B48', // Ochre Orange
  '#52705E', // Olive Parka
];

const SKIN_TONES = ['#F2C9AC', '#D99B72', '#8D5B3E', '#F7D7BE', '#B67852', '#643D28'];
const PANTS_COLORS = ['#3A506B', '#272C36', '#5E5042', '#3D4F58', '#333C4B'];
const HAIR_COLORS = ['#231C18', '#543824', '#8A5029', '#C98A4B', '#18181B'];

const REACTION_CALLOUTS = ['SNIPED!', 'NEW #1!', 'TOP SPOT STOLEN!', 'WHOA!', 'LOOK UP!'];

export const TinySidewalkCrowd: React.FC<TinySidewalkCrowdProps> = ({
  totalViews,
  isDarkMode,
  lightsOn,
  agentCount = 0,
  recentSnipeAttacker,
  onOpenVendorModal,
  onAddViews,
  highlightVendorForTour = false,
}) => {
  const [crowdMode, setCrowdMode] = useState<CrowdBehaviorMode>('split');

  // Strict 10-to-1 Viewer-to-Tiny-Person Ratio:
  // 100 viewers = 10 tiny people, 150 viewers = 15 tiny people, etc.
  const personCount = Math.min(80, Math.max(1, Math.floor(totalViews / 10)));

  const people = useMemo(() => {
    return Array.from({ length: personCount }).map((_, i) => {
      const seed = (i + 1) * 149;
      const hoodie = HOODIE_COLORS[seed % HOODIE_COLORS.length];
      const skin = SKIN_TONES[(seed >> 2) % SKIN_TONES.length];
      const pants = PANTS_COLORS[(seed >> 3) % PANTS_COLORS.length];
      const hair = HAIR_COLORS[(seed >> 4) % HAIR_COLORS.length];
      const hasBackpack = seed % 3 === 0;
      const hasCap = seed % 4 === 0;
      const hasBeanie = !hasCap && seed % 5 === 0;
      const hasDog = i === 2 || i === 13 || i === 27 || i === 44;

      const isStoppingSpectator =
        crowdMode === 'all-admiring'
          ? true
          : crowdMode === 'all-walking'
          ? false
          : i % 5 === 1 || i % 5 === 3; // In 'split' mode: 6 walking & 4 admiring per 10 people!

      const direction = seed % 2 === 0 ? 'right' : 'left';
      const depthLane = i % 3; // 0 = back near wall, 1 = mid sidewalk, 2 = front near curb
      const scale = depthLane === 0 ? 0.78 : depthLane === 1 ? 0.92 : 1.05;
      const bottomPx = depthLane === 0 ? 29 : depthLane === 1 ? 18 : 7;

      // Distribute stationary spectators cleanly across the sidewalk, avoiding the vendor booth on the right
      const slotSpread = Math.max(1, personCount);
      let staticLeftPct = 10 + ((i * (62 / slotSpread) + (seed % 7)) % 64);
      if (staticLeftPct > 72) {
        staticLeftPct = staticLeftPct - 18;
      }

      const walkDurationSec = 28 + (seed % 22);
      const walkDelaySec = -((seed * 9) % walkDurationSec);
      const bobDelaySec = -((seed % 10) * 0.08);
      const reactionText = REACTION_CALLOUTS[i % REACTION_CALLOUTS.length];

      return {
        id: i,
        personNumber: i + 1,
        viewsRepresented: `${i * 10 + 1}–${(i + 1) * 10}`,
        hoodie,
        skin,
        pants,
        hair,
        hasBackpack,
        hasCap,
        hasBeanie,
        hasDog,
        isStoppingSpectator,
        direction,
        depthLane,
        scale,
        bottomPx,
        staticLeftPct,
        walkDurationSec,
        walkDelaySec,
        bobDelaySec,
        reactionText,
      };
    });
  }, [personCount, crowdMode]);

  const walkingCount = people.filter((p) => !p.isStoppingSpectator).length;
  const admiringCount = people.filter((p) => p.isStoppingSpectator).length;

  const cycleCrowdMode = () => {
    setCrowdMode((prev) =>
      prev === 'split' ? 'all-admiring' : prev === 'all-admiring' ? 'all-walking' : 'split'
    );
  };

  const sidewalkBase = isDarkMode ? '#383E4C' : '#DCDAD2';
  const sidewalkTopHighlight = isDarkMode ? '#454C5C' : '#E8E6DF';
  const curbFace = isDarkMode ? '#282C37' : '#B5B3AA';
  const roadAsphalt = isDarkMode ? '#14171D' : '#3A3F45';
  const jointStroke = isDarkMode ? '#232730' : '#7C8087';

  return (
    <div className="relative w-full h-[88px] sm:h-[96px] select-none pointer-events-none overflow-x-clip overflow-y-visible z-30">
      {/* 2.5D Perspective Concrete Sidewalk & Curb */}
      <svg
        className="absolute inset-0 w-full h-full transition-colors duration-300 pointer-events-none"
        viewBox="0 0 1440 94"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="sidewalkLampPool" cx="82%" cy="45%" r="24%">
            <stop offset="0%" stopColor="#FFE066" stopOpacity={isDarkMode ? '0.52' : '0.22'} />
            <stop offset="100%" stopColor="#FFE066" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sidewalkCenterPool" cx="50%" cy="40%" r="38%">
            <stop offset="0%" stopColor="#FFF3B0" stopOpacity={isDarkMode ? '0.32' : '0.1'} />
            <stop offset="100%" stopColor="#FFF3B0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Concrete Baseboard / Plinth at the Bottom of the Brick Wall */}
        <rect
          x="52"
          y="0"
          width="1336"
          height="22"
          fill={isDarkMode ? '#2B3140' : '#D4D2C8'}
          stroke="#1C2026"
          strokeWidth="2.8"
        />
        {/* Weathering cracks & detail on baseboard */}
        <path
          d="M 280,0 L 276,12 L 282,22 M 690,4 L 694,22 M 1080,0 L 1075,14 L 1080,22"
          stroke="#1C2026"
          strokeWidth="1.5"
          opacity="0.45"
          fill="none"
        />

        {/* Sidewalk Main Plane */}
        <rect x="0" y="22" width="1440" height="50" fill={sidewalkBase} />
        <rect x="0" y="22" width="1440" height="6" fill={sidewalkTopHighlight} />

        {/* Illuminated light pools cast onto the sidewalk when lights are on */}
        {lightsOn && (
          <>
            <rect x="0" y="22" width="1440" height="50" fill="url(#sidewalkLampPool)" />
            <rect x="0" y="22" width="1440" height="50" fill="url(#sidewalkCenterPool)" />
          </>
        )}

        {/* 2.5D Angled Sidewalk Slab Joints */}
        {Array.from({ length: 17 }).map((_, idx) => {
          const topX = idx * 92 + 24;
          const botX = idx * 92 - 18;
          return (
            <line
              key={idx}
              x1={topX}
              y1="22"
              x2={botX}
              y2="72"
              stroke={jointStroke}
              strokeWidth="2.2"
            />
          );
        })}

        {/* Raised Concrete Curb Lip */}
        <line x1="0" y1="22" x2="1440" y2="22" stroke="#1C2026" strokeWidth="2.8" />
        <line x1="0" y1="72" x2="1440" y2="72" stroke="#1C2026" strokeWidth="2.8" />
        <rect x="0" y="72" width="1440" height="11" fill={curbFace} />
        <line x1="0" y1="83" x2="1440" y2="83" stroke="#1C2026" strokeWidth="2.8" />

        {/* Asphalt Street Edge */}
        <rect x="0" y="83" width="1440" height="11" fill={roadAsphalt} />
      </svg>

      {/* =====================================================================
          INTERACTIVE SIDEWALK VENDOR STAND & VENDOR CHARACTER (RIGHT CURB)
          Clicking the vendor stand opens the Agent Studio & PayPal Vault Modal!
         ===================================================================== */}
      {onOpenVendorModal && (
        <button
          type="button"
          onClick={onOpenVendorModal}
          title="Click the Street Vendor Stand to launch your Web App on the billboard"
          style={{
            right: '3.5%',
            bottom: '10px',
            zIndex: highlightVendorForTour ? 55 : 28,
          }}
          className={`group absolute pointer-events-auto cursor-pointer focus:outline-none transition-transform duration-200 hover:-translate-y-1.5 hover:scale-[1.04] ${
            highlightVendorForTour
              ? 'ring-4 ring-[#FFE66D] rounded-xl p-1 bg-[#FFE66D]/15 shadow-[0_0_36px_rgba(255,230,109,0.9)]'
              : ''
          }`}
        >
          {highlightVendorForTour && (
            <div className="mb-1.5 px-2.5 py-1 bg-[#FF4733] text-white border-2 border-[#111318] shadow-[3px_3px_0px_#111318] rounded-xs font-btn text-[11px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1 whitespace-nowrap animate-bounce">
              <span>STEP 1 · TAP BOOTH TO START ↓</span>
            </div>
          )}

          {/* Floating Interactive Sign Callout above the Awning */}
          <div className="mb-1 px-2.5 py-0.5 bg-[#1B4332] group-hover:bg-[#FF4733] text-[#FFE66D] group-hover:text-white border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] rounded-xs font-btn text-[10px] font-extrabold uppercase tracking-tight flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors">
            <span>LAUNCH WEB APP BOOTH</span>
            {agentCount > 0 && (
              <span className="font-mono text-[#95D5B2] group-hover:text-white">
                · {agentCount} LIVE
              </span>
            )}
          </div>

          {/* 2.5D Hand-Inked Street Vendor Cart, Striped Awning & Vendor Person */}
          <svg
            width="148"
            height="102"
            viewBox="0 0 148 102"
            fill="none"
            className="overflow-visible"
          >
            {/* Ground Shadow under Cart & Customer Stool */}
            <ellipse
              cx="74"
              cy="97"
              rx="64"
              ry="5"
              fill={isDarkMode ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.28)'}
            />

            {/* Warm Lantern Glow behind Vendor when Lights are On */}
            {lightsOn && (
              <ellipse
                cx="68"
                cy="54"
                rx="54"
                ry="34"
                fill="#FFE66D"
                opacity={isDarkMode ? '0.28' : '0.14'}
              />
            )}

            {/* Back Support Poles */}
            <line x1="22" y1="22" x2="22" y2="88" stroke="#1C2026" strokeWidth="3.2" />
            <line x1="114" y1="22" x2="114" y2="88" stroke="#1C2026" strokeWidth="3.2" />
            <line x1="25" y1="22" x2="25" y2="88" stroke="#94A3B8" strokeWidth="1.4" />
            <line x1="111" y1="22" x2="111" y2="88" stroke="#94A3B8" strokeWidth="1.4" />

            {/* Warm Hanging String Lights under the Awning */}
            <path
              d="M 22,28 Q 45,35 68,28 Q 91,35 114,28"
              stroke="#1C2026"
              strokeWidth="1.5"
              fill="none"
            />
            {[34, 52, 68, 84, 102].map((bx, i) => (
              <circle
                key={i}
                cx={bx}
                cy={i % 2 === 0 ? 30.5 : 32}
                r="2.8"
                fill={lightsOn ? '#FFE66D' : '#64748B'}
                stroke="#1C2026"
                strokeWidth="1.3"
              />
            ))}

            {/* THE VENDOR PERSON Standing Behind the Counter */}
            <g transform="translate(52, 27)">
              <path
                d="M 7,19 C 7,15 23,15 23,19 L 25,34 L 5,34 Z"
                fill="#1B4332"
                stroke="#1C2026"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <rect
                x="10"
                y="21"
                width="10"
                height="12"
                rx="1"
                fill="#FFFDF7"
                stroke="#1C2026"
                strokeWidth="1.5"
              />
              <path
                d="M 22,20 L 30,13"
                stroke="#1B4332"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle
                cx="31"
                cy="12"
                r="2.4"
                fill="#F2C9AC"
                stroke="#1C2026"
                strokeWidth="1.5"
              />
              <path
                d="M 8,20 L 3,28"
                stroke="#1B4332"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle
                cx="15"
                cy="10"
                r="6"
                fill="#F2C9AC"
                stroke="#1C2026"
                strokeWidth="2"
              />
              <path
                d="M 8.5,8.5 C 8.5,3.5 21.5,3.5 21.5,8.5 L 25,8.5"
                fill="#FF4733"
                stroke="#1C2026"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </g>

            {/* Mini Terminal on Counter */}
            <polygon
              points="30,56 46,56 49,46 33,46"
              fill="#1E293B"
              stroke="#1C2026"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="39.5" cy="51" r="1.8" fill="#FFE66D" />

            {/* PayPal Cash Register / Tip Jar on Right of Counter */}
            <rect
              x="88"
              y="45"
              width="16"
              height="11"
              rx="1.5"
              fill="#FFE66D"
              stroke="#1C2026"
              strokeWidth="2"
            />
            <text
              x="96"
              y="53"
              textAnchor="middle"
              fill="#141414"
              fontSize="7.5"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="900"
            >
              $$
            </text>

            {/* Striped Canvas Awning Roof */}
            <g stroke="#1C2026" strokeWidth="2.2" strokeLinejoin="round">
              <polygon points="14,22 26,6 110,6 122,22" fill="#FFFDF7" />
              <polygon points="14,22 26,6 40,6 31,22" fill="#FF4733" />
              <polygon points="48,22 54,6 68,6 65,22" fill="#FF4733" />
              <polygon points="82,22 82,6 96,6 99,22" fill="#FF4733" />
              <polygon points="110,6 122,22 114,22 105,6" fill="#FF4733" />

              {[14, 29, 44, 59, 74, 89, 104].map((sx, idx) => (
                <path
                  key={sx}
                  d={`M ${sx},22 L ${sx + 15},22 L ${sx + 15},26 C ${sx + 15},30 ${sx},30 ${sx},26 Z`}
                  fill={idx % 2 === 0 ? '#FF4733' : '#FFFDF7'}
                />
              ))}
            </g>

            {/* Top Counter Ledge */}
            <rect
              x="16"
              y="55"
              width="104"
              height="6"
              rx="1.5"
              fill="#F5E3A9"
              stroke="#1C2026"
              strokeWidth="2.2"
            />
            {/* Cart Front Panel */}
            <rect
              x="20"
              y="61"
              width="96"
              height="29"
              fill="#1E293B"
              stroke="#1C2026"
              strokeWidth="2.4"
            />
            {/* Stenciled Signboard on the Front of the Cart */}
            <rect
              x="27"
              y="66"
              width="82"
              height="19"
              rx="1.5"
              fill="#FFFDF7"
              stroke="#1C2026"
              strokeWidth="2"
            />
            <text
              x="68"
              y="75"
              textAnchor="middle"
              fill="#141414"
              fontSize="7.5"
              fontFamily="Syne, Space Grotesk, sans-serif"
              fontWeight="800"
            >
              DEPLOY &amp; VAULT
            </text>
            <text
              x="68"
              y="82.5"
              textAnchor="middle"
              fill="#FF4733"
              fontSize="6.2"
              fontFamily="Space Grotesk, sans-serif"
              fontWeight="700"
            >
              OPEN STUDIO →
            </text>

            {/* Cart Spoked Wheels */}
            <g>
              <circle
                cx="32"
                cy="91"
                r="7.5"
                fill="#334155"
                stroke="#1C2026"
                strokeWidth="2.4"
              />
              <circle
                cx="32"
                cy="91"
                r="2.8"
                fill="#FFE66D"
                stroke="#1C2026"
                strokeWidth="1.6"
              />
              <circle
                cx="104"
                cy="91"
                r="7.5"
                fill="#334155"
                stroke="#1C2026"
                strokeWidth="2.4"
              />
              <circle
                cx="104"
                cy="91"
                r="2.8"
                fill="#FFE66D"
                stroke="#1C2026"
                strokeWidth="1.6"
              />
            </g>

            {/* Sidewalk A-Frame Chalkboard Sign next to the Cart */}
            <g transform="translate(122, 62)">
              <line x1="10" y1="2" x2="2" y2="33" stroke="#1C2026" strokeWidth="2.4" strokeLinecap="round" />
              <line x1="10" y1="2" x2="20" y2="33" stroke="#1C2026" strokeWidth="2.4" strokeLinecap="round" />
              <polygon
                points="3,28 11,4 19,28"
                fill="#1B4332"
                stroke="#1C2026"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="11" cy="14" r="2.2" fill="#FFE66D" />
              <line x1="7" y1="21" x2="15" y2="21" stroke="#FFFDF7" strokeWidth="1.6" />
            </g>
          </svg>
        </button>
      )}

      {/* Tiny 2.5D Pedestrians (1 Tiny Person per 10 Views) */}
      {people.map((p) => {
        const wrapperStyle: React.CSSProperties = p.isStoppingSpectator
          ? {
              left: `${p.staticLeftPct}%`,
              bottom: `${p.bottomPx}px`,
              zIndex: 10 + p.depthLane,
            }
          : ({
              left: 0,
              bottom: `${p.bottomPx}px`,
              zIndex: 10 + p.depthLane,
              '--walk-dur': `${p.walkDurationSec}s`,
              '--walk-delay': `${p.walkDelaySec}s`,
              '--bob-delay': `${p.bobDelaySec}s`,
            } as React.CSSProperties);

        const walkClass = p.isStoppingSpectator
          ? ''
          : p.direction === 'right'
          ? 'pedestrian-walk-right'
          : 'pedestrian-walk-left';

        const showSnipeReaction =
          Boolean(recentSnipeAttacker) && p.isStoppingSpectator && p.id % 2 === 0;

        return (
          <div
            key={p.id}
            style={wrapperStyle}
            title={`Tiny Person #${p.personNumber} (Views ${p.viewsRepresented}) · ${
              p.isStoppingSpectator ? 'Looking at Billboard' : 'Walking on Street'
            }`}
            className={`group absolute pointer-events-auto ${walkClass}`}
          >
            {/* Hover Mini Tag OR Live Snipe Reaction Bubble */}
            {showSnipeReaction ? (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-xs bg-[#FFE66D] text-[#111318] border-2 border-[#111318] shadow-[2px_2px_0px_#111318] font-btn font-extrabold text-[9px] whitespace-nowrap animate-bounce z-30">
                {p.reactionText}
              </div>
            ) : (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-xs bg-[#181B20] text-[#FFE66D] border border-[#FFE66D]/60 font-ui font-bold text-[9px] whitespace-nowrap pointer-events-none z-30">
                #{p.personNumber} · {p.isStoppingSpectator ? 'Looking Up' : 'Walking'} (Views {p.viewsRepresented})
              </div>
            )}

            <div
              style={{ transform: `scale(${p.scale})` }}
              className={p.isStoppingSpectator ? '' : 'pedestrian-bob'}
            >
              <svg
                width={p.hasDog ? '50' : '28'}
                height="44"
                viewBox={p.hasDog ? '0 0 50 44' : '0 0 28 44'}
                fill="none"
              >
                {/* Ground Shadow */}
                <ellipse
                  cx="14"
                  cy="40.5"
                  rx="8.5"
                  ry="2.5"
                  fill={isDarkMode ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.22)'}
                />

                {/* Backpack */}
                {p.hasBackpack && (
                  <rect
                    x="4.5"
                    y="15.5"
                    width="6.5"
                    height="11.5"
                    rx="2.5"
                    fill="#6B5E4C"
                    stroke="#1C2026"
                    strokeWidth="1.8"
                  />
                )}

                {/* Back Leg */}
                <g className={p.isStoppingSpectator ? '' : 'limb-stride-b'}>
                  <line
                    x1="12"
                    y1="27"
                    x2={p.isStoppingSpectator ? '11' : '9.5'}
                    y2="38"
                    stroke={p.pants}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                  />
                  <rect
                    x={p.isStoppingSpectator ? '8.5' : '7'}
                    y="37"
                    width="5.5"
                    height="3.2"
                    rx="1.5"
                    fill="#FFFFFF"
                    stroke="#1C2026"
                    strokeWidth="1.4"
                  />
                </g>

                {/* Front Leg */}
                <g className={p.isStoppingSpectator ? '' : 'limb-stride-a'}>
                  <line
                    x1="16"
                    y1="27"
                    x2={p.isStoppingSpectator ? '17' : '18.5'}
                    y2="38"
                    stroke={p.pants}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                  />
                  <rect
                    x={p.isStoppingSpectator ? '14.5' : '16'}
                    y="37"
                    width="5.5"
                    height="3.2"
                    rx="1.5"
                    fill="#D95338"
                    stroke="#1C2026"
                    strokeWidth="1.4"
                  />
                </g>

                {/* Jacket / Hoodie Torso */}
                <path
                  d="M 8.5,18 C 8.5,14.5 19.5,14.5 19.5,18 L 20.5,27.5 C 20.5,28.8 7.5,28.8 7.5,27.5 Z"
                  fill={p.hoodie}
                  stroke="#1C2026"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />

                {/* Swinging Arm (or Pointing Up at the Billboard if Admiring!) */}
                <g className={p.isStoppingSpectator ? '' : 'limb-stride-b'}>
                  <line
                    x1="14"
                    y1="17.5"
                    x2={p.isStoppingSpectator ? '19' : '16.5'}
                    y2={p.isStoppingSpectator ? '11.5' : '25.5'}
                    stroke={p.hoodie}
                    strokeWidth="3.4"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={p.isStoppingSpectator ? '19.5' : '16.5'}
                    cy={p.isStoppingSpectator ? '11' : '26'}
                    r="1.8"
                    fill={p.skin}
                    stroke="#1C2026"
                    strokeWidth="1.2"
                  />
                </g>

                {/* Head (tilted up looking at billboard when admiring) */}
                <circle
                  cx="14"
                  cy={p.isStoppingSpectator ? '9' : '9.5'}
                  r="5.2"
                  fill={p.skin}
                  stroke="#1C2026"
                  strokeWidth="1.8"
                />

                {/* Cap, Beanie, or Hair */}
                {p.hasCap ? (
                  <path
                    d="M 8.8,8.5 C 8.8,4.2 19.2,4.2 19.2,8.5 L 22,8.5"
                    fill="#34495E"
                    stroke="#1C2026"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                ) : p.hasBeanie ? (
                  <path
                    d="M 8.8,9 C 8.8,3.8 19.2,3.8 19.2,9 Z"
                    fill="#D65A43"
                    stroke="#1C2026"
                    strokeWidth="1.7"
                  />
                ) : (
                  <path
                    d="M 9,8.8 C 9.2,4 18.8,4 19,8.8 C 17,6.8 11,6.8 9,8.8 Z"
                    fill={p.hair}
                    stroke="#1C2026"
                    strokeWidth="1.5"
                  />
                )}

                {/* Tiny Companion Dog on Leash */}
                {p.hasDog && !p.isStoppingSpectator && (
                  <g>
                    <path
                      d="M 17,24 Q 26,28 33,30"
                      stroke="#1C2026"
                      strokeWidth="1.3"
                      fill="none"
                    />
                    <ellipse
                      cx="37"
                      cy="40.5"
                      rx="6"
                      ry="1.8"
                      fill="rgba(0,0,0,0.18)"
                    />
                    <rect
                      x="31"
                      y="30.5"
                      width="11"
                      height="6"
                      rx="3"
                      fill="#C88444"
                      stroke="#1C2026"
                      strokeWidth="1.6"
                    />
                    <circle
                      cx="42.5"
                      cy="29.5"
                      r="3.4"
                      fill="#C88444"
                      stroke="#1C2026"
                      strokeWidth="1.6"
                    />
                    <path d="M 41,28.5 L 39.5,31.5" stroke="#1C2026" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M 31,31.5 L 28.5,28.5" stroke="#C88444" strokeWidth="2.2" strokeLinecap="round" />
                    <line x1="33" y1="36.5" x2="32" y2="40" stroke="#1C2026" strokeWidth="1.7" />
                    <line x1="39.5" y1="36.5" x2="40.5" y2="40" stroke="#1C2026" strokeWidth="1.7" />
                  </g>
                )}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};
