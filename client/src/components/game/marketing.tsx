import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Megaphone, TrendingUp, Users, Eye, AlertTriangle, HelpCircle, Share2, Sparkles, Newspaper, Tv, Search, MonitorSmartphone } from "lucide-react";
import { DonutGauge } from "@/components/ui/donut-gauge";
import { Sparkline } from "@/components/ui/sparkline";

interface MarketingProps {
  gameSession: any;
  currentState: any;
}

type PresetId = 'awareness' | 'balanced' | 'conversion';

const marketingChannels = [
  { id: 'social', name: 'Social Media', icon: Share2, description: 'Efficient awareness and conversion; strong with Influencers and Search' },
  { id: 'influencer', name: 'Influencer Marketing', icon: Sparkles, description: 'Highest impact on awareness and intent; expensive; pairs best with Social' },
  { id: 'print', name: 'Printed Ads', icon: Newspaper, description: 'Local/regional awareness support; modest conversion' },
  { id: 'tv', name: 'TV Commercials', icon: Tv, description: 'Very costly broad awareness; low conversion for small brands' },
  { id: 'google_search', name: 'Google Ads (Search)', icon: Search, description: 'High‑intent capture at point of demand; best in sales phases' },
  { id: 'google_display', name: 'Google AdSense', icon: MonitorSmartphone, description: 'Cheap broad awareness; good for retarget with Social/Influencer' },
];

const channelThemes: Record<string, { iconBg: string; iconColor: string; ring: string; gradientFrom: string; gradientTo: string; chipBg: string; chipText: string }> = {
  social: { iconBg: 'bg-sky-100', iconColor: 'text-sky-700', ring: 'ring-sky-100', gradientFrom: 'from-sky-50', gradientTo: 'to-white', chipBg: 'bg-sky-100', chipText: 'text-sky-800' },
  influencer: { iconBg: 'bg-fuchsia-100', iconColor: 'text-fuchsia-700', ring: 'ring-fuchsia-100', gradientFrom: 'from-fuchsia-50', gradientTo: 'to-white', chipBg: 'bg-fuchsia-100', chipText: 'text-fuchsia-800' },
  print: { iconBg: 'bg-amber-100', iconColor: 'text-amber-700', ring: 'ring-amber-100', gradientFrom: 'from-amber-50', gradientTo: 'to-white', chipBg: 'bg-amber-100', chipText: 'text-amber-800' },
  tv: { iconBg: 'bg-purple-100', iconColor: 'text-purple-700', ring: 'ring-purple-100', gradientFrom: 'from-purple-50', gradientTo: 'to-white', chipBg: 'bg-purple-100', chipText: 'text-purple-800' },
  google_search: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', ring: 'ring-emerald-100', gradientFrom: 'from-emerald-50', gradientTo: 'to-white', chipBg: 'bg-emerald-100', chipText: 'text-emerald-800' },
  google_display: { iconBg: 'bg-indigo-100', iconColor: 'text-indigo-700', ring: 'ring-indigo-100', gradientFrom: 'from-indigo-50', gradientTo: 'to-white', chipBg: 'bg-indigo-100', chipText: 'text-indigo-800' },
};

