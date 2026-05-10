import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { AlertTriangle, HelpCircle, Share2, Newspaper, Tv, Search, MonitorSmartphone, User, GraduationCap } from "lucide-react";
import { DonutGauge } from "@/components/ui/donut-gauge";
import { Sparkline } from "@/components/ui/sparkline";

interface MarketingProps {
  gameSession: any;
  currentState: any;
}

type PresetId = 'awareness' | 'balanced' | 'conversion';
type CampaignComponentId = 'social' | 'influencer' | 'google_display' | 'google_search' | 'print' | 'tv';
type SplitSource = 'preset' | 'components' | 'manual';

const marketingChannels = [
  { id: 'social', name: 'Social Media', icon: Share2, description: 'Efficient awareness and conversion; strong with Influencers and Search' },
  { id: 'influencer', name: 'Influencer Marketing', icon: User, description: 'Highest impact on awareness and intent; expensive; pairs best with Social' },
  { id: 'print', name: 'Printed Ads', icon: Newspaper, description: 'Local/regional awareness support; modest conversion' },
  { id: 'tv', name: 'TV Commercials', icon: Tv, description: 'Very costly broad awareness; low conversion for small brands and low budgets' },
  { id: 'google_search', name: 'Google Ads (Search)', icon: Search, description: 'High‑intent capture at point of demand; best in sales phases' },
  { id: 'google_display', name: 'Google AdSense', icon: MonitorSmartphone, description: 'AdSense placements and reminders; weak alone, stronger when used for retargeting with Social, Influencers, and Search' },
];

const channelThemes: Record<string, { iconBg: string; iconColor: string; ring: string; gradientFrom: string; gradientTo: string; chipBg: string; chipText: string }> = {
  social: { iconBg: 'bg-sky-100', iconColor: 'text-sky-700', ring: 'ring-sky-100', gradientFrom: 'from-sky-50', gradientTo: 'to-white', chipBg: 'bg-sky-100', chipText: 'text-sky-800' },
  influencer: { iconBg: 'bg-fuchsia-100', iconColor: 'text-fuchsia-700', ring: 'ring-fuchsia-100', gradientFrom: 'from-fuchsia-50', gradientTo: 'to-white', chipBg: 'bg-fuchsia-100', chipText: 'text-fuchsia-800' },
  print: { iconBg: 'bg-amber-100', iconColor: 'text-amber-700', ring: 'ring-amber-100', gradientFrom: 'from-amber-50', gradientTo: 'to-white', chipBg: 'bg-amber-100', chipText: 'text-amber-800' },
  tv: { iconBg: 'bg-rose-100', iconColor: 'text-rose-700', ring: 'ring-rose-100', gradientFrom: 'from-rose-50', gradientTo: 'to-white', chipBg: 'bg-rose-100', chipText: 'text-rose-800' },
  google_search: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', ring: 'ring-emerald-100', gradientFrom: 'from-emerald-50', gradientTo: 'to-white', chipBg: 'bg-emerald-100', chipText: 'text-emerald-800' },
  google_display: { iconBg: 'bg-indigo-100', iconColor: 'text-indigo-700', ring: 'ring-indigo-100', gradientFrom: 'from-indigo-50', gradientTo: 'to-white', chipBg: 'bg-indigo-100', chipText: 'text-indigo-800' },
};

const PRESET_SPLITS: Record<PresetId, Record<string, number>> = {
  awareness: { social: 45, influencer: 20, google_display: 25, print: 10, google_search: 0, tv: 0 },
  balanced: { social: 30, influencer: 25, google_display: 20, google_search: 20, print: 5, tv: 0 },
  conversion: { google_search: 45, google_display: 25, influencer: 20, social: 10, print: 0, tv: 0 },
};

const CAMPAIGN_COMPONENTS: Array<{ id: CampaignComponentId; label: string; description: string; weight: number }> = [
  { id: 'social', label: 'Social Media', description: 'Builds broad digital attention and supports other channels.', weight: 1.00 },
  { id: 'influencer', label: 'Celebrity Push', description: 'Creator-led buzz and buyer momentum.', weight: 1.00 },
  { id: 'google_display', label: 'Retargeting', description: 'Uses Google AdSense to remind warmed-up customers.', weight: 0.85 },
  { id: 'google_search', label: 'Search Capture', description: 'Captures people already looking or comparing.', weight: 0.90 },
  { id: 'print', label: 'Printed Media', description: 'Legacy media support with limited efficiency.', weight: 0.55 },
  { id: 'tv', label: 'Broad TV Blast', description: 'Mass reach when the TV channel budget is large enough.', weight: 1.30 },
];

