import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Factory, Zap, Calendar, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

interface ProductionProps {
  gameSession: any;
  currentState: any;
}

export default function Production({ gameSession, currentState }: ProductionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state for new production batch
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [selectedStartWeek, setSelectedStartWeek] = useState<string>('');
  const [selectedBatches, setSelectedBatches] = useState<number>(1);

  // Get game constants
  const { data: gameConstants } = useQuery({
    queryKey: ['/api/game/constants'],
  });

  const capacitySchedule = (gameConstants as any)?.CAPACITY_SCHEDULE || [0, 0, 25000, 50000, 100000, 100000, 150000, 150000, 200000, 200000, 100000, 50000, 0, 0, 0];
  const manufacturingCosts = (gameConstants as any)?.MANUFACTURING || {};

  // Calculate capacity usage from scheduled batches
  const scheduledBatches = currentState?.productionSchedule?.batches || [];
  
  const getCapacityData = () => {
    const weeks = [3, 4, 5, 6, 7, 8];
    return weeks.map(week => {
      const capacity = capacitySchedule[week - 1] || 0;
      const used = scheduledBatches
        .filter((batch: any) => {
          if (batch.method !== 'inhouse') return false;
          // Check if this batch occupies this week
          const batchStart = batch.startWeek;
          const batchDuration = manufacturingCosts[batch.product]?.inHouseTime || 2;
          return week >= batchStart && week < batchStart + batchDuration;
        })
        .reduce((total: number, batch: any) => {
          const batchDuration = manufacturingCosts[batch.product]?.inHouseTime || 2;
          return total + Math.ceil((batch.quantity || 0) / batchDuration);
        }, 0);
      
      return { week, capacity, used };
    });
  };

  const capacityData = getCapacityData();

  const getCapacityPercentage = (used: number, capacity: number) => {
    return capacity > 0 ? (used / capacity) * 100 : 0;
  };

  // Get available materials from inventory
  const materialInventory = currentState?.materialInventory || {};
  const productData = currentState?.productData || {};

  // Production batch mutation
  const addBatchMutation = useMutation({
    mutationFn: async (batch: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, {
        productionSchedule: {
          batches: [
            ...scheduledBatches,
            batch
          ]
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Production Batch Scheduled",
        description: `${(selectedBatches * 25000).toLocaleString()} units (${selectedBatches} batch${selectedBatches > 1 ? 'es' : ''}) scheduled for production.`,
      });
      // Reset form
      setSelectedProduct('');
      setSelectedMethod('');
      setSelectedStartWeek('');
      setSelectedBatches(1);
    },
    onError: (error: any) => {
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
        description: "Failed to schedule production batch. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddBatch = () => {
    if (!selectedProduct || !selectedMethod || !selectedStartWeek) {
      toast({
        title: "Missing Information",
        description: "Please select product, method, and start week.",
        variant: "destructive",
      });
      return;
    }

    const startWeek = parseInt(selectedStartWeek);
    const currentWeek = currentState?.weekNumber || 1;
    const totalUnits = selectedBatches * 25000;
    
    if (startWeek < currentWeek) {
      toast({
        title: "Invalid Start Week",
        description: "Cannot schedule production for past weeks.",
        variant: "destructive",
      });
      return;
    }

    // Check material availability - materials must arrive before or during production start
    const productMaterial = productData[selectedProduct]?.fabric;
    if (productMaterial) {
      const materialPurchases = currentState?.materialPurchases || [];
      const availableMaterials = materialPurchases.filter((purchase: any) => 
        purchase.shipmentWeek <= startWeek && 
        purchase.orders?.some((order: any) => order.material === productMaterial)
      );
      
      if (availableMaterials.length === 0) {
        toast({
          title: "Materials Not Available",
          description: `${productMaterial} materials will not be available by Week ${startWeek}. Check your material purchase schedule.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Get production duration for capacity checking
    const productionTime = selectedMethod === 'inhouse' 
      ? manufacturingCosts[selectedProduct]?.inHouseTime || 2
      : manufacturingCosts[selectedProduct]?.outsourceTime || 1;

    // Check capacity for in-house production across all production weeks
    if (selectedMethod === 'inhouse') {
      const unitsPerWeek = Math.ceil(totalUnits / productionTime);
      
      for (let week = startWeek; week < startWeek + productionTime; week++) {
        const weekCapacity = capacitySchedule[week - 1] || 0;
        const weekUsed = scheduledBatches
          .filter((batch: any) => {
            // Check if this batch occupies this week
            const batchStart = batch.startWeek;
            const batchDuration = batch.method === 'inhouse' 
              ? manufacturingCosts[batch.product]?.inHouseTime || 2
              : manufacturingCosts[batch.product]?.outsourceTime || 1;
            return batch.method === 'inhouse' && week >= batchStart && week < batchStart + batchDuration;
          })
          .reduce((total: number, batch: any) => {
            const batchDuration = batch.method === 'inhouse' 
              ? manufacturingCosts[batch.product]?.inHouseTime || 2
              : manufacturingCosts[batch.product]?.outsourceTime || 1;
            return total + Math.ceil((batch.quantity || 0) / batchDuration);
          }, 0);
        
        if (weekUsed + unitsPerWeek > weekCapacity) {
          toast({
            title: "Capacity Exceeded",
            description: `Week ${week} has insufficient capacity. Available: ${(weekCapacity - weekUsed).toLocaleString()} units, needed: ${unitsPerWeek.toLocaleString()} units.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Calculate completion week and cost
    const completionWeek = startWeek + productionTime;
    
    const unitCost = selectedMethod === 'inhouse'
      ? manufacturingCosts[selectedProduct]?.inHouseCost || 10
      : manufacturingCosts[selectedProduct]?.outsourceCost || 15;
    
    const totalCost = totalUnits * unitCost;

    const batch = {
      id: Date.now().toString(),
      product: selectedProduct,
      method: selectedMethod,
      startWeek,
      completionWeek,
      quantity: totalUnits,
      batches: selectedBatches,
      unitCost,
      totalCost,
      status: 'scheduled',
      timestamp: new Date().toISOString(),
    };

    addBatchMutation.mutate(batch);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProductName = (productKey: string) => {
    const names = {
      jacket: "Vintage Denim Jacket",
      dress: "Floral Print Dress", 
      pants: "Corduroy Pants"
    };
    return names[productKey as keyof typeof names] || productKey;
  };

  const getBatchStatus = (batch: any) => {
    const currentWeek = currentState?.weekNumber || 1;
    if (batch.completionWeek <= currentWeek) {
      return { status: 'completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 };
    } else if (batch.startWeek <= currentWeek) {
      return { status: 'in-progress', color: 'bg-blue-100 text-blue-800', icon: Clock };
    } else {
      return { status: 'scheduled', color: 'bg-gray-100 text-gray-800', icon: Calendar };
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Production Planning</h1>
        <p className="text-gray-600">Schedule production batches to meet launch deadline (Week 7)</p>
      </div>

      {/* Production Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* In-house Production */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory size={20} />
              <TooltipWrapper content="Your own manufacturing facility. It is cheaper per unit but has limited weekly capacity and longer production lead times (2-3 weeks).">
                <span className="cursor-help">In-house Production</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Lower cost, longer lead times, capacity constraints</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Cost per unit:</span>
                <div className="font-medium">£8.00 - £15.00</div>
              </div>
              <div>
                <span className="text-gray-600">Lead time:</span>
                <div className="font-medium">2-3 weeks</div>
              </div>
              <div>
                <span className="text-gray-600">Batch size:</span>
                <div className="font-medium text-primary">25,000 units (fixed)</div>
              </div>
              <div>
                <span className="text-gray-600">Capacity:</span>
                <div className="font-medium">Variable by week</div>
              </div>
            </div>
            
            {/* Capacity Timeline */}
            <div className="pt-4 border-t border-gray-100">
              <h4 className="font-medium text-gray-900 mb-3">
                <TooltipWrapper content="The maximum number of units your in-house facility can produce each week. You cannot schedule more production than the available capacity.">
                  <span className="cursor-help">Weekly Capacity Schedule</span>
                </TooltipWrapper>
              </h4>
              <div className="space-y-2">
                {capacityData.map((week) => (
                  <div key={week.week} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Week {week.week}:</span>
                    <div className="flex items-center gap-2 flex-1 max-w-32">
                      <Progress 
                        value={getCapacityPercentage(week.used, week.capacity)} 
                        className="flex-1 h-2" 
                      />
                      <span className="font-mono text-xs">
                        {week.used.toLocaleString()}/{week.capacity.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outsourced Production */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} />
              <TooltipWrapper content="A third-party manufacturer. It is more expensive per unit but offers unlimited capacity and very fast lead times (1 week). Use this to quickly respond to demand or meet tight deadlines.">
                <span className="cursor-help">Outsourced Production</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Higher cost, faster delivery, unlimited capacity</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Cost per unit:</span>
                <div className="font-medium">£14.00 - £25.00</div>
              </div>
              <div>
                <span className="text-gray-600">Lead time:</span>
                <div className="font-medium">1 week</div>
              </div>
              <div>
                <span className="text-gray-600">Capacity:</span>
                <div className="font-medium text-secondary">Unlimited</div>
              </div>
              <div>
                <span className="text-gray-600">Batch size:</span>
                <div className="font-medium text-primary">25,000 units (fixed)</div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center p-3 bg-secondary bg-opacity-10 rounded-lg">
                <Zap className="text-secondary mr-3" size={20} />
                <div>
                  <div className="font-medium text-secondary">Fast Track Available</div>
                  <div className="text-sm text-gray-600">Perfect for tight deadlines</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Schedule */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle>Production Schedule</CardTitle>
          <p className="text-sm text-gray-600">Plan your production batches to meet the Week 7 launch deadline</p>
        </CardHeader>
        <CardContent>
          {/* Add Production Batch */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-4">Schedule New Production Batch</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(productData).length > 0 ? (
                      Object.keys(productData).map(product => (
                        <SelectItem key={product} value={product}>
                          {getProductName(product)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>Complete design phase first</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <Select value={selectedBatches.toString()} onValueChange={(value) => setSelectedBatches(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 batch (25,000 units)</SelectItem>
                    <SelectItem value="2">2 batches (50,000 units)</SelectItem>
                    <SelectItem value="3">3 batches (75,000 units)</SelectItem>
                    <SelectItem value="4">4 batches (100,000 units)</SelectItem>
                    <SelectItem value="5">5 batches (125,000 units)</SelectItem>
                    <SelectItem value="6">6 batches (150,000 units)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Each batch = 25,000 units</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Production Method</label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inhouse">
                      In-house ({manufacturingCosts[selectedProduct]?.inHouseTime || 2}-3 weeks, {formatCurrency(manufacturingCosts[selectedProduct]?.inHouseCost || 10)}/unit)
                    </SelectItem>
                    <SelectItem value="outsourced">
                      Outsourced ({manufacturingCosts[selectedProduct]?.outsourceTime || 1} week, {formatCurrency(manufacturingCosts[selectedProduct]?.outsourceCost || 15)}/unit)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
                <Select value={selectedStartWeek} onValueChange={setSelectedStartWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6].filter(week => week >= (currentState?.weekNumber || 1)).map(week => (
                      <SelectItem key={week} value={week.toString()}>
                        Week {week}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  className="w-full" 
                  onClick={handleAddBatch}
                  disabled={addBatchMutation.isPending || !selectedProduct || !selectedMethod || !selectedStartWeek}
                >
                  {addBatchMutation.isPending ? "Scheduling..." : `Schedule ${selectedBatches} Batch${selectedBatches > 1 ? 'es' : ''}`}
                </Button>
              </div>
            </div>
            
            {selectedProduct && selectedMethod && selectedStartWeek && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Batch Preview</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>• Product: {getProductName(selectedProduct)}</div>
                  <div>• Quantity: {(selectedBatches * 25000).toLocaleString()} units ({selectedBatches} batch{selectedBatches > 1 ? 'es' : ''})</div>
                  <div>• Total Cost: {formatCurrency((selectedBatches * 25000) * (selectedMethod === 'inhouse' ? (manufacturingCosts[selectedProduct]?.inHouseCost || 10) : (manufacturingCosts[selectedProduct]?.outsourceCost || 15)))}</div>
                  <div>• Completion: Week {parseInt(selectedStartWeek) + (selectedMethod === 'inhouse' ? (manufacturingCosts[selectedProduct]?.inHouseTime || 2) : (manufacturingCosts[selectedProduct]?.outsourceTime || 1))}</div>
                  
                  {/* Material availability check */}
                  {(() => {
                    const productMaterial = productData[selectedProduct]?.fabric;
                    const materialPurchases = currentState?.materialPurchases || [];
                    const materialAvailable = materialPurchases.some((purchase: any) => 
                      purchase.shipmentWeek <= parseInt(selectedStartWeek) && 
                      purchase.orders?.some((order: any) => order.material === productMaterial)
                    );
                    
                    return (
                      <div className={`flex items-center gap-2 ${materialAvailable ? 'text-green-700' : 'text-red-700'}`}>
                        {materialAvailable ? '✓' : '⚠'} Materials ({productMaterial}): {materialAvailable ? 'Available' : 'Not available by start week'}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Scheduled Batches */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Scheduled Production Batches</h3>
            {scheduledBatches.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Factory className="mx-auto mb-2" size={48} />
                <p>No production batches scheduled yet</p>
                <p className="text-sm">Add your first batch above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledBatches.map((batch: any) => {
                  const statusInfo = getBatchStatus(batch);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <div key={batch.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <StatusIcon size={20} className="text-gray-600" />
                          <div>
                            <h4 className="font-medium text-gray-900">{getProductName(batch.product)}</h4>
                            <p className="text-sm text-gray-600">
                              {batch.quantity?.toLocaleString()} units 
                              {batch.batches && ` (${batch.batches} batch${batch.batches > 1 ? 'es' : ''})`}
                            </p>
                          </div>
                        </div>
                        <Badge className={statusInfo.color}>
                          {statusInfo.status.replace('-', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Method:</span>
                          <div className="font-medium">{batch.method === 'inhouse' ? 'In-house' : 'Outsourced'}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Start Week:</span>
                          <div className="font-medium">Week {batch.startWeek}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Completion:</span>
                          <div className="font-medium">Week {batch.completionWeek}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Total Cost:</span>
                          <div className="font-medium">{formatCurrency(batch.totalCost || 0)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
