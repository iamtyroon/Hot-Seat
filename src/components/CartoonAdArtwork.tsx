import React, { useId } from 'react';
import { AdTemplateId } from '../types';
import { ExternalLink } from 'lucide-react';

export interface AdTemplateMeta {
  id: AdTemplateId;
  name: string;
  tagline: string;
  swatchColor: string;
  accentSwatch: string;
  wallWashDay?: string;
  wallWashNight?: string;
  wallWashOpacity?: number;
  isLightTextOnWall?: boolean;
}

export const AD_TEMPLATES: AdTemplateMeta[] = [
  {
    id: 'BOMB_BURST',
    name: 'Swiss Grid',
    tagline: 'Full-wall carbon wash + architectural Swiss grid & highlight bar',
    swatchColor: '#111318',
    accentSwatch: '#FFE600',
    wallWashDay: '#10141D',
    wallWashNight: '#0B0E17',
    wallWashOpacity: 0.86,
    isLightTextOnWall: true,
  },
  {
    id: 'CROWN_TAG',
    name: 'Monumental Type',
    tagline: 'Pure borderless display type painted directly on the natural brick wall',
    swatchColor: '#FF4733',
    accentSwatch: '#111318',
    wallWashDay: undefined,
    wallWashNight: undefined,
    wallWashOpacity: 0,
    isLightTextOnWall: false,
  },
  {
    id: 'WHEATPASTE_POSTER',
    name: 'Editorial Frame',
    tagline: 'Full-wall warm gallery wash + centered brand crest & framing lines',
    swatchColor: '#FAF8F2',
    accentSwatch: '#E11D48',
    wallWashDay: '#FAF6EC',
    wallWashNight: '#181E2C',
    wallWashOpacity: 0.65,
    isLightTextOnWall: false,
  },
  {
    id: 'SPRAY_CLOUD',
    name: 'Split Showcase',
    tagline: 'Asymmetric two-column architectural wall split with giant brand crest & statement',
    swatchColor: '#2563EB',
    accentSwatch: '#111318',
    wallWashDay: undefined,
    wallWashNight: undefined,
    wallWashOpacity: 0,
    isLightTextOnWall: false,
  },
  {
    id: 'SKATE_DECK',
    name: 'Kinetic Slash',
    tagline: 'Full-wall electric indigo wash + angled kinetic ribbon banners across the bricks',
    swatchColor: '#1E1B4B',
    accentSwatch: '#00F5D4',
    wallWashDay: '#16193B',
    wallWashNight: '#0E1029',
    wallWashOpacity: 0.86,
    isLightTextOnWall: true,
  },
  {
    id: 'NEON_ARCADE',
    name: 'Emerald Spotlight',
    tagline: 'Full-wall deep emerald wash + bold brand monogram & web app pitch',
    swatchColor: '#064E3B',
    accentSwatch: '#10B981',
    wallWashDay: '#092622',
    wallWashNight: '#061B18',
    wallWashOpacity: 0.86,
    isLightTextOnWall: true,
  },
];

export function getTemplateMeta(id?: AdTemplateId | null): AdTemplateMeta {
  return AD_TEMPLATES.find((t) => t.id === id) || AD_TEMPLATES[0];
}

interface CartoonAdArtworkProps {
  templateId: AdTemplateId;
  headline: string;
  url: string;
  logoDataUrl?: string;
  sprayColor: string;
  textColor: string;
  accentColor?: string;
  companyName?: string;
  isRemnant?: boolean;
  remnantAge?: number;
  isPreview?: boolean;
  isDarkMode?: boolean;
}

function wrapHeadlineToWall(
  text: string,
  targetCharsPerLine = 16,
  maxLines = 4
): string[] {
  const cleaned = (text || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cleaned) return ['LAUNCH YOUR WEB APP'];

  const packWithBudget = (budget: number): string[] => {
    const rawWords = cleaned.split(' ');
    const words: string[] = [];
    for (const w of rawWords) {
      if (w.length > budget + 4) {
        for (let i = 0; i < w.length; i += budget) {
          words.push(w.slice(i, i + budget));
        }
      } else {
        words.push(w);
      }
    }

    const packed: string[] = [];
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= budget) {
        current = `${current} ${word}`;
      } else {
        packed.push(current);
        current = word;
      }
    }
    if (current) packed.push(current);
    return packed;
  };

  let budget = targetCharsPerLine;
  let lines = packWithBudget(budget);
  while (lines.length > maxLines && budget < 36) {
    budget += 3;
    lines = packWithBudget(budget);
  }

  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    const tail = lines.slice(maxLines - 1).join(' ');
    return [...head, tail.slice(0, budget + 4)];
  }

  return lines;
}