const splitFromComponents = (components: CampaignComponentId[]): Record<string, number> => {
  const split: Record<string, number> = {};
  for (const c of marketingChannels) split[c.id] = 0;
  if (components.length === 0) return split;

  const selected = CAMPAIGN_COMPONENTS.filter((component) => components.includes(component.id));
  const totalWeight = selected.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight <= 0) return split;

  let roundedTotal = 0;
  selected.forEach((component, index) => {
    const exact = component.weight / totalWeight * 100;
    const rounded = index === selected.length - 1 ? 100 - roundedTotal : Math.round(exact / 5) * 5;
    split[component.id] = Math.max(0, rounded);
    roundedTotal += split[component.id];
  });
  return split;
};

const componentsFromSplit = (split: Record<string, number>): CampaignComponentId[] => (
  marketingChannels
    .filter((channel) => Number(split[channel.id] || 0) > 0)
    .map((channel) => channel.id as CampaignComponentId)
);

export default function Marketing({ gameSession, currentState }: MarketingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: gameConstants } = useQuery({ queryKey: ['/api/game/constants'], retry: false });
  const { data: weeksData } = useQuery({
    queryKey: ['/api/game', gameSession?.id, 'weeks'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/game/${gameSession.id}/weeks`);
      return res.json();
    },
    enabled: Boolean(gameSession?.id),
    staleTime: 60_000,
  });

  const currentWeek = Number(currentState?.weekNumber || 1);
  const awarenessNow = Number((currentState as any)?.awareness || 0);
  const intentNow = Number((currentState as any)?.intent || 0);

  // Next-week planning state
  const [marketingSpend, setMarketingSpend] = useState<number>(
    Number((currentState as any)?.plannedMarketingPlan?.totalSpend ?? currentState?.marketingPlan?.totalSpend ?? 0)
  );

  const recommendedPreset: PresetId = useMemo(() => {
    // Weeks 1–6: Awareness, 7–10: Balanced, 11–15: Conversion
    if (currentWeek >= 1 && currentWeek <= 6) return 'awareness';
    if (currentWeek >= 7 && currentWeek <= 10) return 'balanced';
    return 'conversion';
  }, [currentWeek]);

  const planned = (currentState as any)?.plannedMarketingPlan as any;
  const initialManual = Boolean(planned?.manual);
  const [manual, setManual] = useState<boolean>(initialManual);
  const [splitSource, setSplitSource] = useState<SplitSource>(initialManual ? 'manual' : 'preset');
  const [preset, setPreset] = useState<PresetId>(recommendedPreset);
  const [campaignComponents, setCampaignComponents] = useState<CampaignComponentId[]>(() => initialManual ? componentsFromSplit(PRESET_SPLITS[recommendedPreset]) : []);
  const [channelAllocation, setChannelAllocation] = useState<Record<string, number>>(() => {
    if (initialManual && planned?.channels && Number(planned?.totalSpend) >= 0) {
      const total = Number(planned.totalSpend) || 1;
      const pct: Record<string, number> = {};
      (planned.channels as any[]).forEach((c) => { pct[c.name] = Math.round((Number(c.spend||0) / total) * 100); });
      return pct;
    }
    return { ...PRESET_SPLITS[recommendedPreset] };
  });
  // Remember the last non-zero allocation to restore after leaving £0 with manual on
  const lastNonZeroAllocation = useRef<Record<string, number> | null>(null);

  // Discounts for next week
  const [discountMode, setDiscountMode] = useState<'none' | 'minimal' | 'standard' | 'aggressive'>('none');
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  useEffect(() => {
    const plan = (currentState as any)?.plannedMarketingPlan as any;
    const nextManual = Boolean(plan?.manual);
    const nextSpend = Number(plan?.totalSpend ?? currentState?.marketingPlan?.totalSpend ?? 0);
    const discounts = (currentState as any)?.plannedWeeklyDiscounts || {};
    const avgDiscount = (
      Number(discounts.jacket || 0) +
      Number(discounts.dress || 0) +
      Number(discounts.pants || 0)
    ) / 3;
    const nextDiscountPct = Math.round(avgDiscount * 100);

    setMarketingSpend(nextSpend);
    setManual(nextManual);
    setSplitSource(nextManual ? 'manual' : 'preset');
    setPreset(recommendedPreset);
    if (nextManual && Array.isArray(plan?.channels)) {
      const total = Number(plan.totalSpend) || 1;
      const pct: Record<string, number> = {};
      for (const c of marketingChannels) pct[c.id] = 0;
      (plan.channels as any[]).forEach((c) => {
        pct[c.name] = Math.round((Number(c.spend || 0) / total) * 100);
      });
      setCampaignComponents(componentsFromSplit(pct));
      setChannelAllocation(pct);
    } else {
      setCampaignComponents([]);
      setChannelAllocation({ ...PRESET_SPLITS[recommendedPreset] });
    }

    if (nextDiscountPct <= 0) {
      setDiscountMode('none');
      setDiscountPercent(0);
    } else if (nextDiscountPct <= 10) {
      setDiscountMode('minimal');
      setDiscountPercent(nextDiscountPct);
    } else if (nextDiscountPct <= 29) {
      setDiscountMode('standard');
      setDiscountPercent(nextDiscountPct);
    } else {
      setDiscountMode('aggressive');
      setDiscountPercent(nextDiscountPct);
    }
  }, [currentState?.id, currentWeek, (currentState as any)?.plannedLocked, recommendedPreset]);

  useEffect(() => {
    if (!manual && splitSource === 'preset') {
      setCampaignComponents([]);
      setChannelAllocation({ ...PRESET_SPLITS[preset] });
      if (preset === 'awareness') { setDiscountMode('none'); setDiscountPercent(0); }
      if (preset === 'balanced') { setDiscountMode('none'); }
      if (preset === 'conversion') { setDiscountMode('none'); setDiscountPercent(0); }
    }
  }, [preset, manual, splitSource]);

  useEffect(() => {
    if (manual) {
      setCampaignComponents(marketingChannels
        .filter((channel) => Number(channelAllocation[channel.id] || 0) > 0)
        .map((channel) => channel.id as CampaignComponentId));
    }
  }, [channelAllocation, manual]);

  const totalAllocation = useMemo(() => Object.values(channelAllocation).reduce((s, v) => s + (Number(v) || 0), 0), [channelAllocation]);
  const isFinalWeek = currentWeek === 15;
  const isLocked = Boolean((currentState as any)?.plannedLocked);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: capData } = useQuery({
    queryKey: [
      '/api/game',
      gameSession?.id,
      'week',
      currentWeek,
      'planned-marketing-cap',
      Number(currentState?.cashOnHand ?? 0),
      Number((currentState as any)?.creditUsed ?? 0),
    ],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/game/${gameSession.id}/week/${currentWeek}/planned-marketing-cap`);
      return res.json() as Promise<{ maxPlannedMarketingSpend: number }>;
    },
    enabled: Boolean(gameSession?.id) && !isFinalWeek,
    staleTime: 15_000,
  });
  const maxAffordableNextWeek = Number(capData?.maxPlannedMarketingSpend ?? 10_000_000);
  const budgetSliderMax = Math.min(1_000_000, Math.max(0, maxAffordableNextWeek));
  const maxSpendSnapped = Math.floor(maxAffordableNextWeek / 5000) * 5000;
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  // Mutations
  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/game', gameSession.id, 'week', currentWeek, 'planned-marketing-cap'],
      });
      toast({ title: 'Planned', description: 'Marketing plan applied to next week.' });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/api/login'; }, 500);
        return;
      }
      let desc = 'Failed to apply plan. Please try again.';
      const raw = String(error?.message || '');
      const idx = raw.indexOf('{');
      if (idx >= 0) {
        try {
          const j = JSON.parse(raw.slice(idx));
          if (typeof j?.message === 'string') desc = j.message;
        } catch { /* ignore */ }
      }
      toast({ title: 'Cannot lock plan', description: desc, variant: 'destructive' });
    },
  });

  const calculateChannelSpend = (channelId: string) => {
    return (marketingSpend * (channelAllocation[channelId] || 0)) / 100;
  };

  const handleChannelAllocationChange = (channelId: string, percentage: number) => {
    setChannelAllocation((prev: Record<string, number>) => {
      let others = 0;
      for (const [key, value] of Object.entries(prev)) {
        if (key !== channelId) others += Number(value || 0);
      }
      const maxAllowed = Math.max(0, 100 - others);
      const clamped = Math.min(percentage, maxAllowed);
      return { ...prev, [channelId]: clamped };
    });
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

  const discountBounds = useMemo(() => {
    return { min: 0, max: 95 };
  }, []);

  // TV inefficiency indicator: TV needs a meaningful channel budget and share.
  const tvInefficient = useMemo(() => {
    const tvPct = Number(channelAllocation['tv'] || 0);
    const tvSpend = marketingSpend * tvPct / 100;
    const hasSpend = marketingSpend > 0 && tvSpend > 0;
    return hasSpend && (tvSpend < 200000 || tvPct < 10);
  }, [channelAllocation, marketingSpend]);

  // When budget is £0, force splits to 0 and lock sliders
  useEffect(() => {
    if (marketingSpend === 0) {
      // Save current non-zero split for restoration when returning > 0 with manual on
      const currentTotal = Object.values(channelAllocation).reduce((s, v) => s + Number(v || 0), 0);
      if (currentTotal > 0) lastNonZeroAllocation.current = { ...channelAllocation };
      const zeros: Record<string, number> = {};
      for (const c of marketingChannels) zeros[c.id] = 0;
      setChannelAllocation(zeros);
    } else {
      // marketingSpend > 0
      if (!manual) {
        if (splitSource === 'preset') {
          setCampaignComponents([]);
          setChannelAllocation({ ...PRESET_SPLITS[recommendedPreset] });
        } else {
          setChannelAllocation({ ...splitFromComponents(campaignComponents) });
        }
      } else {
        // manual ON: if allocation is all zeros, try to restore the last non-zero split
        const currentTotal = Object.values(channelAllocation).reduce((s, v) => s + Number(v || 0), 0);
        if (currentTotal === 0 && lastNonZeroAllocation.current) {
          setChannelAllocation({ ...lastNonZeroAllocation.current });
        }
      }
    }
  }, [marketingSpend, manual, recommendedPreset, splitSource, campaignComponents]);

  // Recommended efficient zones by preset and channel (percent ranges)
  const getEfficientRange = (p: PresetId, channelId: string): [number, number] => {
    const map: Record<PresetId, Record<string, [number, number]>> = {
      awareness: {
        social: [30, 40],
        influencer: [25, 35],
        google_display: [15, 25],
        print: [5, 12],
        google_search: [3, 8],
        tv: [0, 0],
      },
      balanced: {
        social: [25, 35],
        google_search: [20, 30],
        influencer: [20, 30],
        google_display: [10, 20],
        print: [0, 8],
        tv: [0, 0],
      },
      conversion: {
        google_search: [35, 45],
        influencer: [20, 30],
        social: [15, 25],
        google_display: [10, 20],
        print: [0, 0],
        tv: [0, 0],
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
    if (isFinalWeek) {
      toast({ title: 'Final week', description: 'There is no next week for a new marketing plan to affect.' });
      return;
    }
    if (marketingSpend > 0 && Math.round(totalAllocation) !== 100) {
      toast({ title: 'Allocation must be 100%', description: 'Adjust channel percentages to total 100%.', variant: 'destructive' });
      return;
    }
    if (!isFinalWeek && capData && marketingSpend > maxAffordableNextWeek + 0.01) {
      toast({
        title: 'Budget exceeds available funds',
        description: `Lower next week’s budget to at most ${formatCurrency(maxAffordableNextWeek)} after your other cash commitments.`,
        variant: 'destructive',
      });
      return;
    }
    setConfirmOpen(true);
  };

  const handlePresetChange = (nextPreset: PresetId) => {
    setManual(false);
    setSplitSource('preset');
    setPreset(nextPreset);
    setCampaignComponents([]);
    setChannelAllocation({ ...PRESET_SPLITS[nextPreset] });
    setDiscountMode('none');
    setDiscountPercent(0);
  };

  const handleManualToggle = (enabled: boolean) => {
    setManual(enabled);
    if (enabled) {
      setSplitSource('manual');
      setCampaignComponents(componentsFromSplit(channelAllocation));
      return;
    }
    setSplitSource('preset');
    setCampaignComponents([]);
    setChannelAllocation({ ...PRESET_SPLITS[preset] });
  };

  const toggleCampaignComponent = (componentId: CampaignComponentId) => {
    if (manual || isLocked) return;
    setCampaignComponents((prev) => {
      const next = prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId];
      setSplitSource('components');
      setChannelAllocation({ ...splitFromComponents(next) });
      return next;
    });
  };

  useEffect(() => {
    if (isFinalWeek || isLocked || !capData) return;
    const cap = Number((capData as any).maxPlannedMarketingSpend);
    if (!Number.isFinite(cap)) return;
    setMarketingSpend((prev) => {
      const snapped = Math.floor(Math.min(prev, cap) / 5000) * 5000;
      return Math.max(0, snapped);
    });
  }, [maxAffordableNextWeek, isFinalWeek, isLocked, capData]);

  // Debounced preview of next week's A/I and demand to drive forecast donuts
  const [preview, setPreview] = useState<{ nextAwareness: number; nextIntent: number; forecastDemandTotal: number } | null>(null);
  useEffect(() => {
    if (isFinalWeek) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const channelsArray = marketingChannels.map((c) => ({ name: c.id, spend: (marketingSpend * (channelAllocation[c.id] || 0)) / 100 }));
        const plan = { totalSpend: marketingSpend, channels: channelsArray, manual };
        const res = await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/marketing-preview`, { plannedMarketingPlan: plan, plannedWeeklyDiscounts: plannedDiscounts });
        const data = await res.json();
        setPreview({ nextAwareness: Number(data.nextAwareness||0), nextIntent: Number(data.nextIntent||0), forecastDemandTotal: Number(data.forecastDemandTotal||0) });
      } catch {
        setPreview(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [gameSession?.id, currentWeek, marketingSpend, JSON.stringify(channelAllocation), preset, discountMode, discountPercent, manual]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Marketing</h1>
      </div>

      {/* Educational intro */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><GraduationCap size={16}/> Getting results from marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <span className="font-medium">Why marketing matters.</span> It creates demand by first making people aware of your product and then motivating them to buy. Good plans move audiences from “I’ve heard of it” → “I want it” → “I’ll buy now”.
              </li>
              <li>
                <span className="font-medium">How to use this tab.</span> Set a budget, pick a preset that fits the phase, then fine‑tune the channel split and (later) discounts if needed. Solid gauges show last week; faint arcs preview next week based on your current plan.
              </li>
              <li>
                <span className="font-medium">Channels work together.</span> Broad channels (social, creators) help more people hear about you. Performance channels (search) capture ready‑to‑buy demand. AdSense keeps you top‑of‑mind. Print can add credibility and local reach. TV can be powerful at sufficient scale.
              </li>
            </ul>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <span className="font-medium">Consistency beats bursts.</span> Steady, well‑timed activity compounds learning and trust. Sudden stops or erratic changes can cool interest; momentum builds it.
              </li>
              <li>
                <span className="font-medium">Right message, right time.</span> Early weeks focus on being seen; mid‑season balances reach and conversion; late season turns interest into action. Use discounts thoughtfully: they trade margin for speed.
              </li>
              <li>
                <span className="font-medium">Learn by experimenting.</span> Make small adjustments to budget and split, watch top-of-mind awareness and likely-buyer intent respond, and track ROAS/CAC trends. Aim for steady improvement, not one‑week spikes.
              </li>
              <li>
                <span className="font-medium">Stock and price reality.</span> Marketing can’t sell what isn’t available, and deep discounts can erode profit faster than they boost units. Check inventory and price before pushing harder.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Gauges */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Awareness • Intent to Buy • Demand</CardTitle>
          <p className="text-sm text-gray-600">These indicators summarize the share of target customers who would name your brand first (Awareness), the share likely to buy (Intent to Buy), and the units sold last week (Demand). Adjust your plan below and apply it to next week.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="flex items-center gap-3">
              <DonutGauge key={`A-${awarenessNow}-${preview?.nextAwareness ?? 'na'}`} value={Number.isFinite(awarenessNow)?awarenessNow:undefined} forecast={isFinalWeek?undefined:preview?.nextAwareness} colorClass="stroke-blue-500" showNumeric />
              <TooltipWrapper content="Awareness: top-of-mind share of target customers who would name your brand first. Builds slowly with broad-reach channels (Social, Influencers, Print/TV). Higher awareness enables faster growth in intent.">
                <div>
                  <div className="text-sm text-gray-700">Awareness</div>
                  <div className="text-xs text-gray-500">Top-of-mind brand recall</div>
                </div>
              </TooltipWrapper>
            </div>
            <div className="flex items-center gap-3">
              <DonutGauge key={`I-${intentNow}-${preview?.nextIntent ?? 'na'}`} value={Number.isFinite(intentNow)?intentNow:undefined} forecast={isFinalWeek?undefined:preview?.nextIntent} colorClass="stroke-blue-500" showNumeric />
              <TooltipWrapper content="Intent to Buy: share of target customers likely to buy. Grows faster when awareness is already high and you focus on performance channels (Search) or promotions. Volatile if discounts change erratically.">
                <div>
                  <div className="text-sm text-gray-700">Intent to Buy</div>
                  <div className="text-xs text-gray-500">Likely-buyer share</div>
                </div>
              </TooltipWrapper>
            </div>
            <div>
              <div className="text-sm text-gray-700 mb-1 flex items-center gap-1">
                <TooltipWrapper content="Demand: estimated units customers want to buy this week (even if products aren’t yet on sale). Driven by Awareness × Intent and pricing. Forecast shows the impact of your current plan next week.">
                  <span>Demand (units, last week)</span>
                </TooltipWrapper>
              </div>
              {(() => {
                const dem = (currentState?.weeklyDemand || {}) as any;
                const lastWeekUnits = Number(dem.jacket||0)+Number(dem.dress||0)+Number(dem.pants||0);
                const nextForecast = Number(preview?.forecastDemandTotal||0);
                return (
                  <div className="text-xs text-gray-600 mb-1">{lastWeekUnits.toLocaleString()} units {(!isFinalWeek && nextForecast>0) ? `→ next week ~ ${nextForecast.toLocaleString()} (forecast)` : ''}</div>
                );
              })()}
              {(() => {
                const weeks = (weeksData?.weeks || []) as Array<any>;
                const committed = weeks
                  .filter((w: any) => Boolean(w.isCommitted))
                  .sort((a: any, b: any) => Number(a.weekNumber) - Number(b.weekNumber));
                const points = committed.map((w: any) => {
                  const d = (w.weeklyDemand || {}) as any;
                  return Number(d.jacket || 0) + Number(d.dress || 0) + Number(d.pants || 0);
                });
                return <Sparkline points={points} colorClass="stroke-blue-500" />;
              })()}
            </div>
          </div>
          {/* KPI chips (cumulative across committed weeks) */}
          {(() => {
            const weeks = (weeksData?.weeks || []) as Array<any>;
            const committed = weeks.filter((w: any) => Boolean(w.isCommitted));
            if (committed.length === 0) {
              return (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  {['Total Spent','ROAS (to date)','CAC (to date)','Units sold (to date)','Revenue (to date)'].map((label, i)=> (
                    <div key={i} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <div className="text-gray-500">{label}</div>
                      <div className="font-medium">—</div>
                    </div>
                  ))}
                </div>
              );
            }
            const totals = committed.reduce((acc: any, w: any) => {
              const spend = Number((w as any).marketingPlan?.totalSpend ?? (w as any).marketingSpend ?? 0);
              const sales = (w.weeklySales || {}) as any;
              const units = Number(sales.jacket || 0) + Number(sales.dress || 0) + Number(sales.pants || 0);
              const revenue = Number(w.weeklyRevenue || 0);
              acc.spend += spend;
              acc.units += units;
              acc.revenue += revenue;
              return acc;
            }, { spend: 0, units: 0, revenue: 0 });
            totals.spend += Number((currentState as any)?.marketingPlan?.totalSpend ?? 0);
            const roas = totals.spend > 0 ? totals.revenue / totals.spend : null;
            const cac = totals.units > 0 ? totals.spend / totals.units : null;
            return (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-gray-500">Total Spent</div>
                  <div className="font-medium">£{Math.round(totals.spend).toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Cumulative marketing spend across completed weeks</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-gray-500">ROAS (to date)</div>
                  <div className="font-medium">{roas!=null ? `${roas.toFixed(2)}×` : '—'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Return on ad spend = Revenue ÷ Spend</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-gray-500">CAC (to date)</div>
                  <div className="font-medium">{cac!=null ? `£${Math.round(cac).toLocaleString()}` : '—'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Customer acquisition cost = Spend ÷ Units sold</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-gray-500">Units sold (to date)</div>
                  <div className="font-medium">{totals.units.toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total units sold over completed weeks</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-gray-500">Revenue (to date)</div>
                  <div className="font-medium">£{Math.round(totals.revenue).toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Total revenue over completed weeks</div>
                </div>
              </div>
            );
          })()}
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
              <Label>Next Week Budget</Label>
              <div className="relative">
                {/* Efficient zone band: £200k–£600k */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-1 bg-emerald-300/80 rounded z-10 pointer-events-none"
                  style={{ left: '20%', width: '40%' }}
                />
                <Slider
                  value={[Math.min(budgetSliderMax, Math.max(0, marketingSpend))]}
                  onValueChange={([v]) => {
                    const rounded = Math.round(v / 5000) * 5000;
                    const cap = maxSpendSnapped;
                    setMarketingSpend(Math.min(rounded, cap));
                  }}
                  min={0}
                  max={Math.max(5000, budgetSliderMax)}
                  step={5000}
                  trackClassName="bg-gray-200"
                  rangeClassName="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500"
                  thumbClassName="border-amber-500"
                  zones={[{ left: 20, width: 40 }]}
                  disabled={isLocked}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>£0</span>
                <span>{formatCurrency(marketingSpend)}</span>
                <span>{formatCurrency(Math.max(5000, budgetSliderMax))}</span>
              </div>
              {!isFinalWeek && capData && (
                <div className="text-xs text-gray-600 text-center">
                  Max affordable next week (after other commitments): {formatCurrency(maxAffordableNextWeek)}
                </div>
              )}
              <div className="text-xs text-gray-500 text-center">Efficient zone highlighted</div>
            </div>
            <div className="space-y-2">
              <Label>Preset</Label>
	              <div className="flex gap-2 flex-wrap">
	                {(['awareness','balanced','conversion'] as PresetId[]).map(p => (
	                  <Button key={p} variant={!manual && splitSource === 'preset' && preset===p?'default':'outline'} onClick={()=> handlePresetChange(p)} disabled={isLocked}>{p.charAt(0).toUpperCase()+p.slice(1)}</Button>
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
                    <Button variant={discountMode==='none'?'default':'outline'} onClick={()=>{ setDiscountMode('none'); setDiscountPercent(0); }} disabled={isLocked}>None</Button>
                    <Button variant={discountMode==='minimal'?'default':'outline'} onClick={()=>{ setDiscountMode('minimal'); setDiscountPercent(10); }} disabled={isLocked}>Minimal</Button>
                    <Button variant={discountMode==='standard'?'default':'outline'} onClick={()=>{ setDiscountMode('standard'); setDiscountPercent(15); }} disabled={isLocked}>Standard</Button>
                    <Button variant={discountMode==='aggressive'?'default':'outline'} onClick={()=>{ setDiscountMode('aggressive'); setDiscountPercent(35); }} disabled={isLocked}>Aggressive</Button>
                  </div>
                  <div className="text-xs text-gray-500">Preset buttons set the discount level; the slider always uses the full range.</div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600"><span>Discount %</span><span>{discountPercent}%</span></div>
                    <input type="range" min={discountBounds.min} max={discountBounds.max} step={1} value={discountPercent} onChange={(e)=> { const value = Number(e.target.value); setDiscountPercent(value); setDiscountMode(value === 0 ? 'none' : value <= 10 ? 'minimal' : value <= 29 ? 'standard' : 'aggressive'); }} className="w-full" disabled={isLocked} />
                    {floorWarnings.length>0 && (<div className="text-xs text-red-600 mt-1">Below cost risk: {floorWarnings.join(', ')}</div>)}
                  </div>
	              </div>
	            )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Components */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Campaign Components</CardTitle>
          <div className="text-sm text-gray-600">
            Choose the campaign elements you want to run. Presets use their own split; selecting a component switches to a component-generated split. Switch to manual to fine-tune percentages.
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {CAMPAIGN_COMPONENTS.map((component) => {
              const active = campaignComponents.includes(component.id);
              const activeStyle = active
                ? { borderColor: '#57cd07', backgroundColor: 'rgba(87, 205, 7, 0.10)', boxShadow: '0 0 0 2px rgba(87, 205, 7, 0.22)' }
                : undefined;
              return (
                <button
                  key={component.id}
                  type="button"
                  onClick={() => toggleCampaignComponent(component.id)}
                  disabled={manual || isLocked || marketingSpend === 0}
                  aria-pressed={active}
                  style={activeStyle}
                  className={`relative text-left rounded-lg border px-3 py-2 transition ${
                    active
                      ? 'text-gray-900 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-lime-300'
                  } ${manual || isLocked || marketingSpend === 0 ? 'cursor-not-allowed' : ''}`}
                >
                  <div className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? '#57cd07' : '#e5e7eb' }} />
                  <div className="font-medium">{component.label}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{component.description}</div>
                </button>
              );
            })}
          </div>
          {campaignComponents.length === 0 && marketingSpend > 0 && !manual && (
            <div className="text-sm text-red-600 mt-3 inline-flex items-center gap-1">
              <AlertTriangle size={14}/> Select at least one component or switch to manual.
            </div>
          )}
          {manual && (
            <div className="text-xs text-gray-500 mt-3">Manual mode is active; component states reflect non-zero channel allocations while you edit the split directly.</div>
          )}
        </CardContent>
      </Card>

      {/* Channel Allocation (percent split) */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Channel Split</CardTitle>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Allocate percent split (must total 100%).</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Manual Channel Split Management</span>
	              <Switch checked={manual} onCheckedChange={(v)=> handleManualToggle(Boolean(v))} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {marketingChannels.map((channel) => {
              const Icon = channel.icon;
              const pct = Number(channelAllocation[channel.id] || 0);
              // Efficient zone bounds (percent of slider) widened with padding
              const [minEZ, maxEZ] = getEfficientRange(preset, channel.id);
              const padEZ = 6;
              const leftPct = Math.max(0, Math.min(100, minEZ - padEZ));
              const widthPct = Math.max(0, Math.min(100, (maxEZ + padEZ) - (minEZ - padEZ)));
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
                  <div>
                    <Slider
                      value={[pct]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(v)=> manual ? handleChannelAllocationChange(channel.id, v[0] || 0) : undefined}
                      trackClassName="bg-gray-200"
                      rangeClassName="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500"
                      thumbClassName="border-amber-500"
                      disabled={isLocked || !manual || marketingSpend===0}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-5"><span>0%</span><span className="opacity-0">.</span><span>100%</span></div>
                  </div>
                  <div className="text-right font-mono mt-1 sm:hidden">{pct.toFixed(0)}%</div>
                </div>
              );
            })}
            <div className="text-sm flex items-center justify-between col-span-1 xl:col-span-2 mt-1">
              <div>Total allocation: {totalAllocation.toFixed(1)}%</div>
              {marketingSpend > 0 && Math.round(totalAllocation) !== 100 && (<div className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> Must be 100%</div>)}
              {tvInefficient && (<div className="text-amber-600 inline-flex items-center gap-1"><AlertTriangle size={14}/> TV needs a larger channel budget to work well</div>)}
                </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions footer (normal pane at bottom) */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
        <Button variant="outline" onClick={()=> handlePresetChange(recommendedPreset)} disabled={isLocked}>Reset to Preset</Button>
        <Button onClick={handleApplyNextWeek} disabled={isFinalWeek || isLocked || updateStateMutation.isPending || (marketingSpend>0 && Math.round(totalAllocation)!==100) || (!isFinalWeek && !!capData && marketingSpend > maxAffordableNextWeek + 0.01)}>
          {isFinalWeek ? 'No Next Week' : updateStateMutation.isPending ? 'Applying...' : 'Apply to Next Week'}
          </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to next week?</AlertDialogTitle>
            <AlertDialogDescription>
              This locks your marketing plan for the next week. You will be able to change it after the week advances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const channelsArray = marketingSpend === 0 ? [] : marketingChannels.map((c) => ({ name: c.id, spend: calculateChannelSpend(c.id) }));
              const updates: any = { plannedMarketingPlan: { totalSpend: marketingSpend, channels: channelsArray, manual }, plannedWeeklyDiscounts: plannedDiscounts, plannedLocked: true };
              updateStateMutation.mutate(updates);
              setConfirmOpen(false);
            }}>Confirm & Lock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
