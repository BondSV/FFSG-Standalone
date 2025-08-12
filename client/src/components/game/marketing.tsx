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
import { Megaphone, TrendingUp, Users, Eye, AlertTriangle, Gauge, HelpCircle } from "lucide-react";

interface MarketingProps {
  gameSession: any;
  currentState: any;
}

type PresetId = 'awareness' | 'balanced' | 'conversion';

const marketingChannels = [
  { id: 'social', name: 'Social Media', icon: Users, description: 'Efficient awareness and conversion; strong with Influencers and Search' },
  { id: 'influencer', name: 'Influencer Marketing', icon: TrendingUp, description: 'Highest impact on awareness and intent; expensive; pairs best with Social' },
  { id: 'print', name: 'Printed Ads', icon: Eye, description: 'Local/regional awareness support; modest conversion' },
  { id: 'tv', name: 'TV Commercials', icon: Megaphone, description: 'Very costly broad awareness; low conversion for small brands' },
  { id: 'google_search', name: 'Google Ads (Search)', icon: TrendingUp, description: 'High‑intent capture at point of demand; best in sales phases' },
  { id: 'google_display', name: 'Google AdSense', icon: Eye, description: 'Cheap broad awareness; good for retarget with Social/Influencer' },
];

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
    if (currentWeek >= 2 && currentWeek <= 6) return 'awareness';
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
    return marketingSpend < 200000 || tvPct < 10;
  }, [channelAllocation, marketingSpend]);

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
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge size={16}/> Awareness • Intent • Demand</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {label:'Awareness', value: awarenessNow},
              {label:'Intent', value: intentNow},
              {label:'Demand (units, last week)', value: Number(currentState?.weeklyDemand?.jacket||0)+Number(currentState?.weeklyDemand?.dress||0)+Number(currentState?.weeklyDemand?.pants||0)}
            ].map((g, i)=> (
              <div key={i} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{g.label}</span>
                  {i<2 && <span>{Math.round(g.value)}/100</span>}
                </div>
                <div className="mt-2 w-full bg-gray-200 h-2 rounded-full">
                  <div className={`h-2 rounded-full ${i===0? 'bg-blue-500': i===1? 'bg-emerald-500': 'bg-indigo-500'}`} style={{ width: `${Math.min(100, i<2 ? g.value : 100)}%` }} />
                </div>
                {i===2 && <div className="mt-1 text-xs text-gray-600">{Number(g.value||0).toLocaleString()} units</div>}
              </div>
            ))}
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
              <div className="text-xs text-gray-500 flex items-center gap-1"><HelpCircle size={12}/> Recommended this week: {recommendedPreset.charAt(0).toUpperCase()+recommendedPreset.slice(1)}</div>
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
          <div className="space-y-6">
            {marketingChannels.map((channel) => {
              const Icon = channel.icon;
              const pct = Number(channelAllocation[channel.id] || 0);
              return (
                <div key={channel.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary bg-opacity-10 rounded-lg"><Icon className="text-primary" size={18}/></div>
                      <div>
                        <div className="font-medium text-gray-900">{channel.name}</div>
                        <div className="text-xs text-gray-600">{channel.description}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Slider value={[pct]} min={0} max={100} step={5} onValueChange={(v)=> handleChannelAllocationChange(channel.id, v[0] || 0)} />
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0%</span><span>Efficient zone</span><span>100%</span></div>
                  </div>
                  <div className="text-right font-mono mt-1">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
            <div className="text-sm flex items-center justify-between">
              <div>Total allocation: {totalAllocation.toFixed(1)}%</div>
              {Math.round(totalAllocation) !== 100 && (<div className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> Must be 100%</div>)}
              {tvInefficient && (<div className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> TV budget likely wasted at this level</div>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleApplyNextWeek} disabled={updateStateMutation.isPending || Math.round(totalAllocation)!==100 || marketingSpend>headroom}>
          {updateStateMutation.isPending ? 'Applying...' : 'Apply to Next Week'}
        </Button>
        <Button variant="outline" onClick={()=> { setPreset(recommendedPreset); setChannelAllocation({ ...defaultSplits[recommendedPreset] }); setDiscountMode('none'); setDiscountPercent(0); }}>Reset to Preset</Button>
      </div>
    </div>
  );
}
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
import { Megaphone, TrendingUp, Users, Eye, AlertTriangle, Gauge, HelpCircle } from "lucide-react";

interface MarketingProps {
  gameSession: any;
  currentState: any;
}

const marketingChannels = [
  {
    id: 'social',
    name: 'Social Media',
    icon: Users,
    costPer1000: 7,
    conversionRate: 0.002,
    description: 'Instagram, TikTok, Facebook campaigns',
  },
  {
    id: 'influencer',
    name: 'Influencer Marketing',
    icon: TrendingUp,
    costPer1000: 20,
    conversionRate: 0.0057,
    description: 'Partnerships with fashion influencers',
  },
  {
    id: 'print',
    name: 'Printed Ads',
    icon: Eye,
    costPer1000: 8,
    conversionRate: 0.002,
    description: 'Magazines and print publications',
  },
  {
    id: 'tv',
    name: 'TV Commercials',
    icon: Megaphone,
    costPer1000: 26,
    conversionRate: 0.002,
    description: 'Television advertising spots',
  },
  {
    id: 'google_search',
    name: 'Google Ads (Search)',
    icon: TrendingUp,
    costPer1000: 9.5,
    conversionRate: 0.0027,
    description: 'Search engine marketing',
  },
  {
    id: 'google_display',
    name: 'Google AdSense',
    icon: Eye,
    costPer1000: 1.5,
    conversionRate: 0.00042,
    description: 'Display network advertising',
  },
];

const products = ['jacket', 'dress', 'pants'];

export default function Marketing({ gameSession, currentState }: MarketingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: gameConstants } = useQuery({ queryKey: ['/api/game/constants'], retry: false });
  
  const [marketingSpend, setMarketingSpend] = useState(
    Number(currentState?.marketingSpend || 0)
  );
  
  const [weeklyDiscounts, setWeeklyDiscounts] = useState(() => {
    const discounts = currentState?.weeklyDiscounts || {};
    return {
      jacket: discounts.jacket || 0,
      dress: discounts.dress || 0,
      pants: discounts.pants || 0,
    };
  });

  const [channelAllocation, setChannelAllocation] = useState(() => {
    const totalChannels = marketingChannels.length;
    const equalShare = 100 / totalChannels;
    return marketingChannels.reduce((acc, channel) => {
      acc[channel.id] = equalShare;
      return acc;
    }, {} as Record<string, number>);
  });

  const [projectedDemand, setProjectedDemand] = useState<Record<string, number>>({ jacket: 0, dress: 0, pants: 0 });
  const [projectedSales, setProjectedSales] = useState<Record<string, number>>({ jacket: 0, dress: 0, pants: 0 });
  const [violations, setViolations] = useState<{ floor: string[]; positioning: string[] }>({ floor: [], positioning: [] });
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({ title: 'Planned', description: 'Marketing plan applied to next week.' });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApplyNextWeek = () => {
    const totalPct = Object.values(channelAllocation).reduce((s, v) => s + (Number(v) || 0), 0);
    if (Math.round(totalPct) !== 100) {
      toast({ title: 'Allocation must be 100%', description: 'Adjust channel percentages to total 100%.', variant: 'destructive' });
      return;
    }
    const channelsArray = marketingChannels.map((c) => ({ name: c.id, spend: calculateChannelSpend(c.id) }));
    const updates: any = { plannedMarketingPlan: { totalSpend: marketingSpend, channels: channelsArray } };
    updateStateMutation.mutate(updates);
  };

  const handleDiscountChange = (product: string, discount: number) => {
    setWeeklyDiscounts(prev => ({
      ...prev,
      [product]: discount,
    }));
  };

  const handleChannelAllocationChange = (channelId: string, percentage: number) => {
    setChannelAllocation(prev => {
      const next = { ...prev, [channelId]: percentage } as Record<string, number>;
      // Enforce total exactly 100% by scaling others proportionally if over/underflows
      const total = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
      if (total === 100) return next;
      const keys = Object.keys(next);
      const remainderKeys = keys.filter(k => k !== channelId);
      const remainderTotal = remainderKeys.reduce((s, k) => s + (Number(prev[k]) || 0), 0) || 1;
      const targetRemainder = 100 - (Number(next[channelId]) || 0);
      const adjusted: Record<string, number> = { ...next };
      remainderKeys.forEach(k => {
        const share = (Number(prev[k]) || 0) / remainderTotal;
        adjusted[k] = Math.max(0, Math.min(100, Number((targetRemainder * share).toFixed(1))));
      });
      return adjusted;
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const calculateChannelSpend = (channelId: string) => {
    return (marketingSpend * (channelAllocation[channelId] || 0)) / 100;
  };

  const calculateExpectedReach = (channelId: string) => {
    const channel = marketingChannels.find(c => c.id === channelId);
    if (!channel) return 0;
    const spend = calculateChannelSpend(channelId);
    return Math.round((spend / channel.costPer1000) * 1000);
  };

  const cash = Number(currentState?.cashOnHand || 0);
  const creditLimit = Number(gameConstants?.CREDIT_LIMIT || 0);
  const creditUsed = Number(currentState?.creditUsed || 0);
  const headroom = cash + Math.max(0, creditLimit - creditUsed);

  const isWeekInSalesPhase = () => {
    const week = currentState?.weekNumber || 1;
    return week >= 7 && week <= 12;
  };

  const currentWeek = currentState?.weekNumber || 1;

  // Compute totals and constraints
  const totalAllocation = useMemo(() => Object.values(channelAllocation).reduce((s, v) => s + (Number(v) || 0), 0), [channelAllocation]);
  const productData = currentState?.productData || {};
  const finishedGoodsLots = (currentState?.finishedGoods?.lots || []) as Array<any>;
  const availableFGByProduct = useMemo(() => {
    const byP: Record<string, number> = { jacket: 0, dress: 0, pants: 0 };
    finishedGoodsLots.forEach((l) => { byP[l.product] = (byP[l.product] || 0) + Number(l.quantity || 0); });
    return byP;
  }, [finishedGoodsLots]);

  // Auto-save on change with debounce to ensure commit uses latest
  useEffect(() => {
    if (!isWeekInSalesPhase()) return;
    setIsAutoSaving(true);
    const t = setTimeout(() => {
      const channelsArray = marketingChannels.map((c) => ({ name: c.id, spend: calculateChannelSpend(c.id) }));
      apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, {
        marketingSpend: marketingSpend.toString(),
        marketingPlan: { totalSpend: marketingSpend, channels: channelsArray },
        weeklyDiscounts,
        marketingChannels: channelAllocation,
      }).finally(() => setIsAutoSaving(false));
    }, 400);
    return () => clearTimeout(t);
  }, [marketingSpend, JSON.stringify(weeklyDiscounts), JSON.stringify(channelAllocation)]);

  // Real-time demand projections per product
  useEffect(() => {
    const fetchDemand = async () => {
      const prods = ['jacket', 'dress', 'pants'];
      const results: Record<string, number> = {};
      await Promise.all(prods.map(async (p) => {
        const d = weeklyDiscounts[p as keyof typeof weeklyDiscounts] || 0;
        const rrp = Number(productData?.[p]?.rrp || 0);
        const hasPrint = Boolean(productData?.[p]?.hasPrint);
        if (!rrp) { results[p] = 0; return; }
        try {
          const res = await apiRequest('POST', '/api/game/calculate-demand', {
            product: p,
            week: currentWeek,
            rrp,
            discount: d / 100,
            marketingSpend,
            hasPrint,
          });
          const { demand } = await res.json();
          results[p] = Number(demand || 0);
        } catch {
          results[p] = 0;
        }
      }));
      setProjectedDemand(results);
      setProjectedSales({
        jacket: Math.min(results['jacket'] || 0, availableFGByProduct['jacket'] || 0),
        dress: Math.min(results['dress'] || 0, availableFGByProduct['dress'] || 0),
        pants: Math.min(results['pants'] || 0, availableFGByProduct['pants'] || 0),
      });
    };
    fetchDemand();
  }, [marketingSpend, weeklyDiscounts, currentWeek, productData, availableFGByProduct]);

  // Validate price floor and positioning penalty
  useEffect(() => {
    const floorViolations: string[] = [];
    const positioningWarnings: string[] = [];
    const manuf = gameConstants?.MANUFACTURING || {};
    (['jacket', 'dress', 'pants'] as const).forEach((p) => {
      const rrp = Number(productData?.[p]?.rrp || 0);
      const discountPct = Number(weeklyDiscounts[p] || 0);
      const salePrice = rrp * (1 - discountPct / 100);
      const confirmed = Number(productData?.[p]?.confirmedMaterialCost || 0);
      const prodCost = Number((manuf as any)[p]?.inHouseCost || 0);
      if (rrp && salePrice < 1.05 * (confirmed + prodCost)) {
        floorViolations.push(p);
      }
      const hm = Number(gameConstants?.PRODUCTS?.[p]?.hmPrice || 1);
      const x = rrp / hm - 1;
      const positioningEffect = 1 + (0.8 / (1 + Math.exp(-(-50) * (x - 0.20)))) - 0.4;
      if (positioningEffect < 0.85) positioningWarnings.push(p);
    });
    setViolations({ floor: floorViolations, positioning: positioningWarnings });
  }, [weeklyDiscounts, productData, gameConstants]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Marketing & Promotions</h1>
        <p className="text-gray-600">
          {isWeekInSalesPhase() 
            ? "Manage your weekly marketing spend and promotional discounts" 
            : "Plan your marketing strategy for the sales phase (Weeks 7-12)"
          }
        </p>
      </div>

      {/* Gauges */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge size={16}/> Awareness • Intent • Demand</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {label:'Awareness', value: Number((currentState as any)?.awareness||0)},
              {label:'Intent', value: Number((currentState as any)?.intent||0)},
              {label:'Demand (units, last week)', value: Number(currentState?.weeklyDemand?.jacket||0)+Number(currentState?.weeklyDemand?.dress||0)+Number(currentState?.weeklyDemand?.pants||0)}
            ].map((g, i)=> (
              <div key={i} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{g.label}</span>
                  {i<2 && <span>{Math.round(g.value)}/100</span>}
            </div>
                <div className="mt-2 w-full bg-gray-200 h-2 rounded-full">
                  <div className={`h-2 rounded-full ${i===0? 'bg-blue-500': i===1? 'bg-emerald-500': 'bg-indigo-500'}`} style={{ width: `${Math.min(100, i<2 ? g.value : 100)}%` }} />
            </div>
                {i===2 && <div className="mt-1 text-xs text-gray-600">{Number(g.value||0).toLocaleString()} units</div>}
            </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plan Next Week */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Plan Next Week</CardTitle>
          <p className="text-sm text-gray-600">Set budget and channel split. Apply to next week.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="marketing-spend">Total Budget (£)</Label>
              <Input
                id="marketing-spend"
                type="number"
                value={marketingSpend}
                onChange={(e) => setMarketingSpend(Number(e.target.value))}
                placeholder="0"
                className="mt-1"
              />
              {marketingSpend <= 0 && (<div className="text-xs text-yellow-700 mt-1">Zero marketing next week may depress demand.</div>)}
            </div>
            
            {/* Visual indicator */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Budget Level</span>
                <span className={
                  marketingSpend < 100000 ? "text-red-600" :
                  marketingSpend < 200000 ? "text-yellow-600" :
                  marketingSpend <= 300000 ? "text-green-600" :
                  "text-accent"
                }>
                  {marketingSpend < 100000 ? "Low" :
                   marketingSpend < 200000 ? "Below Average" :
                   marketingSpend <= 300000 ? "Optimal" :
                   "High"}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    marketingSpend < 100000 ? "bg-red-500" :
                    marketingSpend < 200000 ? "bg-yellow-500" :
                    marketingSpend <= 300000 ? "bg-green-500" :
                    "bg-accent"
                  }`}
                  style={{ width: `${Math.min((marketingSpend / 400000) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {marketingSpend === 0 && isWeekInSalesPhase() && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Zero marketing spend may significantly reduce demand this week
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Channel Allocation */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Channel Split</CardTitle>
          <p className="text-sm text-gray-600">Allocate percent split (must total 100%).</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {marketingChannels.map((channel) => {
              const ChannelIcon = channel.icon;
              
              return (
                <div key={channel.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary bg-opacity-10 rounded-lg">
                        <ChannelIcon className="text-primary" size={20} />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{channel.name}</h3>
                        <p className="text-sm text-gray-600">{channel.description}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Allocation: {(channelAllocation[channel.id] || 0).toFixed(1)}%</span>
                      <span className="text-gray-500">Efficient zone</span>
                    </div>
                    <Slider
                      value={[channelAllocation[channel.id] || 0]}
                      onValueChange={([value]) => handleChannelAllocationChange(channel.id, value)}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })}
            <div className="text-sm flex items-center justify-between">
              <div>Total allocation: {totalAllocation.toFixed(1)}%</div>
              {Math.abs(totalAllocation - 100) > 1 && (
                <div className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> Must be 100%</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Discounts */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>
            <TooltipWrapper content="Apply a temporary discount to your locked RRP for one week. This is a powerful tool to boost sales, but it will lower your profit margin for that week.">
              <span className="cursor-help">Weekly Discount Strategy</span>
            </TooltipWrapper>
          </CardTitle>
          <p className="text-sm text-gray-600">Set temporary discounts for each product this week</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {products.map((product) => {
              const productName = product === 'jacket' ? 'Vintage Denim Jacket' : 
                                 product === 'dress' ? 'Floral Print Dress' : 'Corduroy Pants';
              const rrp = Number(productData?.[product]?.rrp || 0);
              const salePrice = rrp * (1 - (weeklyDiscounts[product as keyof typeof weeklyDiscounts] || 0) / 100);
              const isFloorViolation = violations.floor.includes(product);
              const isPositioningPenalty = violations.positioning.includes(product);
              const projDemand = projectedDemand[product] || 0;
              const projSales = projectedSales[product] || 0;
              
              return (
                <div key={product} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">{productName}</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`${product}-discount`}>Discount %</Label>
                      <Input
                        id={`${product}-discount`}
                        type="number"
                        min="0"
                        max="50"
                        value={weeklyDiscounts[product as keyof typeof weeklyDiscounts]}
                        onChange={(e) => handleDiscountChange(product, Number(e.target.value))}
                        placeholder="0"
                        className="mt-1"
                        disabled={!isWeekInSalesPhase()}
                      />
                      {isFloorViolation && (
                        <div className="text-xs text-red-600 mt-1">Sale price below 105% of cost floor</div>
                      )}
                      {isPositioningPenalty && (
                        <div className="text-xs text-yellow-700 mt-1">Positioning penalty exceeds 15%</div>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Current RRP: £{rrp ? rrp.toFixed(2) : '—'}</p>
                      <p>Sale Price: £{salePrice ? salePrice.toFixed(2) : '—'}</p>
                      <p className="mt-1">Projected demand: {projDemand.toLocaleString()}</p>
                      <p>Projected units sold (cap FG): {projSales.toLocaleString()} / {availableFGByProduct[product].toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="text-sm text-gray-600">
          {isWeekInSalesPhase() ? (
            <span>Week {currentWeek} - Sales Phase Active</span>
          ) : (
            <span>Sales phase begins Week 7</span>
          )}
        </div>
        <div className="flex space-x-3">
          <Button onClick={handleApplyNextWeek} disabled={updateStateMutation.isPending}>
            {updateStateMutation.isPending ? 'Applying...' : 'Apply to Next Week'}
          </Button>
        </div>
      </div>
    </div>
  );
}
