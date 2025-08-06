import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { DollarSign, TrendingUp, AlertCircle } from "lucide-react";

interface PricingProps {
  gameSession: any;
  currentState: any;
}

const products = [
  {
    id: 'jacket',
    name: 'Vintage Denim Jacket',
    forecast: 100000,
    hmPrice: 80,
    highEndRange: { min: 300, max: 550 },
    elasticity: -1.40,
  },
  {
    id: 'dress',
    name: 'Floral Print Dress',
    forecast: 150000,
    hmPrice: 50,
    highEndRange: { min: 180, max: 210 },
    elasticity: -1.20,
  },
  {
    id: 'pants',
    name: 'Corduroy Pants',
    forecast: 120000,
    hmPrice: 60,
    highEndRange: { min: 190, max: 220 },
    elasticity: -1.55,
  },
];

export default function Pricing({ gameSession, currentState }: PricingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [pricingData, setPricingData] = useState(() => {
    const productData = currentState?.productData || {};
    const initialData: any = {};
    
    products.forEach(product => {
      initialData[product.id] = {
        rrp: productData[product.id]?.rrp || '',
      };
    });
    
    return initialData;
  });

  // Load existing pricing data when currentState changes
  useEffect(() => {
    if (currentState?.productData) {
      const productData = currentState.productData;
      const newData: any = {};
      
      products.forEach(product => {
        newData[product.id] = {
          rrp: productData[product.id]?.rrp || '',
        };
      });
      
      setPricingData(newData);
    }
  }, [currentState]);

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('PATCH', `/api/game/${gameSession.id}/week/${currentState.weekNumber}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Saved",
        description: "Your pricing decisions have been saved.",
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
        description: "Failed to save pricing data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (productId: string, field: string, value: any) => {
    setPricingData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    const updates = {
      productData: {
        ...currentState?.productData,
        ...Object.fromEntries(
          Object.entries(pricingData).map(([productId, data]: [string, any]) => [
            productId,
            {
              ...currentState?.productData?.[productId],
              rrp: data.rrp,
            }
          ])
        ),
      },
    };
    updateStateMutation.mutate(updates);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const isLocked = currentState?.weekNumber > 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <DollarSign size={24} />
          Pricing Strategy
        </h1>
        <p className="text-gray-600">Set your recommended retail prices for each product line</p>
        {isLocked && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Pricing decisions are locked after Week 1. Current prices are final.
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {products.map((product) => {
          const rrp = parseFloat(pricingData[product.id]?.rrp) || 0;
          const isInRange = rrp >= product.highEndRange.min && rrp <= product.highEndRange.max;
          const marginVsHM = rrp > 0 ? ((rrp - product.hmPrice) / product.hmPrice * 100) : 0;

          return (
            <Card key={product.id} className="border border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{product.name}</span>
                  <div className="flex items-center gap-2">
                    {rrp > 0 && (
                      <span className={`text-sm px-2 py-1 rounded ${
                        isInRange 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {isInRange ? 'In Range' : 'Out of Range'}
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Market Context */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <Label className="text-sm text-gray-600">H&M Equivalent</Label>
                    <div className="font-semibold">{formatCurrency(product.hmPrice)}</div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-600">High-End Range</Label>
                    <div className="font-semibold">
                      {formatCurrency(product.highEndRange.min)} - {formatCurrency(product.highEndRange.max)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-600">
                      <TooltipWrapper content="Price elasticity shows how demand changes with price. -1.40 means a 10% price increase reduces demand by 14%.">
                        <span className="cursor-help">Price Elasticity</span>
                      </TooltipWrapper>
                    </Label>
                    <div className="font-semibold">{product.elasticity}</div>
                  </div>
                </div>

                {/* Pricing Input */}
                <div className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <Label htmlFor={`rrp-${product.id}`} className="text-base font-medium">
                      Recommended Retail Price (RRP)
                    </Label>
                    <div className="flex items-center space-x-4">
                      <div className="relative flex-1 max-w-xs">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">£</span>
                        <Input
                          id={`rrp-${product.id}`}
                          type="number"
                          min="0"
                          step="1"
                          value={pricingData[product.id]?.rrp || ''}
                          onChange={(e) => handleInputChange(product.id, 'rrp', e.target.value)}
                          className="pl-8"
                          placeholder="0"
                          disabled={isLocked}
                        />
                      </div>
                      {rrp > 0 && (
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <TrendingUp size={14} className="text-gray-500" />
                            <span className="text-gray-600">vs H&M:</span>
                            <span className={`font-medium ${marginVsHM > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {marginVsHM > 0 ? '+' : ''}{marginVsHM.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing Guidance */}
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      <TooltipWrapper content="Based on market research, prices in this range will position your product as premium but accessible to your target market.">
                        <span className="cursor-help font-medium">Recommended Range:</span>
                      </TooltipWrapper>
                      {' '}{formatCurrency(product.highEndRange.min)} - {formatCurrency(product.highEndRange.max)}
                    </p>
                    <p>
                      <span className="font-medium">Market Forecast:</span> {product.forecast.toLocaleString()} units at optimal pricing
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-8">
        <Button
          onClick={handleSave}
          disabled={updateStateMutation.isPending || isLocked}
          className="flex items-center gap-2"
        >
          {updateStateMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <DollarSign size={16} />
              Save Pricing Strategy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}