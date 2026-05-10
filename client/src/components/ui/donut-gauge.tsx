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
  // Start the red segment exactly at the forecast arc end so it overlays the tail of the current fill
  const decayOffset = circumference * (1 - (fPct / 100));
  // For growth, draw only the positive delta segment (from current to forecast)
  const growthDash = ((fPct - pct) / 100) * circumference;
  const growthOffset = circumference * (1 - (pct / 100));
  const hasForecast = Number.isFinite(forecast as number);
  const delta = fPct - pct;
  const numericValue = hasForecast ? fPct : pct;
  const numericClass = hasForecast
    ? delta >= 0 ? 'fill-green-600' : 'fill-red-600'
    : 'fill-gray-900';
  const formatGaugeValue = (n: number) => n >= 100 ? `${Math.round(n)}` : n.toFixed(1);

  const svgKey = `dg-${pct}-${fPct}-${isDecay ? 'decay' : 'growth'}`;
  return (
    <div className="flex items-center gap-3">
      <svg key={svgKey} width={size} height={size} viewBox="0 0 120 120" className="shrink-0">
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
          {Number.isFinite(forecast as number) && !isDecay && growthDash > 0 && (
            <circle
              key={`growth-${Math.round(growthDash)}-${Math.round(growthOffset)}`}
              r={radius}
              strokeLinecap="round"
              className={`stroke-green-500 opacity-50 transition-all duration-500`}
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${growthDash} ${circumference - growthDash}`}
              strokeDashoffset={growthOffset}
              transform="rotate(-90)"
            />
          )}
          {Number.isFinite(forecast as number) && isDecay && decayDash > 0 && (
            <circle
              key={`decay-${Math.round(decayDash)}-${Math.round(decayOffset)}`}
              r={radius}
              strokeLinecap="round"
              className={`stroke-red-500 opacity-75 transition-all duration-500`}
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${decayDash} ${circumference - decayDash}`}
              strokeDashoffset={decayOffset}
              transform="rotate(-90)"
            />
          )}
          {showNumeric && (
            <text textAnchor="middle" dominantBaseline="middle" className={`${numericClass} text-sm font-semibold`}>
              <tspan x="0" y={hasForecast ? -4 : 0}>{Number.isFinite(numericValue) ? formatGaugeValue(numericValue) : '—'}</tspan>
              {hasForecast && Math.abs(delta) >= 0.05 && (
                <tspan x="0" y="14" className={`${delta >= 0 ? 'fill-green-600' : 'fill-red-600'} text-[10px] font-medium`}>
                  {`${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
                </tspan>
              )}
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}