function computeWrappedFontSize(
  lines: string[],
  baseFontSize: number,
  maxPixelWidth: number,
  charWidthFactor = 0.62,
  maxTotalHeight = 290
): number {
  const longestChars = Math.max(...lines.map((l) => l.length), 1);
  const widthLimited = Math.floor(maxPixelWidth / (longestChars * charWidthFactor));
  const heightLimited = Math.floor(maxTotalHeight / (lines.length * 1.15));
  return Math.max(38, Math.min(baseFontSize, widthLimited, heightLimited));
}

export const CartoonAdArtwork: React.FC<CartoonAdArtworkProps> = ({
  templateId,
  headline,
  url,
  logoDataUrl,
  sprayColor,
  companyName,
  isRemnant = false,
  remnantAge = 1,
  isPreview = false,
  isDarkMode = false,
}) => {
  const uid = useId().replace(/:/g, '');
  const cleanUrl = (url || 'hotseat.live').replace(/^https?:\/\//i, '').toLowerCase();
  const brand = (companyName || 'WEB APP').toUpperCase();
  const brandInitial = brand.charAt(0) || 'W';
  const hasLogo = Boolean(logoDataUrl && logoDataUrl.trim().length > 0);
  const meta = getTemplateMeta(templateId);

  const renderWhitewashHistoryCoat = () => {
    if (!isRemnant) return null;
    const rollerTone = isDarkMode ? '#1A2334' : '#F4F3EC';
    const streakTone = isDarkMode ? '#222D42' : '#FAF9F4';
    const coatOpacity = Math.min(0.88, 0.62 + (remnantAge - 1) * 0.06);

    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
        viewBox="0 0 1400 700"
        preserveAspectRatio="none"
      >
        <g opacity={coatOpacity}>
          <path d="M -10,15 L 1410,5 L 1410,255 L -10,270 Z" fill={rollerTone} />
          <path d="M -20,225 L 1420,210 L 1420,485 L -20,500 Z" fill={streakTone} />
          <path d="M -10,455 L 1410,440 L 1410,690 L -10,698 Z" fill={rollerTone} />
        </g>
      </svg>
    );
  };

  const renderStartupBillboardTemplate = () => {
    switch (templateId) {
      case 'BOMB_BURST': {
        const maxTextW = 1220;
        const lines = wrapHeadlineToWall(headline, 18, 4);
        const primaryAccent = sprayColor && sprayColor !== '#FFFFFF' ? sprayColor : '#FFE600';
        const fontSize = computeWrappedFontSize(lines, 108, maxTextW, 0.62, 290);
        const lineHeight = fontSize * 1.12;
        const blockHeight = (lines.length - 1) * lineHeight;
        const startY = Math.round(340 - blockHeight / 2);
        const brandFontSize = Math.min(38, Math.max(22, Math.floor(620 / Math.max(1, brand.length * 0.68))));
        const urlFontSize = Math.min(28, Math.max(18, Math.floor(420 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`swiss-logo-clip-${uid}`}>
                <rect x="0" y="-38" width="76" height="76" rx="14" />
              </clipPath>
            </defs>

            <line x1="56" y1="128" x2="1344" y2="128" stroke="#FFFFFF" strokeWidth="3" opacity="0.28" />
            <line x1="56" y1="558" x2="1344" y2="558" stroke="#FFFFFF" strokeWidth="3" opacity="0.28" />

            <g transform="translate(64, 68)">
              {hasLogo ? (
                <g>
                  <rect
                    x="0"
                    y="-38"
                    width="76"
                    height="76"
                    rx="14"
                    fill="#FFFFFF"
                    stroke={primaryAccent}
                    strokeWidth="3.5"
                  />
                  <image
                    href={logoDataUrl}
                    x="6"
                    y="-32"
                    width="64"
                    height="64"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#swiss-logo-clip-${uid})`}
                  />
                </g>
              ) : (
                <g>
                  <rect x="0" y="-34" width="68" height="68" rx="12" fill={primaryAccent} />
                  <text
                    x="34"
                    y="14"
                    textAnchor="middle"
                    fill="#0E1116"
                    fontFamily="var(--font-sans)"
                    fontWeight="900"
                    fontSize="40"
                  >
                    {brandInitial}
                  </text>
                </g>
              )}

              <text
                x={hasLogo ? 96 : 88}
                y="12"
                fill="#FFFFFF"
                fontFamily="var(--font-sans)"
                fontWeight="900"
                fontSize={brandFontSize}
                letterSpacing="2.5"
              >
                {brand}
              </text>
            </g>

            <g transform={`translate(64, ${startY})`}>
              {lines.map((line, i) => {
                const isLast = i === lines.length - 1;
                const y = i * lineHeight;
                const estLineW = line.length * (fontSize * 0.61);
                const clampedLineW = Math.min(maxTextW, estLineW);
                const highlightW = Math.min(maxTextW + 32, Math.max(320, clampedLineW + 44));

                return (
                  <g key={i}>
                    {isLast && (
                      <rect
                        x="-14"
                        y={y - fontSize * 0.84}
                        width={highlightW}
                        height={fontSize * 1.04}
                        rx="8"
                        fill={primaryAccent}
                      />
                    )}
                    <text
                      x="0"
                      y={y}
                      fill={isLast ? '#0E1116' : '#FFFFFF'}
                      fontFamily="var(--font-sans)"
                      fontWeight="900"
                      fontSize={fontSize}
                      letterSpacing="-1.5"
                      {...(estLineW > maxTextW
                        ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
                        : {})}
                    >
                      {line}
                    </text>
                  </g>
                );
              })}
            </g>

            <g transform="translate(700, 616)">
              <rect x="-240" y="-36" width="480" height="68" rx="10" fill={primaryAccent} />
              <text
                x="0"
                y="9"
                textAnchor="middle"
                fill="#0E1116"
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
                letterSpacing="0.5"
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }

      case 'CROWN_TAG': {
        const maxTextW = 1180;
        const lines = wrapHeadlineToWall(headline, 16, 4);
        const fgColor = isDarkMode ? '#F8FAFC' : '#111318';
        const subColor = isDarkMode ? '#94A3B8' : '#334155';
        const accent = '#FF4733';
        const fontSize = computeWrappedFontSize(lines, 118, maxTextW, 0.63, 285);
        const lineHeight = fontSize * 1.08;
        const blockHeight = (lines.length - 1) * lineHeight;
        const startY = Math.round(335 - blockHeight / 2);
        const headerFontSize = Math.min(26, Math.max(16, Math.floor(440 / Math.max(1, brand.length * 0.65))));
        const urlFontSize = Math.min(28, Math.max(18, Math.floor(440 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`wall-logo-clip-${uid}`}>
                <rect x="-250" y="-42" width="76" height="76" rx="16" />
              </clipPath>
            </defs>

            <g stroke={subColor} strokeWidth="5" opacity="0.75" fill="none">
              <path d="M 56,36 L 120,36 M 56,36 L 56,100" />
              <path d="M 1344,36 L 1280,36 M 1344,36 L 1344,100" />
              <path d="M 56,664 L 120,664 M 56,664 L 56,600" />
              <path d="M 1344,664 L 1280,664 M 1344,664 L 1344,600" />
            </g>

            <g transform="translate(700, 78)">
              {hasLogo && (
                <g>
                  <rect
                    x="-254"
                    y="-44"
                    width="80"
                    height="80"
                    rx="18"
                    fill="#FFFFFF"
                    stroke={fgColor}
                    strokeWidth="4"
                  />
                  <image
                    href={logoDataUrl}
                    x="-246"
                    y="-36"
                    width="64"
                    height="64"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#wall-logo-clip-${uid})`}
                  />
                </g>
              )}
              <rect
                x={hasLogo ? -156 : -200}
                y="-34"
                width="400"
                height="60"
                rx="30"
                fill={fgColor}
              />
              <text
                x={hasLogo ? 44 : 0}
                y="6"
                textAnchor="middle"
                fill={isDarkMode ? '#111318' : '#FFFFFF'}
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={headerFontSize}
                letterSpacing="3"
              >
                {brand}
              </text>
            </g>

            <g transform={`translate(700, ${startY})`}>
              {lines.map((line, i) => {
                const y = i * lineHeight;
                const isLast = i === lines.length - 1;
                const estLineW = line.length * (fontSize * 0.6);
                const clampedW = Math.min(maxTextW, estLineW);
                const underlineW = Math.min(1160, Math.max(320, clampedW));

                return (
                  <g key={i}>
                    <text
                      x="5"
                      y={y + 5}
                      textAnchor="middle"
                      fill={isDarkMode ? '#000000' : '#FFFFFF'}
                      fontFamily="var(--font-display)"
                      fontWeight="900"
                      fontSize={fontSize}
                      letterSpacing="1.5"
                      {...(estLineW > maxTextW
                        ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
                        : {})}
                    >
                      {line}
                    </text>
                    <text
                      x="0"
                      y={y}
                      textAnchor="middle"
                      fill={isLast ? accent : fgColor}
                      fontFamily="var(--font-display)"
                      fontWeight="900"
                      fontSize={fontSize}
                      letterSpacing="1.5"
                      {...(estLineW > maxTextW
                        ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
                        : {})}
                    >
                      {line}
                    </text>
                    {isLast && (
                      <rect
                        x={-underlineW / 2}
                        y={y + 16}
                        width={underlineW}
                        height="12"
                        rx="6"
                        fill={accent}
                      />
                    )}
                  </g>
                );
              })}
            </g>

            <g transform="translate(700, 622)">
              <rect x="-270" y="-42" width="540" height="76" rx="38" fill={fgColor} />
              <circle cx="-218" cy="-3" r="12" fill={accent} />
              <text
                x="16"
                y="8"
                textAnchor="middle"
                fill={isDarkMode ? '#111318' : '#FFFFFF'}
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
                letterSpacing="1.5"
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }

      case 'WHEATPASTE_POSTER': {
        const maxTextW = 1140;
        const lines = wrapHeadlineToWall(headline, 18, 4);
        const fgColor = isDarkMode ? '#F8FAFC' : '#111318';
        const ruleColor = isDarkMode ? '#334155' : '#111318';
        const fontSize = computeWrappedFontSize(lines, 102, maxTextW, 0.62, 250);
        const lineHeight = fontSize * 1.1;
        const blockHeight = (lines.length - 1) * lineHeight;
        const centerBandY = hasLogo ? 365 : 345;
        const startY = Math.round(centerBandY - blockHeight / 2);
        const urlFontSize = Math.min(27, Math.max(18, Math.floor(440 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`keynote-logo-clip-${uid}`}>
                <rect x="-42" y="-42" width="84" height="84" rx="18" />
              </clipPath>
            </defs>

            <rect
              x="54"
              y="26"
              width="1292"
              height="648"
              fill="none"
              stroke={ruleColor}
              strokeWidth="4"
              opacity="0.75"
            />
            <rect
              x="70"
              y="42"
              width="1260"
              height="616"
              fill="none"
              stroke={ruleColor}
              strokeWidth="1.5"
              opacity="0.45"
            />

            <g transform="translate(700, 108)">
              {hasLogo ? (
                <g transform="translate(0, -16)">
                  <rect
                    x="-46"
                    y="-46"
                    width="92"
                    height="92"
                    rx="20"
                    fill="#FFFFFF"
                    stroke={fgColor}
                    strokeWidth="3.5"
                  />
                  <image
                    href={logoDataUrl}
                    x="-38"
                    y="-38"
                    width="76"
                    height="76"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#keynote-logo-clip-${uid})`}
                  />
                  <text
                    x="0"
                    y="74"
                    textAnchor="middle"
                    fill={fgColor}
                    fontFamily="var(--font-sans)"
                    fontWeight="900"
                    fontSize="28"
                    letterSpacing="4"
                  >
                    {brand}
                  </text>
                </g>
              ) : (
                <text
                  x="0"
                  y="10"
                  textAnchor="middle"
                  fill={fgColor}
                  fontFamily="var(--font-sans)"
                  fontWeight="900"
                  fontSize="40"
                  letterSpacing="5"
                >
                  {brand}
                </text>
              )}
            </g>

            <g transform={`translate(700, ${startY})`}>
              {lines.map((line, i) => {
                const estLineW = line.length * (fontSize * 0.6);
                return (
                  <text
                    key={i}
                    x="0"
                    y={i * lineHeight}
                    textAnchor="middle"
                    fill={i === lines.length - 1 ? '#E11D48' : fgColor}
                    fontFamily="var(--font-sans)"
                    fontWeight="900"
                    fontSize={fontSize}
                    letterSpacing="-1.5"
                    {...(estLineW > maxTextW
                      ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    {line}
                  </text>
                );
              })}
            </g>

            <g transform="translate(700, 598)">
              <rect x="-260" y="-38" width="520" height="72" rx="8" fill={fgColor} />
              <text
                x="0"
                y="8"
                textAnchor="middle"
                fill={isDarkMode ? '#111318' : '#FAF8F3'}
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
                letterSpacing="1.5"
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }

      case 'SPRAY_CLOUD': {
        const rightColMaxW = 850;
        const lines = wrapHeadlineToWall(headline, 14, 4);
        const fgColor = isDarkMode ? '#F8FAFC' : '#111318';
        const accent = '#2563EB';
        const fontSize = computeWrappedFontSize(lines, 92, rightColMaxW, 0.62, 290);
        const lineHeight = fontSize * 1.1;
        const blockHeight = (lines.length - 1) * lineHeight;
        const startY = Math.round(295 - blockHeight / 2);
        const leftBrandSize = Math.min(38, Math.max(20, Math.floor(305 / Math.max(1, brand.length * 0.66))));
        const urlFontSize = Math.min(28, Math.max(18, Math.floor(460 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`split-logo-clip-${uid}`}>
                <rect x="0" y="0" width="136" height="136" rx="24" />
              </clipPath>
            </defs>

            <line x1="405" y1="28" x2="405" y2="672" stroke={fgColor} strokeWidth="5" />
            <line x1="56" y1="28" x2="1344" y2="28" stroke={fgColor} strokeWidth="5" />
            <line x1="56" y1="672" x2="1344" y2="672" stroke={fgColor} strokeWidth="5" />

            <g transform="translate(68, 120)">
              {hasLogo ? (
                <g>
                  <rect
                    x="0"
                    y="0"
                    width="144"
                    height="144"
                    rx="28"
                    fill="#FFFFFF"
                    stroke={fgColor}
                    strokeWidth="5"
                  />
                  <image
                    href={logoDataUrl}
                    x="8"
                    y="8"
                    width="128"
                    height="128"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#split-logo-clip-${uid})`}
                  />
                </g>
              ) : (
                <g>
                  <rect x="0" y="0" width="136" height="136" rx="24" fill={accent} stroke={fgColor} strokeWidth="5" />
                  <text
                    x="68"
                    y="96"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontFamily="var(--font-display)"
                    fontWeight="900"
                    fontSize="88"
                  >
                    {brandInitial}
                  </text>
                </g>
              )}

              <text
                x="0"
                y="210"
                fill={fgColor}
                fontFamily="var(--font-sans)"
                fontWeight="900"
                fontSize={leftBrandSize}
                letterSpacing="1"
              >
                {brand}
              </text>

              <rect x="0" y="232" width="280" height="8" rx="4" fill={accent} />
            </g>

            <g transform={`translate(445, ${startY})`}>
              {lines.map((line, i) => {
                const estLineW = line.length * (fontSize * 0.6);
                return (
                  <text
                    key={i}
                    x="0"
                    y={i * lineHeight}
                    fill={i === lines.length - 1 ? accent : fgColor}
                    fontFamily="var(--font-sans)"
                    fontWeight="900"
                    fontSize={fontSize}
                    letterSpacing="-1.5"
                    {...(estLineW > rightColMaxW
                      ? { textLength: rightColMaxW, lengthAdjust: 'spacingAndGlyphs' }
                      : {})}
                  >
                    {line}
                  </text>
                );
              })}
            </g>

            <g transform="translate(445, 575)">
              <rect x="0" y="-44" width="520" height="76" rx="12" fill={accent} stroke={fgColor} strokeWidth="4" />
              <text
                x="260"
                y="5"
                textAnchor="middle"
                fill="#FFFFFF"
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
                letterSpacing="1"
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }

      case 'SKATE_DECK': {
        const maxTextW = 1140;
        const lines = wrapHeadlineToWall(headline, 18, 4);
        const fontSize = computeWrappedFontSize(lines, 94, maxTextW, 0.62, 255);
        const ribbonStep = fontSize * 1.22;
        const blockHeight = (lines.length - 1) * ribbonStep;
        const startY = Math.round(340 - blockHeight / 2);
        const urlFontSize = Math.min(27, Math.max(18, Math.floor(440 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`kinetic-logo-clip-${uid}`}>
                <rect x="0" y="-36" width="72" height="72" rx="14" />
              </clipPath>
            </defs>

            <g transform="translate(68, 78)">
              {hasLogo ? (
                <g>
                  <rect
                    x="0"
                    y="-36"
                    width="72"
                    height="72"
                    rx="14"
                    fill="#FFFFFF"
                    stroke="#00F5D4"
                    strokeWidth="3.5"
                  />
                  <image
                    href={logoDataUrl}
                    x="6"
                    y="-30"
                    width="60"
                    height="60"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#kinetic-logo-clip-${uid})`}
                  />
                </g>
              ) : (
                <rect x="0" y="-28" width="56" height="56" rx="12" fill="#00F5D4" />
              )}
              {!hasLogo && (
                <text
                  x="28"
                  y="11"
                  textAnchor="middle"
                  fill="#0E1029"
                  fontFamily="var(--font-sans)"
                  fontWeight="900"
                  fontSize="34"
                >
                  {brandInitial}
                </text>
              )}
              <text
                x={hasLogo ? 90 : 74}
                y="12"
                fill="#FFFFFF"
                fontFamily="var(--font-sans)"
                fontWeight="900"
                fontSize="34"
                letterSpacing="3"
              >
                {brand}
              </text>
            </g>

            <g transform="rotate(-2.2 700 350)">
              {lines.map((line, i) => {
                const y = startY + i * ribbonStep;
                const isEven = i % 2 === 0;
                const ribbonFill = isEven ? '#00F5D4' : '#FFFFFF';
                const textFill = '#0E1029';
                const estLineW = line.length * (fontSize * 0.6);

                return (
                  <g key={i}>
                    <rect
                      x="68"
                      y={y - fontSize * 0.84}
                      width="1264"
                      height={fontSize * 1.06}
                      rx="8"
                      fill={ribbonFill}
                    />
                    <text
                      x="700"
                      y={y}
                      textAnchor="middle"
                      fill={textFill}
                      fontFamily="var(--font-sans)"
                      fontWeight="900"
                      fontSize={fontSize}
                      letterSpacing="-1.5"
                      {...(estLineW > maxTextW
                        ? { textLength: maxTextW, lengthAdjust: 'spacingAndGlyphs' }
                        : {})}
                    >
                      {line}
                    </text>
                  </g>
                );
              })}
            </g>

            <g transform="translate(700, 622)">
              <rect x="-260" y="-38" width="520" height="72" rx="36" fill="#FFE600" />
              <text
                x="0"
                y="8"
                textAnchor="middle"
                fill="#0E1029"
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
                letterSpacing="1.5"
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }

      case 'NEON_ARCADE':
      default: {
        const rightColMaxW = 790;
        const lines = wrapHeadlineToWall(headline, 13, 4);
        const fontSize = computeWrappedFontSize(lines, 84, rightColMaxW, 0.62, 265);
        const lineHeight = fontSize * 1.1;
        const brandFontSize = Math.min(36, Math.max(20, Math.floor(640 / Math.max(1, brand.length * 0.68))));
        const urlFontSize = Math.min(26, Math.max(18, Math.floor(400 / Math.max(1, (cleanUrl.length + 2) * 0.62))));

        return (
          <g>
            <defs>
              <clipPath id={`proof-logo-clip-${uid}`}>
                <rect x="0" y="-38" width="76" height="76" rx="14" />
              </clipPath>
            </defs>

            <line x1="470" y1="28" x2="470" y2="672" stroke="#10B981" strokeWidth="3" opacity="0.4" />
            <line x1="56" y1="548" x2="1344" y2="548" stroke="#10B981" strokeWidth="3" opacity="0.4" />

            <g transform="translate(110, 320)">
              <rect
                x="0"
                y="-150"
                width="240"
                height="240"
                rx="36"
                fill="#10B981"
              />
              <text
                x="120"
                y="24"
                textAnchor="middle"
                fill="#061B18"
                fontFamily="var(--font-display)"
                fontWeight="900"
                fontSize="160"
              >
                {brandInitial}
              </text>
              <text
                x="120"
                y="140"
                textAnchor="middle"
                fill="#A7F3D0"
                fontFamily="var(--font-sans)"
                fontWeight="800"
                fontSize="26"
                letterSpacing="2"
              >
                {brand}
              </text>
            </g>

            <g transform="translate(515, 88)">
              {hasLogo ? (
                <g>
                  <rect
                    x="0"
                    y="-38"
                    width="76"
                    height="76"
                    rx="14"
                    fill="#FFFFFF"
                    stroke="#10B981"
                    strokeWidth="3.5"
                  />
                  <image
                    href={logoDataUrl}
                    x="6"
                    y="-32"
                    width="64"
                    height="64"
                    preserveAspectRatio="xMidYMid meet"
                    clipPath={`url(#proof-logo-clip-${uid})`}
                  />
                </g>
              ) : (
                <rect x="0" y="-32" width="62" height="62" rx="12" fill="#10B981" />
              )}
              {!hasLogo && (
                <text
                  x="31"
                  y="11"
                  textAnchor="middle"
                  fill="#061B18"
                  fontFamily="var(--font-sans)"
                  fontWeight="900"
                  fontSize="36"
                >
                  {brandInitial}
                </text>
              )}
              <text
                x={hasLogo ? 94 : 80}
                y="12"
                fill="#FFFFFF"
                fontFamily="var(--font-sans)"
                fontWeight="900"
                fontSize={brandFontSize}
                letterSpacing="2.5"
              >
                {brand}
              </text>

              <g transform="translate(0, 128)">
                {lines.map((line, i) => {
                  const estLineW = line.length * (fontSize * 0.6);
                  return (
                    <text
                      key={i}
                      x="0"
                      y={i * lineHeight}
                      fill={i === lines.length - 1 ? '#10B981' : '#FFFFFF'}
                      fontFamily="var(--font-sans)"
                      fontWeight="900"
                      fontSize={fontSize}
                      letterSpacing="-1.5"
                      {...(estLineW > rightColMaxW
                        ? { textLength: rightColMaxW, lengthAdjust: 'spacingAndGlyphs' }
                        : {})}
                    >
                      {line}
                    </text>
                  );
                })}
              </g>
            </g>

            <g transform="translate(700, 612)">
              <rect x="-240" y="-36" width="480" height="68" rx="10" fill="#10B981" />
              <text
                x="0"
                y="9"
                textAnchor="middle"
                fill="#061B18"
                fontFamily="var(--font-mono)"
                fontWeight="900"
                fontSize={urlFontSize}
              >
                {cleanUrl} ↗
              </text>
            </g>
          </g>
        );
      }
    }
  };

  return (
    <div
      style={
        isRemnant
          ? {
              filter: isDarkMode
                ? 'saturate(0.25) brightness(0.82) contrast(0.75)'
                : 'saturate(0.22) brightness(1.18) contrast(0.72)',
            }
          : isPreview && meta.wallWashDay
          ? {
              backgroundColor: meta.wallWashDay,
              borderRadius: '6px',
            }
          : undefined
      }
      className="relative w-full aspect-[2/1] flex items-center justify-center select-none overflow-hidden"
    >
      <svg
        className="relative z-20 w-full h-full overflow-hidden pointer-events-none"
        viewBox="0 0 1400 700"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={`wall-safe-bounds-${uid}`}>
            <rect x="36" y="16" width="1328" height="668" rx="6" />
          </clipPath>
        </defs>
        <g clipPath={`url(#wall-safe-bounds-${uid})`}>
          {renderStartupBillboardTemplate()}
        </g>
      </svg>

      {!isRemnant && !isPreview && (
        <a
          href={`https://${cleanUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${brand} (${cleanUrl})`}
          className="group absolute inset-0 z-30 flex items-end justify-end p-4 focus:outline-none"
        >
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-[#111318]/90 text-[#FFE66D] border-2 border-[#0E1014] shadow-[3px_3px_0px_#0E1014] px-3 py-1 rounded-xs font-mono font-bold text-xs inline-flex items-center gap-1.5">
            <span>Visit {cleanUrl}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>
      )}

      {renderWhitewashHistoryCoat()}
    </div>
  );
};
