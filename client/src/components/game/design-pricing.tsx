import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface DesignPricingProps {
  gameSession: any;
  currentState: any;
}

const products = [
  {
    id: 'jacket',
    name: 'Vintage Denim Jacket',
    forecast: 100000,
    hmPrice: 80,
    highEndRange: '£300-550',
    elasticity: -1.40,
    fabricOptions: [
      { id: 'selvedgeDenim', name: '100% Cotton Denim', description: 'Premium quality, sustainable' },
      { id: 'standardDenim', name: 'Cotton-Polyester Blend', description: 'Cost-effective, durable' },
    ],
  },
  {
    id: 'dress',
    name: 'Floral Print Dress',
    forecast: 150000,
    hmPrice: 50,
    highEndRange: '£180-210',
    elasticity: -1.20,
    fabricOptions: [
      { id: 'egyptianCotton', name: '100% Egyptian Cotton', description: 'Luxurious feel, breathable' },
      { id: 'polyesterBlend', name: 'Cotton-Polyester Blend', description: 'Easy care, wrinkle-resistant' },
    ],
  },
  {
    id: 'pants',
    name: 'Corduroy Pants',
    forecast: 120000,
    hmPrice: 60,
    highEndRange: '£190-220',
    elasticity: -1.55,
    fabricOptions: [
      { id: 'fineWaleCorduroy', name: 'Fine-Wale Corduroy', description: 'Premium texture, sophisticated' },
      { id: 'wideWaleCorduroy', name: 'Wide-Wale Corduroy', description: 'Classic style, comfortable' },
    ],
  },
];

export default function DesignPricing({ gameSession, currentState }: DesignPricingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(() => {
    const productData = currentState?.productData || {};
    const initialData: any = {};
    
    products.forEach(product => {
      initialData[product.id] = {
        rrp: productData[product.id]?.rrp || '',
        fabric: productData[product.id]?.fabric || '',
        hasPrint: productData[product.id]?.hasPrint || false,
      };
    });
    
    return initialData;
  });

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Saved",
        description: "Your design and pricing choices have been saved.",
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

  const handleInputChange = (productId: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleSave = () => {
    const updates = {
      productData: formData,
    };
    updateStateMutation.mutate(updates);
  };

  const handleLockPrices = () => {
    // Validate all products have RRP and fabric selected
    const isValid = products.every(product => 
      formData[product.id]?.rrp && formData[product.id]?.fabric
    );

    if (!isValid) {
      toast({
        title: "Incomplete Data",
        description: "Please set RRP and fabric for all products before locking.",
        variant: "destructive",
      });
      return;
    }

    const updates = {
      productData: formData,
      // Additional logic to lock the prices would go here
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

  const isLocked = currentState?.weekNumber > 2;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Design & Pricing</h1>
        <p className="text-gray-600">
          Set your Recommended Retail Price (RRP) and design choices. Deadline: End of Week 2
        </p>
      </div>

      <div className="space-y-8">
        {products.map((product) => (
          <Card key={product.id} className="border border-gray-100">
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <p className="text-sm text-gray-600">
                {product.forecast.toLocaleString()} units forecasted | Price Elasticity: {product.elasticity}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pricing Section */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Pricing Strategy</h3>
                  <div className="space-y-4">
                    <div>
                      <TooltipWrapper content="Set your product's base selling price. This is a strategic decision based on competitor pricing and your target margin. It will be locked after Week 2.">
                        <Label className="cursor-help">Recommended Retail Price (RRP)</Label>
                      </TooltipWrapper>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">£</span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={formData[product.id]?.rrp || ''}
                          onChange={(e) => handleInputChange(product.id, 'rrp', Number(e.target.value))}
                          className="pl-8"
                          disabled={isLocked}
                        />
                      </div>
                    </div>
                    
                    {/* Competitive Analysis */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Competitive Benchmarks</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">H&M (Mass Market):</span>
                          <span className="font-mono font-medium">{formatCurrency(product.hmPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Premium Range:</span>
                          <span className="font-mono font-medium">{product.highEndRange}</span>
                        </div>
                      </div>
                    </div>

                    {/* Projected Unit Cost */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        <TooltipWrapper content="An initial estimate of your material cost per unit, based on the average price of your chosen fabric from all available suppliers. Use this for early margin planning.">
                          <span className="cursor-help">Projected Unit Cost</span>
                        </TooltipWrapper>
                      </h4>
                      <p className="text-lg font-mono font-semibold text-primary">£45.00</p>
                      <p className="text-xs text-gray-600 mt-1">Based on average material costs + print surcharge</p>
                    </div>
                  </div>
                </div>

                {/* Design Section */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-4">Design Choices</h3>
                  <div className="space-y-6">
                    {/* Fabric Selection */}
                    <div>
                      <Label className="block text-sm font-medium text-gray-700 mb-3">Fabric Type</Label>
                      <RadioGroup
                        value={formData[product.id]?.fabric || ''}
                        onValueChange={(value) => handleInputChange(product.id, 'fabric', value)}
                        disabled={isLocked}
                      >
                        <div className="space-y-2">
                          {product.fabricOptions.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                              <RadioGroupItem value={option.id} id={`${product.id}-${option.id}`} />
                              <div className="flex-1">
                                <Label htmlFor={`${product.id}-${option.id}`} className="font-medium text-gray-900 cursor-pointer">
                                  {option.name}
                                </Label>
                                <p className="text-sm text-gray-600">{option.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Print Options */}
                    <div>
                      <Label className="block text-sm font-medium text-gray-700 mb-3">
                        <TooltipWrapper content="Choose whether to add a print to the fabric. Adding a print increases the material cost but also provides a small boost to customer demand due to its higher design appeal.">
                          <span className="cursor-help">Print Design</span>
                        </TooltipWrapper>
                      </Label>
                      <RadioGroup
                        value={formData[product.id]?.hasPrint ? 'print' : 'none'}
                        onValueChange={(value) => handleInputChange(product.id, 'hasPrint', value === 'print')}
                        disabled={isLocked}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <RadioGroupItem value="none" id={`${product.id}-no-print`} />
                            <div className="flex-1">
                              <Label htmlFor={`${product.id}-no-print`} className="font-medium text-gray-900 cursor-pointer">
                                No Print
                              </Label>
                              <p className="text-sm text-gray-600">Classic solid color</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <RadioGroupItem value="print" id={`${product.id}-print`} />
                            <div className="flex-1">
                              <Label htmlFor={`${product.id}-print`} className="font-medium text-gray-900 cursor-pointer">
                                Add Print
                              </Label>
                              <p className="text-sm text-gray-600">+5% demand appeal, additional cost</p>
                            </div>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center mt-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="text-sm text-gray-600 flex items-center">
          <span className="mr-2">⏰</span>
          Deadline: End of Week 2
        </div>
        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            onClick={handleSave}
            disabled={updateStateMutation.isPending || isLocked}
          >
            {updateStateMutation.isPending ? "Saving..." : "Save Draft"}
          </Button>
          <Button 
            onClick={handleLockPrices}
            disabled={updateStateMutation.isPending || isLocked}
          >
            {isLocked ? "Prices Locked" : "Lock Prices & Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
