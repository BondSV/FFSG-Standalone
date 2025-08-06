import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Megaphone, TrendingUp, Users, Eye } from "lucide-react";

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

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Saved",
        description: "Your marketing plan has been saved.",
      });
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

  const handleSave = () => {
    const updates = {
      marketingSpend: marketingSpend.toString(),
      weeklyDiscounts,
    };
    updateStateMutation.mutate(updates);
  };

  const handleDiscountChange = (product: string, discount: number) => {
    setWeeklyDiscounts(prev => ({
      ...prev,
      [product]: discount,
    }));
  };

  const handleChannelAllocationChange = (channelId: string, percentage: number) => {
    setChannelAllocation(prev => ({
      ...prev,
      [channelId]: percentage,
    }));
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

  const getTotalBudget = () => 1300000; // £1.3M total promotional budget
  const getRemainingBudget = () => getTotalBudget() - marketingSpend;

  const isWeekInSalesPhase = () => {
    const week = currentState?.weekNumber || 1;
    return week >= 7 && week <= 12;
  };

  const currentWeek = currentState?.weekNumber || 1;

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

      {/* Budget Overview */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Marketing Budget Overview</CardTitle>
          <p className="text-sm text-gray-600">Total promotional budget for the entire season</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-primary bg-opacity-10 rounded-lg">
              <h3 className="text-sm font-medium text-gray-600 mb-1">Total Budget</h3>
              <p className="text-2xl font-bold text-primary">{formatCurrency(getTotalBudget())}</p>
            </div>
            <div className="text-center p-4 bg-accent bg-opacity-10 rounded-lg">
              <h3 className="text-sm font-medium text-gray-600 mb-1">This Week</h3>
              <p className="text-2xl font-bold text-accent">{formatCurrency(marketingSpend)}</p>
            </div>
            <div className="text-center p-4 bg-secondary bg-opacity-10 rounded-lg">
              <h3 className="text-sm font-medium text-gray-600 mb-1">Remaining</h3>
              <p className="text-2xl font-bold text-secondary">{formatCurrency(getRemainingBudget())}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Marketing Spend */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>
            <TooltipWrapper content="Allocate your advertising budget for this week. Higher spending increases customer awareness and directly boosts demand. Spending close to the seasonal average is most efficient; spending too little will hurt sales, while spending excessively offers diminishing returns.">
              <span className="cursor-help">Weekly Marketing Spend</span>
            </TooltipWrapper>
          </CardTitle>
          <p className="text-sm text-gray-600">
            Recommended baseline: {formatCurrency(216667)} per week
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="marketing-spend">Marketing Budget (£)</Label>
              <Input
                id="marketing-spend"
                type="number"
                value={marketingSpend}
                onChange={(e) => setMarketingSpend(Number(e.target.value))}
                placeholder="0"
                className="mt-1"
                disabled={!isWeekInSalesPhase()}
              />
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
          <CardTitle>Marketing Channel Mix</CardTitle>
          <p className="text-sm text-gray-600">Allocate your budget across different marketing channels</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {marketingChannels.map((channel) => {
              const ChannelIcon = channel.icon;
              const spend = calculateChannelSpend(channel.id);
              const reach = calculateExpectedReach(channel.id);
              
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
                    <div className="text-right">
                      <p className="font-mono font-semibold">{formatCurrency(spend)}</p>
                      <p className="text-sm text-gray-600">{reach.toLocaleString()} reach</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Allocation: {(channelAllocation[channel.id] || 0).toFixed(1)}%</span>
                      <span>£{channel.costPer1000}/1k impressions | {(channel.conversionRate * 100).toFixed(2)}% conversion</span>
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
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Current RRP: £120.00</p>
                      <p>Sale Price: £{(120 * (1 - (weeklyDiscounts[product as keyof typeof weeklyDiscounts] || 0) / 100)).toFixed(2)}</p>
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
          <Button 
            variant="outline" 
            onClick={handleSave}
            disabled={updateStateMutation.isPending}
          >
            {updateStateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
