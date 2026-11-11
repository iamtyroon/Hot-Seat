import React from 'react';
import { BillboardState, PricePoint } from '../types';

interface LiveRateChartProps {
  billboard: BillboardState;
  priceHistory: PricePoint[];
  isDarkMode?: boolean;
}

export const LiveRateChart: React.FC<LiveRateChartProps> = ({
  billboard,
  priceHistory,
  isDarkMode = false,
}) => {
  const width = 680;
  const height = 196;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const recentPoints = priceHistory.slice(-36);
  const maxRateInView = Math.max(
    16,
    ...recentPoints.map((p) => p.takeoverRateCentsPerMin),
    billboard.nextTakeoverRateCentsPerMin + 4
  );
  const yMax = Math.min(40, Math.ceil(maxRateInView / 4) * 4);
  const yMin = 4.0; // Base rate = 4c/min

  const toY = (rate: number) => {
    const clamped = Math.min(yMax, Math.max(yMin, rate));
    const ratio = (clamped - yMin) / Math.max(1, yMax - yMin);
    return padTop + plotH - ratio * plotH;
  };

  // Historical curve (left 70% of chart)
  const historyW = plotW * 0.7;
  const historyCoords = recentPoints.map((pt, idx) => {
    const x =
      padLeft +
      (recentPoints.length <= 1 ? historyW : (idx / (recentPoints.length - 1)) * historyW);
    const y = toY(pt.rateCentsPerMin);
    return { x, y, pt };
  });

  const historyPath =
    historyCoords.length > 0
      ? historyCoords
          .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ')
      : '';

  const areaPath =
    historyCoords.length > 1
      ? `${historyPath} L ${historyCoords[historyCoords.length - 1].x.toFixed(1)} ${(
          padTop + plotH
        ).toFixed(1)} L ${historyCoords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  // Projected 20-minute Half-Life Cooling Curve (right 30% of chart)
  const projW = plotW * 0.3;
  const startX = padLeft + historyW;
  const currentRate = billboard.currentDecayedRateCentsPerMin;
  const projectionSteps = [0, 2.5, 5, 7.5, 10, 15, 20];
  const projectionCoords = projectionSteps.map((mins) => {
    const x = startX + (mins / 20) * projW;
    const decayed = 4.0 + Math.max(0, currentRate - 4.0) * Math.pow(0.5, mins / 10);
    return { x, y: toY(decayed), mins, decayed };
  });

  const projectionPath = projectionCoords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const yTicks = [4, Math.round((4 + yMax) / 2), yMax];

  const gridLineColor = isDarkMode ? '#1E293B' : '#E2E8F0';
  const axisTextColor = isDarkMode ? '#94A3B8' : '#64748B';
  const nowDividerColor = isDarkMode ? '#475569' : '#94A3B8';
  const coolingStroke = isDarkMode ? '#34D399' : '#059669';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0D1118] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Rate History &amp; 10-Minute Half-Life Cooling
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Base $0.040/min ($0.20 / 5m) · +10% per takeover · $0.400/min cap
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-[#FF4733] inline-block rounded-full" />
            <span>Executed rate</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-0.5 inline-block rounded-full"
              style={{ backgroundColor: coolingStroke }}
            />
            <span>10m half-life decay</span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[196px] select-none"
        >
          <defs>
            <linearGradient id="rateAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF4733" stopOpacity={isDarkMode ? '0.28' : '0.16'} />
              <stop offset="100%" stopColor="#FF4733" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Reference Grid Lines */}
          {yTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={gridLineColor}
                  strokeDasharray={tick === 4 ? undefined : '4 4'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={axisTextColor}
                  className="font-mono text-[10px] tabular-nums"
                >
                  ${(tick / 100).toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Vertical Divider for NOW */}
          <line
            x1={startX}
            y1={padTop}
            x2={startX}
            y2={padTop + plotH}
            stroke={nowDividerColor}
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
          <text
            x={startX}
            y={padTop + plotH + 16}
            textAnchor="middle"
            fill={isDarkMode ? '#F1F5F9' : '#0F172A'}
            className="font-mono text-[10px] font-semibold"
          >
            Now
          </text>
          <text
            x={startX + projW * 0.5}
            y={padTop + plotH + 16}
            textAnchor="middle"
            fill={coolingStroke}
            className="font-mono text-[10px]"
          >
            +10m (½ decay)
          </text>
          <text
            x={startX + projW}
            y={padTop + plotH + 16}
            textAnchor="middle"
            fill={axisTextColor}
            className="font-mono text-[10px]"
          >
            +20m
          </text>

          {/* Historical Area & Line */}
          {areaPath && <path d={areaPath} fill="url(#rateAreaGrad)" />}
          {historyPath && (
            <path
              d={historyPath}
              fill="none"
              stroke="#FF4733"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Projected Cooling Curve */}
          {projectionPath && (
            <path
              d={projectionPath}
              fill="none"
              stroke={coolingStroke}
              strokeWidth="2.2"
              strokeDasharray="4 4"
            />
          )}

          {/* Takeover Event Dots */}
          {historyCoords.map((c, idx) =>
            c.pt.eventLabel === 'TAKEOVER' ? (
              <circle
                key={idx}
                cx={c.x}
                cy={c.y}
                r="3.5"
                fill={isDarkMode ? '#FBBF24' : '#F59E0B'}
                stroke={isDarkMode ? '#0D1118' : '#FFFFFF'}
                strokeWidth="1.5"
              />
            ) : null
          )}

          {/* Current Rate Marker */}
          <circle
            cx={startX}
            cy={toY(currentRate)}
            r="4.5"
            fill="#FF4733"
            stroke={isDarkMode ? '#0D1118' : '#FFFFFF'}
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
};
