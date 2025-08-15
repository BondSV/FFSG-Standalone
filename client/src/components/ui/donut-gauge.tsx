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
  const fDash = (Math.max(pct, fPct) / 100) * circumference;
  const fRemainder = circumference - fDash;
  const isDecay = Number.isFinite(forecast as number) && Number.isFinite(value as number) && (fPct < pct);

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
        <g transform="translate(60,60)">
          <circle r={radius} className="stroke-gray-200" strokeWidth={12} fill="none" />
          {/* Forecast arc: semi-opaque in normal case; solid red for decay */}
          {Number.isFinite(forecast as number) && (
            <circle
              r={radius}
              strokeLinecap="round"
              className={`${isDecay ? 'stroke-red-500' : colorClass} ${isDecay ? '' : 'opacity-50'} transition-all duration-500`}
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${fDash} ${fRemainder}`}
              transform="rotate(-90)"
            />
          )}
          <circle
            r={radius}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-500`}
            strokeWidth={12}
            fill="none"
            strokeDasharray={`${dash} ${remainder}`}
            transform="rotate(-90)"
          />
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


