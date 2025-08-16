import React from 'react';

interface DonutGaugeProps {
  value?: number; // actual 0..100
  forecast?: number; // forecast 0..100 (drawn as semi-opaque continuation)
  colorClass?: string; // tailwind stroke color e.g. 'stroke-blue-500'
  size?: number; // px
  showNumeric?: boolean; // optionally show number in center
}

export function DonutGauge({ value, forecast, colorClass = 'stroke-blue-500', size = 104, showNumeric = false }: DonutGaugeProps) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number.isFinite(value as number) ? (value as number) : 0));
  const fPct = Math.max(0, Math.min(100, Number.isFinite(forecast as number) ? (forecast as number) : 0));
  const dash = (pct / 100) * circumference;
  const remainder = circumference - dash;
  const fDashFull = (Math.max(pct, fPct) / 100) * circumference;
  const fRemainderFull = circumference - fDashFull;
  const isDecay = Number.isFinite(forecast as number) && Number.isFinite(value as number) && (fPct < pct);
  // For decay, draw only the delta segment (from forecast to current) on top so it can't be hidden
  const decayDash = ((pct - fPct) / 100) * circumference;
  const decayOffset = (fPct / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
        <g transform="translate(60,60)">
          <circle r={radius} className="stroke-gray-200" strokeWidth={12} fill="none" />
          <circle
            r={radius}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-500`}
            strokeWidth={12}
            fill="none"
            strokeDasharray={`${dash} ${remainder}`}
            transform="rotate(-90)"
          />
          {/* Forecast arc: semi-opaque in growth; for decay, draw only the red delta segment on top */}
          {Number.isFinite(forecast as number) && !isDecay && (
            <circle
              r={radius}
              strokeLinecap="round"
              className={`${colorClass} opacity-50 transition-all duration-500`}
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${fDashFull} ${fRemainderFull}`}
              transform="rotate(-90)"
            />
          )}
          {Number.isFinite(forecast as number) && isDecay && decayDash > 0 && (
            <circle
              r={radius}
              strokeLinecap="round"
              className={`stroke-red-500 transition-all duration-500`}
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${decayDash} ${circumference - decayDash}`}
              strokeDashoffset={decayOffset}
              transform="rotate(-90)"
            />
          )}
          {showNumeric && (
            <text textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 text-sm font-semibold">
              {Number.isFinite(value as number) ? `${Math.round(pct)}` : '—'}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}