export default function Marketing({ gameSession, currentState }: MarketingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: gameConstants } = useQuery({ queryKey: ['/api/game/constants'], retry: false });

  const currentWeek = Number(currentState?.weekNumber || 1);
  const awarenessNow = Number((currentState as any)?.awareness || 0);
  const intentNow = Number((currentState as any)?.intent || 0);

  // Next-week planning state
  const [marketingSpend, setMarketingSpend] = useState<number>(
    Number((currentState as any)?.plannedMarketingPlan?.totalSpend ?? currentState?.marketingPlan?.totalSpend ?? 0)
  );

  // Presets and default splits
  const defaultSplits: Record<PresetId, Record<string, number>> = {
    awareness:  { influencer: 35, social: 30, google_display: 12, print: 12, google_search: 6, tv: 5 },
    balanced:   { social: 30, google_search: 25, influencer: 20, google_display: 15, print: 5, tv: 5 },
    conversion: { google_search: 30, influencer: 25, social: 25, google_display: 15, print: 3, tv: 2 },
  };

  const recommendedPreset: PresetId = useMemo(() => {
    // Weeks 1–6: Awareness, 7–10: Balanced, 11–15: Conversion
    if (currentWeek >= 1 && currentWeek <= 6) return 'awareness';
    if (currentWeek >= 7 && currentWeek <= 10) return 'balanced';
    return 'conversion';
  }, [currentWeek]);

  const [preset, setPreset] = useState<PresetId>(recommendedPreset);
  const [channelAllocation, setChannelAllocation] = useState<Record<string, number>>(() => ({ ...defaultSplits[recommendedPreset] }));

  // Discounts for next week
  const [discountMode, setDiscountMode] = useState<'none' | 'minimal' | 'standard' | 'aggressive'>(preset === 'conversion' ? 'standard' : 'none');
  const [discountPercent, setDiscountPercent] = useState<number>(preset === 'conversion' ? 15 : 0);

  useEffect(() => {
    setChannelAllocation({ ...defaultSplits[preset] });
    if (preset === 'awareness') { setDiscountMode('none'); setDiscountPercent(0); }
    if (preset === 'balanced') { setDiscountMode('none'); }
    if (preset === 'conversion') { setDiscountMode('standard'); setDiscountPercent(15); }
  }, [preset]);

  const totalAllocation = useMemo(() => Object.values(channelAllocation).reduce((s, v) => s + (Number(v) || 0), 0), [channelAllocation]);

  // Affordability
  const cash = Number(currentState?.cashOnHand || 0);
  const creditLimit = Number(gameConstants?.CREDIT_LIMIT || 0);
  const creditUsed = Number(currentState?.creditUsed || 0);
  const headroom = cash + Math.max(0, creditLimit - creditUsed);

  // Mutations
  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({ title: 'Planned', description: 'Marketing plan applied to next week.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/api/login'; }, 500);
        return;
      }
      toast({ title: 'Error', description: 'Failed to apply plan. Please try again.', variant: 'destructive' });
    },
  });

  const calculateChannelSpend = (channelId: string) => {
    return (marketingSpend * (channelAllocation[channelId] || 0)) / 100;
  };

  const handleChannelAllocationChange = (channelId: string, percentage: number) => {
    setChannelAllocation(prev => ({ ...prev, [channelId]: percentage }));
  };

  const plannedDiscounts = useMemo(() => {
    if (preset === 'awareness') return { jacket: 0, dress: 0, pants: 0 };
    if (preset === 'balanced') {
      if (discountMode === 'none') return { jacket: 0, dress: 0, pants: 0 };
      const d = discountPercent / 100; return { jacket: d, dress: d, pants: d };
    }
    // conversion
    if (discountMode === 'none') return { jacket: 0, dress: 0, pants: 0 };
    const d = discountPercent / 100; return { jacket: d, dress: d, pants: d };
  }, [preset, discountMode, discountPercent]);

  // TV inefficiency indicator (engine will waste TV if spend<£200k or TV share<10%)
  const tvInefficient = useMemo(() => {
    const tvPct = Number(channelAllocation['tv'] || 0);
    const hasSpend = marketingSpend > 0 && tvPct > 0;
    return hasSpend && (marketingSpend < 200000 || tvPct < 10);
  }, [channelAllocation, marketingSpend]);

  // Recommended efficient zones by preset and channel (percent ranges)
  const getEfficientRange = (p: PresetId, channelId: string): [number, number] => {
    const map: Record<PresetId, Record<string, [number, number]>> = {
      awareness: {
        influencer: [25, 45],
        social: [25, 40],
        google_display: [10, 20],
        print: [8, 15],
        google_search: [3, 8],
        tv: [5, 15],
      },
      balanced: {
        social: [25, 35],
        google_search: [20, 30],
        influencer: [15, 25],
        google_display: [10, 20],
        print: [5, 10],
        tv: [3, 10],
      },
      conversion: {
        google_search: [25, 35],
        influencer: [20, 30],
        social: [20, 30],
        google_display: [10, 20],
        print: [0, 5],
        tv: [0, 5],
      },
    };
    return map[p][channelId] || [0, 0];
  };

  const floorWarnings = useMemo(() => {
    const manuf = gameConstants?.MANUFACTURING || {};
    const pd = currentState?.productData || {};
    const prods: Array<'jacket'|'dress'|'pants'> = ['jacket','dress','pants'];
    const list: string[] = [];
    prods.forEach((p) => {
      const rrp = Number(pd?.[p]?.rrp || 0);
      const salePrice = rrp * (1 - (plannedDiscounts[p] || 0));
      const confirmed = Number(pd?.[p]?.confirmedMaterialCost || 0);
      const prodCost = Number((manuf as any)[p]?.inHouseCost || 0);
      if (rrp && salePrice < 1.05 * (confirmed + prodCost)) list.push(p);
    });
    return list;
  }, [plannedDiscounts, currentState?.productData, gameConstants]);

  const handleApplyNextWeek = () => {
    if (Math.round(totalAllocation) !== 100) {
      toast({ title: 'Allocation must be 100%', description: 'Adjust channel percentages to total 100%.', variant: 'destructive' });
      return;
    }
    if (marketingSpend > headroom) {
      toast({ title: 'Insufficient funds', description: 'Budget exceeds available cash + credit headroom.', variant: 'destructive' });
      return;
    }
    const channelsArray = marketingChannels.map((c) => ({ name: c.id, spend: calculateChannelSpend(c.id) }));
    const updates: any = { plannedMarketingPlan: { totalSpend: marketingSpend, channels: channelsArray }, plannedWeeklyDiscounts: plannedDiscounts };
    updateStateMutation.mutate(updates);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Marketing</h1>
        <p className="text-gray-600">Plan next week. See last week outcomes and cumulative results.</p>
      </div>

      {/* Gauges */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Awareness • Intent to Buy • Demand</CardTitle>
          <p className="text-sm text-gray-600">These indicators summarize how well people know about your brand (Awareness), how ready they are to purchase (Intent to Buy), and the units sold last week (Demand). Adjust your plan below and apply it to next week.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="flex items-center gap-3">
              <DonutGauge value={Number.isFinite(awarenessNow)?awarenessNow:undefined} colorClass="stroke-blue-500" />
              <TooltipWrapper content="Awareness: how many people have heard about your product. Builds slowly with broad‑reach channels (Social, Influencers, Print/TV). Higher awareness enables faster growth in intent.">
                <div>
                  <div className="text-sm text-gray-700">Awareness</div>
                  <div className="text-xs text-gray-500">Long‑term visibility</div>
                </div>
              </TooltipWrapper>
            </div>
            <div className="flex items-center gap-3">
              <DonutGauge value={Number.isFinite(intentNow)?intentNow:undefined} colorClass="stroke-emerald-500" />
              <TooltipWrapper content="Intent to Buy: readiness to purchase. Grows faster when awareness is already high and you focus on performance channels (Search) or promotions. Volatile if discounts change erratically.">
                <div>
                  <div className="text-sm text-gray-700">Intent to Buy</div>
                  <div className="text-xs text-gray-500">Short‑term purchase motivation</div>
                </div>
              </TooltipWrapper>
            </div>
            <div>
              <div className="text-sm text-gray-700 mb-1 flex items-center gap-1">
                Demand (units, last week)
                <TooltipWrapper content="Demand: units sold last week. Driven by Awareness × Intent and pricing (discounts). With no marketing activity, sales trend toward a low baseline.">
                  <span className="text-gray-400">?</span>
                </TooltipWrapper>
              </div>
              <div className="text-xs text-gray-600 mb-1">{Number(currentState?.weeklyDemand?.jacket||0)+Number(currentState?.weeklyDemand?.dress||0)+Number(currentState?.weeklyDemand?.pants||0)} units</div>
              <Sparkline points={[]} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Next Week */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Plan Next Week</CardTitle>
          <p className="text-sm text-gray-600">Set budget and preset, then fine‑tune split. Apply to next week.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Total Budget (£)</Label>
              <Input type="number" value={marketingSpend} onChange={(e)=> setMarketingSpend(Math.max(0, Number(e.target.value||0)))} />
              <div className="text-xs text-gray-500">Affordable headroom now: {formatCurrency(headroom)}</div>
              {marketingSpend > headroom && (<div className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12}/> Exceeds affordable headroom</div>)}
            </div>
            <div className="space-y-2">
              <Label>Preset</Label>
              <div className="flex gap-2 flex-wrap">
                {(['awareness','balanced','conversion'] as PresetId[]).map(p => (
                  <Button key={p} variant={preset===p?'default':'outline'} onClick={()=> setPreset(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</Button>
                ))}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-1"><HelpCircle size={12}/> Recommended for next week: {recommendedPreset.charAt(0).toUpperCase()+recommendedPreset.slice(1)}</div>
            </div>
            <div className="space-y-2">
              <Label>Discounts (next week)</Label>
              {preset === 'awareness' && (<div className="text-sm text-gray-600">Hidden during Awareness.</div>)}
              {preset !== 'awareness' && (
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Button variant={discountMode==='none'?'default':'outline'} onClick={()=>{ setDiscountMode('none'); setDiscountPercent(0); }}>None</Button>
                    <Button variant={discountMode==='minimal'?'default':'outline'} onClick={()=>{ setDiscountMode('minimal'); setDiscountPercent(10); }}>Minimal</Button>
                    <Button variant={discountMode==='standard'?'default':'outline'} onClick={()=>{ setDiscountMode('standard'); setDiscountPercent(15); }}>Standard</Button>
                    <Button variant={discountMode==='aggressive'?'default':'outline'} onClick={()=>{ setDiscountMode('aggressive'); setDiscountPercent(35); }}>Aggressive</Button>
                  </div>
                  {discountMode!=='none' && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-600"><span>Discount %</span><span>{discountPercent}%</span></div>
                      {(() => {
                        let min = 1, max = 100;
                        if (discountMode==='minimal') { min = 1; max = 10; }
                        if (discountMode==='standard') { min = 11; max = 29; }
                        if (discountMode==='aggressive') { min = 30; max = 100; }
                        // Keep value within mode bounds automatically
                        if (discountPercent < min) setDiscountPercent(min);
                        if (discountPercent > max) setDiscountPercent(max);
                        return (
                          <input type="range" min={min} max={max} step={1} value={discountPercent} onChange={(e)=> setDiscountPercent(Number(e.target.value))} className="w-full" />
                        );
                      })()}
                      {floorWarnings.length>0 && (<div className="text-xs text-red-600 mt-1">Below cost risk: {floorWarnings.join(', ')}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Allocation (percent split) */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Channel Split</CardTitle>
          <p className="text-sm text-gray-600">Allocate percent split (must total 100%).</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {marketingChannels.map((channel) => {
              const Icon = channel.icon;
              const pct = Number(channelAllocation[channel.id] || 0);
              return (
                <div key={channel.id} className={`rounded-xl p-4 border border-gray-200 ring-1 ${channelThemes[channel.id]?.ring || ''} bg-gradient-to-br ${channelThemes[channel.id]?.gradientFrom || 'from-white'} ${channelThemes[channel.id]?.gradientTo || 'to-white'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${channelThemes[channel.id]?.iconBg || 'bg-gray-100'}`}>
                        <Icon className={`${channelThemes[channel.id]?.iconColor || 'text-gray-700'}`} size={18}/>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {channel.name}
                          <TooltipWrapper content={channel.description}><span className="text-gray-400">?</span></TooltipWrapper>
                        </div>
                        <div className="text-xs text-gray-600">{channel.description}</div>
                      </div>
                    </div>
                    <div className={`hidden sm:block rounded-full px-2 py-0.5 text-xs font-medium ${channelThemes[channel.id]?.chipBg || 'bg-gray-100'} ${channelThemes[channel.id]?.chipText || 'text-gray-800'}`}>{pct.toFixed(0)}%</div>
                  </div>
                  <div className="relative">
                    {(() => {
                      const [min, max] = getEfficientRange(preset, channel.id);
                      const left = Math.max(0, Math.min(100, min));
                      const width = Math.max(0, Math.min(100, max - min));
                      return (
                        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-green-200/80 rounded"
                             style={{ left: `${left}%`, width: `${width}%` }} />
                      );
                    })()}
                    <Slider value={[pct]} min={0} max={100} step={5} onValueChange={(v)=> handleChannelAllocationChange(channel.id, v[0] || 0)} />
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0%</span><span>Efficient zone</span><span>100%</span></div>
                  </div>
                  <div className="text-right font-mono mt-1 sm:hidden">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
            <div className="text-sm flex items-center justify-between col-span-1 xl:col-span-2 mt-1">
              <div>Total allocation: {totalAllocation.toFixed(1)}%</div>
              {Math.round(totalAllocation) !== 100 && (<div className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> Must be 100%</div>)}
              {tvInefficient && (<div className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> TV budget likely wasted at this level</div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions (sticky footer) */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur border-t border-gray-200 pt-4 flex items-center gap-3">
        <Button onClick={handleApplyNextWeek} disabled={updateStateMutation.isPending || Math.round(totalAllocation)!==100 || marketingSpend>headroom}>
          {updateStateMutation.isPending ? 'Applying...' : 'Apply to Next Week'}
        </Button>
        <Button variant="outline" onClick={()=> { setPreset(recommendedPreset); setChannelAllocation({ ...defaultSplits[recommendedPreset] }); setDiscountMode('none'); setDiscountPercent(0); }}>Reset to Preset</Button>
      </div>
    </div>
  );
}
