import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Palette, Shirt, AlertCircle } from "lucide-react";

interface DesignProps {
  gameSession: any;
  currentState: any;
}

const products = [
  {
    id: 'jacket',
    name: 'Vintage Denim Jacket',
    forecast: 100000,
    fabricOptions: [
      { id: 'selvedgeDenim', name: '100% Cotton Selvedge Denim', description: 'Premium quality, sustainable, authentic vintage appeal' },
      { id: 'standardDenim', name: 'Cotton-Polyester Denim Blend', description: 'Cost-effective, durable, easier maintenance' },
    ],
  },
  {
    id: 'dress',
    name: 'Floral Print Dress',
    forecast: 150000,
    fabricOptions: [
      { id: 'egyptianCotton', name: '100% Egyptian Cotton', description: 'Luxurious feel, breathable, premium positioning' },
      { id: 'polyesterBlend', name: 'Cotton-Polyester Blend', description: 'Easy care, wrinkle-resistant, cost-effective' },
    ],
  },
  {
    id: 'pants',
    name: 'Corduroy Pants',
    forecast: 120000,
    fabricOptions: [
      { id: 'fineWaleCorduroy', name: 'Fine-Wale Corduroy', description: 'Premium texture, sophisticated appearance, higher cost' },
      { id: 'wideWaleCorduroy', name: 'Wide-Wale Corduroy', description: 'Classic style, comfortable, more affordable' },
    ],
  },
];

export default function Design({ gameSession, currentState }: DesignProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [designData, setDesignData] = useState(() => {
    const productData = currentState?.productData || {};
    const initialData: any = {};
    
    products.forEach(product => {
      initialData[product.id] = {
        fabric: productData[product.id]?.fabric || '',
        hasPrint: productData[product.id]?.hasPrint || false,
      };
    });
    
    return initialData;
  });

  // Load existing design data when currentState changes
  useEffect(() => {
    if (currentState?.productData) {
      const productData = currentState.productData;
      const newData: any = {};
      
      products.forEach(product => {
        newData[product.id] = {
          fabric: productData[product.id]?.fabric || '',
          hasPrint: productData[product.id]?.hasPrint || false,
        };
      });
      
      setDesignData(newData);
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
        description: "Your design decisions have been saved.",
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
        description: "Failed to save design data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFabricChange = (productId: string, fabric: string) => {
    setDesignData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        fabric,
      },
    }));
  };

  const handlePrintChange = (productId: string, hasPrint: boolean) => {
    setDesignData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        hasPrint,
      },
    }));
  };

  const handleSave = () => {
    const updates = {
      productData: {
        ...currentState?.productData,
        ...Object.fromEntries(
          Object.entries(designData).map(([productId, data]: [string, any]) => [
            productId,
            {
              ...currentState?.productData?.[productId],
              fabric: data.fabric,
              hasPrint: data.hasPrint,
            }
          ])
        ),
      },
    };
    updateStateMutation.mutate(updates);
  };

  const isLocked = currentState?.weekNumber > 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Palette size={24} />
          Product Design
        </h1>
        <p className="text-gray-600">Choose materials and design features for your product line</p>
        {isLocked && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Design decisions are locked after Week 1. Current designs are final.
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {products.map((product) => (
          <Card key={product.id} className="border border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shirt size={20} />
                {product.name}
              </CardTitle>
              <p className="text-sm text-gray-600">Expected demand: {product.forecast.toLocaleString()} units</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Fabric Selection */}
              <div className="space-y-4">
                <Label className="text-base font-medium">
                  <TooltipWrapper content="Your fabric choice affects cost, quality perception, and procurement options. This decision impacts which materials you can purchase in the Procurement tab.">
                    <span className="cursor-help">Fabric Choice</span>
                  </TooltipWrapper>
                </Label>
                <RadioGroup
                  value={designData[product.id]?.fabric || ''}
                  onValueChange={(value) => handleFabricChange(product.id, value)}
                  disabled={isLocked}
                  className="space-y-3"
                >
                  {product.fabricOptions.map((fabric) => (
                    <div key={fabric.id} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <RadioGroupItem 
                        value={fabric.id} 
                        id={`${product.id}-${fabric.id}`}
                        disabled={isLocked}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label 
                          htmlFor={`${product.id}-${fabric.id}`} 
                          className="font-medium cursor-pointer"
                        >
                          {fabric.name}
                        </Label>
                        <p className="text-sm text-gray-600 mt-1">{fabric.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Print Option */}
              <div className="space-y-3">
                <Label className="text-base font-medium">
                  <TooltipWrapper content="Adding custom prints increases material cost but can justify higher pricing and create unique market positioning.">
                    <span className="cursor-help">Design Features</span>
                  </TooltipWrapper>
                </Label>
                <div className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg">
                  <Checkbox
                    id={`print-${product.id}`}
                    checked={designData[product.id]?.hasPrint || false}
                    onCheckedChange={(checked) => handlePrintChange(product.id, !!checked)}
                    disabled={isLocked}
                  />
                  <div className="flex-1">
                    <Label 
                      htmlFor={`print-${product.id}`} 
                      className="font-medium cursor-pointer"
                    >
                      Add Custom Print/Pattern
                    </Label>
                    <p className="text-sm text-gray-600 mt-1">
                      Enhance the design with unique vintage-inspired prints. Increases material cost but adds premium appeal.
                    </p>
                  </div>
                </div>
              </div>

              {/* Design Summary */}
              {(designData[product.id]?.fabric || designData[product.id]?.hasPrint) && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Design Summary</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    {designData[product.id]?.fabric && (
                      <p>
                        <span className="font-medium">Material:</span>{' '}
                        {product.fabricOptions.find(f => f.id === designData[product.id]?.fabric)?.name}
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Custom Print:</span>{' '}
                      {designData[product.id]?.hasPrint ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
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
              <Palette size={16} />
              Save Design Choices
            </>
          )}
        </Button>
      </div>
    </div>
  );
}