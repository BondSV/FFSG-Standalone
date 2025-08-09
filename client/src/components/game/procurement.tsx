import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ShoppingCart, Calculator, Palette, Truck, PoundSterling, History, Lock, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";

interface ProcurementProps {
  gameSession: any;
  currentState: any;
}

interface MaterialOrder {
  supplier: 'supplier1' | 'supplier2';
  material: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
}

interface ContractData {
  type: 'fvc' | 'gmc' | 'spot' | null;
  supplier: 'supplier1' | 'supplier2' | 'both';
  orders: MaterialOrder[];
  totalCommitment: number;
  discount: number;
}

export default function Procurement({ gameSession, currentState }: ProcurementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: gameConstants } = useQuery({ queryKey: ["/api/game/constants"], retry: false });
  
  const productData = currentState?.productData || {};
  const designLockedAll = ['jacket', 'dress', 'pants'].every((p) => productData?.[p]?.designLocked);
  const currentWeek = currentState?.weekNumber || 1;

  // Initialize form data from current state
  const [contractData, setContractData] = useState<ContractData>({
    type: currentState?.procurementContracts?.type || null,
    supplier: currentState?.procurementContracts?.supplier || 'supplier1',
    orders: currentState?.procurementContracts?.orders || [],
    totalCommitment: 0,
    discount: 0,
  });

  const [materialQuantities, setMaterialQuantities] = useState<Record<string, number>>({
    selvedgeDenim: 0,
    standardDenim: 0,
    egyptianCotton: 0,
    polyesterBlend: 0,
    fineWaleCorduroy: 0,
    wideWaleCorduroy: 0,
  });

  const [printOptions, setPrintOptions] = useState<Record<string, boolean>>({
    selvedgeDenim: false,
    standardDenim: false,
    egyptianCotton: false,
    polyesterBlend: false,
    fineWaleCorduroy: false,
    wideWaleCorduroy: false,
  });

  const [selectedSupplier, setSelectedSupplier] = useState<'supplier1' | 'supplier2'>('supplier1');
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({});
  const [gmcCommitments, setGmcCommitments] = useState<Record<string, number>>(() => {
    return (currentState?.procurementContracts?.gmcCommitments as Record<string, number>) || {};
  });

  // Align print options to design per material when locked (auto-check & disable)
  useEffect(() => {
    const next: Record<string, boolean> = { ...printOptions };
    ['jacket', 'dress', 'pants'].forEach((p) => {
      const fabric = productData?.[p]?.fabric;
      const hasPrint = !!productData?.[p]?.hasPrint;
      if (fabric) {
        next[fabric] = hasPrint;
      }
    });
    setPrintOptions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productData?.jacket?.fabric, productData?.dress?.fabric, productData?.pants?.fabric, productData?.jacket?.hasPrint, productData?.dress?.hasPrint, productData?.pants?.hasPrint]);

  // Load existing procurement data
  useEffect(() => {
    if (currentState?.procurementContracts) {
      const contracts = currentState.procurementContracts;
      setContractData({
        type: contracts.type || null,
        supplier: contracts.supplier || 'supplier1',
        orders: contracts.orders || [],
        totalCommitment: contracts.totalCommitment || 0,
        discount: contracts.discount || 0,
      });
      if (contracts.supplier) setSelectedSupplier(contracts.supplier);
      if (contracts.materialQuantities) setMaterialQuantities(contracts.materialQuantities);
      if (contracts.printOptions) setPrintOptions(contracts.printOptions);
    }
  }, [currentState]);

  // Material prices for both suppliers (base prices)
  const supplierPrices = {
    supplier1: {
      selvedgeDenim: 16,
      standardDenim: 10,
      egyptianCotton: 12,
      polyesterBlend: 7,
      fineWaleCorduroy: 14,
      wideWaleCorduroy: 9,
    },
    supplier2: {
      selvedgeDenim: 13,
      egyptianCotton: 10,
      polyesterBlend: 6,
      fineWaleCorduroy: 11,
      wideWaleCorduroy: 7,
    },
  } as const;

  // Print surcharges for both suppliers
  const printSurcharges = {
    supplier1: {
      selvedgeDenim: 3,
      standardDenim: 3,
      egyptianCotton: 2,
      polyesterBlend: 2,
      fineWaleCorduroy: 3,
      wideWaleCorduroy: 3,
    },
    supplier2: {
      selvedgeDenim: 2,
      egyptianCotton: 1,
      polyesterBlend: 1,
      fineWaleCorduroy: 2,
      wideWaleCorduroy: 2,
    },
  } as const;

  // Selected fabrics per design and locked print map
  const selectedFabrics = useMemo(() => {
    const set = new Set<string>();
    ['jacket', 'dress', 'pants'].forEach((p) => {
      const f = productData?.[p]?.fabric;
      if (f) set.add(f);
    });
    return set;
  }, [productData]);
  const printLockedByMaterial = useMemo(() => {
    const map: Record<string, boolean> = {};
    ['jacket', 'dress', 'pants'].forEach((p) => {
      const f = productData?.[p]?.fabric;
      const pr = !!productData?.[p]?.hasPrint;
      if (f && pr) map[f] = true;
    });
    return map;
  }, [productData]);

  // Helper: supplier basket counts (number of materials with qty > 0 for that supplier)
  const getSupplierBasketCount = (supplier: 'supplier1' | 'supplier2') => {
    return Object.keys(supplierPrices[supplier]).reduce((count, material) => {
      return count + ((materialQuantities[material] || 0) > 0 ? 1 : 0);
    }, 0);
  };

  // Calculate totals
  useEffect(() => {
    const orders: MaterialOrder[] = [];
    let totalVolume = 0;
    let totalCost = 0;

    Object.entries(materialQuantities).forEach(([material, quantity]) => {
      if (quantity > 0) {
        const basePrice = (supplierPrices as any)[selectedSupplier]?.[material];
        const printSurcharge = (printOptions as any)[material]
          ? (printSurcharges as any)[selectedSupplier]?.[material] || 0
          : 0;
        if (basePrice !== undefined) {
          const unitPrice = basePrice + printSurcharge;
          const order: MaterialOrder = { supplier: selectedSupplier, material, quantity, unitPrice, totalCost: quantity * unitPrice };
          orders.push(order);
          totalVolume += quantity;
          totalCost += order.totalCost;
        }
      }
    });

    const seasonNeed = (gameConstants?.PRODUCTS?.jacket?.forecast || 0) + (gameConstants?.PRODUCTS?.dress?.forecast || 0) + (gameConstants?.PRODUCTS?.pants?.forecast || 0);
    const isWeek1 = currentWeek === 1;
    const singleSupplierBonusEligible = isWeek1 && totalVolume >= seasonNeed;
    const supplierMax = selectedSupplier === 'supplier1' ? 0.15 : 0.10;

    const tierDiscount = (totalVolume >= 500000) ? 0.12 : (totalVolume >= 300000) ? 0.07 : (totalVolume >= 100000) ? 0.03 : 0;
    const appliedDiscount = singleSupplierBonusEligible ? supplierMax : tierDiscount;
    const discountedCost = totalCost * (1 - appliedDiscount);

    setContractData(prev => ({ ...prev, orders, totalCommitment: discountedCost, discount: appliedDiscount * 100 }));
  }, [materialQuantities, printOptions, selectedSupplier, gameConstants, currentWeek]);

  // Save procurement data mutation
  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => { await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, updates); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game', gameSession?.id, 'weeks'] });
      toast({ title: "Materials Purchased Successfully!", description: `£${contractData.totalCommitment.toLocaleString()} charged. Materials arrive Week ${currentWeek + (contractData.type === 'spot' ? 1 : contractData.type === 'fvc' ? 3 : 2)}.` });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to save procurement data. Please try again.", variant: "destructive" });
    },
  });

  const handleContractSelect = (contractType: 'fvc' | 'gmc' | 'spot') => {
    setContractData(prev => ({ ...prev, type: contractType }));
  };

  const handleMaterialQuantityChange = (material: string, quantity: number) => {
    const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
    const safeQuantity = Math.max(0, quantity);
    if (safeQuantity % batchSize !== 0) {
      setQuantityErrors(prev => ({ ...prev, [material]: `Quantity must be a multiple of ${batchSize.toLocaleString()}` }));
    } else {
      setQuantityErrors(prev => { const { [material]: _, ...rest } = prev; return rest; });
    }
    setMaterialQuantities(prev => ({ ...prev, [material]: safeQuantity }));
  };

  const handlePrintOptionChange = (material: string, hasPrint: boolean) => {
    setPrintOptions(prev => ({ ...prev, [material]: hasPrint }));
  };

  const handleBuyMaterials = () => {
    if (contractData.orders.length === 0) {
      toast({ title: "No Materials Selected", description: "Please select materials and quantities before purchasing.", variant: "destructive" });
      return;
    }
    if (Object.keys(quantityErrors).length > 0) {
      toast({ title: "Invalid Quantities", description: "Fix quantity errors before purchasing.", variant: "destructive" });
      return;
    }

    // Calculate shipment arrival week based on contract type and current week
    let shipmentWeek = currentWeek + 1; // Default: next week
    if (contractData.type === 'spot') shipmentWeek = currentWeek + 1;
    else if (contractData.type === 'fvc') shipmentWeek = currentWeek + 3;
    else if (contractData.type === 'gmc') shipmentWeek = currentWeek + 2;

    const materialPurchase = {
      ...contractData,
      supplier: selectedSupplier,
      printOptions,
      materialQuantities,
      purchaseWeek: currentWeek,
      shipmentWeek,
      timestamp: new Date().toISOString(),
      status: 'ordered',
      totalUnits: Object.values(materialQuantities).reduce((s: number, v: any) => s + (Number(v) || 0), 0),
      canDelete: true,
    };

    const updates: any = {
      materialPurchases: [ ...(currentState?.materialPurchases || []), materialPurchase ]
    };
    if (contractData.type === 'gmc') updates.gmcCommitments = gmcCommitments;
    updateStateMutation.mutate(updates);

    toast({ title: "Materials Purchased!", description: `Materials ordered from ${selectedSupplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'}. Shipment arrives Week ${shipmentWeek}.` });

    // Reset basket
    setMaterialQuantities({ selvedgeDenim: 0, standardDenim: 0, egyptianCotton: 0, polyesterBlend: 0, fineWaleCorduroy: 0, wideWaleCorduroy: 0 });
  };

  const handleRemovePurchase = async (timestamp: string) => {
    const newList = (currentState?.materialPurchases || []).filter((p: any) => p.timestamp !== timestamp);
    try {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, { materialPurchases: newList });
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({ title: 'Removed', description: 'Order removed from this week.' });
    } catch (e) {
      if (isUnauthorizedError(e)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/api/login'; }, 500); return;
      }
      toast({ title: 'Error', description: 'Failed to remove order. Try again.', variant: 'destructive' });
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  const canPlaceOrders = currentWeek <= 6;
  const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
  const totalUnits = Object.values(materialQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  const tierLabel = contractData.discount >= 15 ? 'Single Supplier Bonus' : totalUnits >= 500000 ? 'Tier 3 (12%)' : totalUnits >= 300000 ? 'Tier 2 (7%)' : totalUnits >= 100000 ? 'Tier 1 (3%)' : 'No Discount';
  const downPaymentNow = !contractData.type ? 0 : contractData.type === 'fvc' ? contractData.totalCommitment * 0.25 : contractData.type === 'gmc' ? contractData.totalCommitment * 0.40 : 0;

  // Season need and 70% marker for GMC
  const seasonNeed = (gameConstants?.PRODUCTS?.jacket?.forecast || 0) + (gameConstants?.PRODUCTS?.dress?.forecast || 0) + (gameConstants?.PRODUCTS?.pants?.forecast || 0);
  const minGmcUnits = Math.round(seasonNeed * 0.7);
  const currentGmc = gmcCommitments[selectedSupplier] || 0;

  // Estimate avg unit price for penalty preview (avg across selected fabrics available from supplier; fallback to supplier avg)
  const selectedForSupplier = Array.from(selectedFabrics).filter((m) => (supplierPrices as any)[selectedSupplier][m] !== undefined);
  const avgUnit = selectedForSupplier.length > 0
    ? selectedForSupplier.reduce((s, m) => s + ((supplierPrices as any)[selectedSupplier][m] + ((printLockedByMaterial as any)[m] ? ((printSurcharges as any)[selectedSupplier][m] || 0) : 0)), 0) / selectedForSupplier.length
    : Object.values((supplierPrices as any)[selectedSupplier]).reduce((s: number, v: any) => s + Number(v || 0), 0) / Object.values((supplierPrices as any)[selectedSupplier]).length;
  const maxPenalty = Math.round(currentGmc * avgUnit * 0.2);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Procurement</h1>
        <p className="text-gray-600">Secure materials from suppliers with optimal contract terms</p>
      </div>

      {/* Previous Material Purchases */}
      {currentState?.materialPurchases && currentState.materialPurchases.length > 0 && (
        <Card className="border border-gray-100 mb-6">
          <CardHeader>
            <CardTitle>Material Purchase History</CardTitle>
            <p className="text-sm text-gray-600">Track your material orders and shipment status</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {currentState.materialPurchases.map((purchase: any, index: number) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium text-sm">
                        {purchase.supplier === 'supplier1' ? 'Supplier A' : 'Supplier B'} - 
                        {purchase.type === 'spot' ? ' Spot Order' : ' Forward Contract'}
                      </span>
                      <div className="text-xs text-gray-500">
                        Ordered Week {purchase.purchaseWeek} • Arrives Week {purchase.shipmentWeek}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{formatCurrency(purchase.totalCommitment)}</div>
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        purchase.shipmentWeek <= (currentState?.weekNumber || 1)
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {purchase.shipmentWeek <= (currentState?.weekNumber || 1) ? 'Arrived' : 'In Transit'}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    {purchase.orders?.map((order: any, orderIndex: number) => {
                      const defectRate = purchase.supplier === 'supplier2' ? 0.05 : 0;
                      const goodUnits = Math.round(order.quantity * (1 - defectRate));
                      return (
                        <span key={orderIndex}>
                          {order.material.replace(/([A-Z])/g, ' $1').trim()}: {order.quantity.toLocaleString()} units
                          {defectRate > 0 && (
                            <span className="text-gray-500"> (est. usable {goodUnits.toLocaleString()})</span>
                          )}
                          {orderIndex < purchase.orders.length - 1 ? ' • ' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supplier Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Supplier 1 */}
        <Card className="border border-gray-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <TooltipWrapper content="A premium supplier known for high-quality materials (0% defect rate) and reliability, but at a higher cost.">
                  <span className="cursor-help">Supplier-1 (Premium)</span>
                </TooltipWrapper>
              </CardTitle>
              <Badge className="bg-secondary text-white">0% Defects</Badge>
            </div>
            <p className="text-sm text-gray-600">Premium quality, higher cost, 2-week lead time</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Quality:</span>
                <div className="font-medium">Premium (0% defects)</div>
              </div>
              <div>
                <span className="text-gray-600">Lead Time:</span>
                <div className="font-medium">2 weeks</div>
              </div>
              <div>
                <span className="text-gray-600">Max Discount:</span>
                <div className="font-medium">15%</div>
              </div>
              <div>
                <span className="text-gray-600">Single Supplier Bonus:</span>
                <div className="font-medium">Yes</div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <h4 className="font-medium text-gray-900 mb-3">Material Prices (per unit)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Selvedge Denim:</span>
                  <span className="font-mono font-medium">£16.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Standard Denim:</span>
                  <span className="font-mono font-medium">£10.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Egyptian Cotton:</span>
                  <span className="font-mono font-medium">£12.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Polyester Blend:</span>
                  <span className="font-mono font-medium">£7.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fine-Wale Corduroy:</span>
                  <span className="font-mono font-medium">£14.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wide-Wale Corduroy:</span>
                  <span className="font-mono font-medium">£9.00</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier 2 */}
        <Card className="border border-gray-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <TooltipWrapper content="An economy supplier offering lower prices but with variable quality, resulting in up to a 5% defect rate on shipments. You must plan for potential material loss.">
                  <span className="cursor-help">Supplier-2 (Standard)</span>
                </TooltipWrapper>
              </CardTitle>
              <Badge className="bg-accent text-white">Up to 5% Defects</Badge>
            </div>
            <p className="text-sm text-gray-600">Standard quality, lower cost, 2-week lead time</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Quality:</span>
                <div className="font-medium">Standard (up to 5% defects)</div>
              </div>
              <div>
                <span className="text-gray-600">Lead Time:</span>
                <div className="font-medium">2 weeks</div>
              </div>
              <div>
                <span className="text-gray-600">Max Discount:</span>
                <div className="font-medium">10%</div>
              </div>
              <div>
                <span className="text-gray-600">Single Supplier Bonus:</span>
                <div className="font-medium">Yes</div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <h4 className="font-medium text-gray-900 mb-3">Material Prices (per unit)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Selvedge Denim:</span>
                  <span className="font-mono font-medium">£13.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Egyptian Cotton:</span>
                  <span className="font-mono font-medium">£10.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Polyester Blend:</span>
                  <span className="font-mono font-medium">£6.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fine-Wale Corduroy:</span>
                  <span className="font-mono font-medium">£11.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wide-Wale Corduroy:</span>
                  <span className="font-mono font-medium">£7.00</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Procurement Planner */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Procurement Planner</CardTitle>
          <p className="text-sm text-gray-600">1) Choose contract. 2) Set GMC commitment (if chosen). 3) Place weekly material orders.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Supplier select (first) */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Supplier</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={selectedSupplier === 'supplier1' ? 'default' : 'outline'} onClick={() => setSelectedSupplier('supplier1')} className="justify-between">
                  <span>Supplier-1</span>
                  <Badge variant="secondary">{getSupplierBasketCount('supplier1')}</Badge>
                </Button>
                <Button variant={selectedSupplier === 'supplier2' ? 'default' : 'outline'} onClick={() => setSelectedSupplier('supplier2')} className="justify-between">
                  <span>Supplier-2</span>
                  <Badge variant="secondary">{getSupplierBasketCount('supplier2')}</Badge>
                </Button>
              </div>
            </div>
            {/* Contract picker */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Contract</h3>
              <div className="space-y-2">
                <Button variant={contractData.type === 'fvc' ? 'default' : 'outline'} className="w-full justify-start" onClick={() => handleContractSelect('fvc')}>FVC (30% now, 70% in 8w)</Button>
                <Button variant={contractData.type === 'gmc' ? 'default' : 'outline'} className="w-full justify-start" onClick={() => handleContractSelect('gmc')}>GMC (2w settlement per batch)</Button>
                <Button variant={contractData.type === 'spot' ? 'default' : 'outline'} className="w-full justify-start" disabled={currentWeek <= 2} onClick={() => currentWeek > 2 && handleContractSelect('spot')}>SPT (pay on delivery)</Button>
              </div>
            </div>
            {/* GMC commitment */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">GMC Commitment</h3>
                {contractData.type !== 'gmc' && (<span className="text-xs text-gray-500">Activate GMC to set commitment</span>)}
              </div>
              <p className="text-xs text-gray-600 mb-2">Total season units with this supplier. Counts for discounts. Min 70% of season need.</p>
              <div className="space-y-2">
                <Slider
                  value={[currentGmc]}
                  onValueChange={(v) => setGmcCommitments(prev => ({ ...prev, [selectedSupplier]: Number(v[0] || 0) }))}
                  min={0}
                  max={seasonNeed}
                  step={batchSize}
                  disabled={contractData.type !== 'gmc'}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={currentGmc || 0}
                    onChange={(e) => setGmcCommitments(prev => ({ ...prev, [selectedSupplier]: Math.max(0, Number(e.target.value || 0)) }))}
                    disabled={contractData.type !== 'gmc'}
                    className="w-40"
                  />
                  <span className="text-xs text-gray-600">Batch size {batchSize.toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-600">Min recommended: {minGmcUnits.toLocaleString()} units (70% of {seasonNeed.toLocaleString()})</div>
              </div>
              {contractData.type === 'gmc' && (
                <div className="mt-3 p-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  Potential penalty at W15 for undelivered units: up to {formatCurrency(maxPenalty)} (20% of undelivered value; est. £{Math.round(avgUnit)} per unit)
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Material Ordering Interface */}
      {contractData.type && (
        <Card className="border border-gray-100 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart size={20} />
              Material Orders
            </CardTitle>
            <p className="text-sm text-gray-600">Specify quantities for each material type from your selected supplier</p>
          </CardHeader>
          <CardContent>
            {/* Supplier Selection */}
            <div className="mb-6">
              <Label className="text-base font-medium">Select Supplier</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Button
                  variant={selectedSupplier === 'supplier1' ? 'default' : 'outline'}
                  onClick={() => setSelectedSupplier('supplier1')}
                  className="justify-between"
                >
                  <span>Supplier-1 (Premium) - 0% Defects</span>
                  <Badge variant="secondary">{getSupplierBasketCount('supplier1')}</Badge>
                </Button>
                <Button
                  variant={selectedSupplier === 'supplier2' ? 'default' : 'outline'}
                  onClick={() => setSelectedSupplier('supplier2')}
                  className="justify-between"
                >
                  <span>Supplier-2 (Standard) - Up to 5% Defects</span>
                  <Badge variant="secondary">{getSupplierBasketCount('supplier2')}</Badge>
                </Button>
              </div>
            </div>

            {/* Material Quantity Inputs with design constraints */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(supplierPrices[selectedSupplier]).map((material) => {
                  const basePrice = (supplierPrices as any)[selectedSupplier][material];
                  const printSurcharge = (printSurcharges as any)[selectedSupplier][material] || 0;
                  const isSelected = selectedFabrics.has(material);
                  const isDisabled = designLockedAll && !isSelected;
                  const isPrintForced = designLockedAll && !!printLockedByMaterial[material];
                  const finalChecked = isPrintForced ? true : !!printOptions[material];
                  const finalPrice = basePrice + (finalChecked ? printSurcharge : 0);

                  return (
                    <div key={material} className={`border border-gray-200 rounded-lg p-4 ${isDisabled ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium capitalize">{material.replace(/([A-Z])/g, ' $1').trim()}</Label>
                        {isDisabled && designLockedAll && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500"><Lock size={10}/> Not in Design</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        Base Price: {formatCurrency(basePrice)}{printSurcharge > 0 && (<span className="ml-1">(Print: +{formatCurrency(printSurcharge)})</span>)}
                      </div>

                      {/* Print Option */}
                      <div className="flex items-center space-x-2 mb-3">
                        <Checkbox id={`print-${material}`} checked={finalChecked} onCheckedChange={(checked) => !isPrintForced && !isDisabled && handlePrintOptionChange(material, !!checked)} disabled={isPrintForced || isDisabled} />
                        <Label htmlFor={`print-${material}`} className={`text-xs text-gray-600 flex items-center gap-1 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Palette size={12} /> Add Print (+{formatCurrency(printSurcharge)})
                        </Label>
                        {isPrintForced && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500"><Lock size={10}/> Locked</span>
                        )}
                      </div>

                      <Input type="number" min="0" step={batchSize} value={materialQuantities[material] || ''} onChange={(e) => !isDisabled && handleMaterialQuantityChange(material, parseInt(e.target.value) || 0)} placeholder={`0 (x ${batchSize.toLocaleString()})`} className="mb-2" disabled={isDisabled} />
                      {quantityErrors[material] && (<div className="text-xs text-red-600 mb-1">{quantityErrors[material]}</div>)}
                      <div className="text-xs text-gray-600">
                        <div>Unit Price: {formatCurrency(finalPrice)}</div>
                        <div className="font-medium">Total: {formatCurrency((materialQuantities[material] || 0) * finalPrice)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message when design locked and no materials for this supplier */}
              {designLockedAll && Array.from(selectedFabrics).filter((m) => (supplierPrices as any)[selectedSupplier][m] === undefined).length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Some selected fabrics are not available from this supplier.
                </div>
              )}
            </div>

            {/* Order Summary */}
            {contractData.orders.length > 0 && (
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Calculator size={16} /> Order Summary</h4>
                <div className="space-y-2">
                  {contractData.orders.map((order, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="capitalize">{order.material.replace(/([A-Z])/g, ' $1').trim()}: {order.quantity.toLocaleString()} units</span>
                      <span className="font-mono">{formatCurrency(order.totalCost)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total Units</span><span className="font-mono text-sm">{totalUnits.toLocaleString()}</span></div>
                    <div className="flex justify-between items-center font-medium"><span>Subtotal:</span><span className="font-mono">{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0))}</span></div>
                    {contractData.discount > 0 && (<div className="flex justify-between items-center text-green-600"><span>{tierLabel} ({contractData.discount.toFixed(1)}%):</span><span className="font-mono">-{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0) * (contractData.discount / 100))}</span></div>)}
                    <div className="flex justify-between items-center text-sm text-gray-700"><span>{contractData.type === 'fvc' ? 'FVC: 30% due now; 70% at W+8' : contractData.type === 'gmc' ? 'GMC: each batch settles at W+2' : 'SPT: pay on delivery (defects not billed)'}</span><span className="font-mono">{contractData.type === 'fvc' ? formatCurrency(downPaymentNow) : ''}</span></div>
                    <div className="flex justify-between items-center font-bold text-lg border-t border-gray-300 pt-2 mt-2"><span>Total Commitment:</span><span className="font-mono">{formatCurrency(contractData.totalCommitment)}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-4 mt-6">
              <Button onClick={handleBuyMaterials} disabled={contractData.orders.length === 0 || updateStateMutation.isPending || !canPlaceOrders} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                {updateStateMutation.isPending ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Processing...</>) : (<><ShoppingCart size={16} />Buy Materials</>)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contracts / Orders Ledger */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History size={18}/> Contracts & Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="week">
            <TabsList>
              <TabsTrigger value="week">This Week's Orders</TabsTrigger>
              <TabsTrigger value="season">Season Commitments & History</TabsTrigger>
            </TabsList>
            <TabsContent value="week" className="mt-4">
              {(currentState?.materialPurchases || []).filter((p: any) => p.purchaseWeek === currentWeek).length === 0 ? (
                <div className="text-sm text-gray-600">No orders placed this week.</div>
              ) : (
                <div className="space-y-3">
                  {(currentState?.materialPurchases || []).filter((p: any) => p.purchaseWeek === currentWeek).map((p: any, idx: number) => {
                    const delivery = p.purchaseWeek + (p.type === 'fvc' ? 3 : p.type === 'spot' ? 1 : 2);
                    return (
                      <div key={idx} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="font-medium">{p.supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} • {p.type?.toUpperCase()}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-gray-600 flex items-center gap-1"><Truck size={14}/> Arrives W{delivery}</div>
                            <Button variant="outline" size="sm" onClick={() => handleRemovePurchase(p.timestamp)} disabled={currentState?.isCommitted || !p.canDelete} className="h-7 px-2">
                              <Trash2 size={14}/> Remove
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1 text-gray-700">
                          {(p.orders || []).map((o: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span className="capitalize">{o.material.replace(/([A-Z])/g, ' $1').trim()} — {o.quantity.toLocaleString()} units</span>
                              <span className="font-mono">{formatCurrency(o.totalCost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="season" className="mt-4">
              {!(currentState?.procurementContracts?.contracts || []).length ? (
                <div className="text-sm text-gray-600">No procurement commitments yet.</div>
              ) : (
                <div className="space-y-3">
                  {(currentState?.procurementContracts?.contracts || []).map((c: any, idx: number) => {
                    const deliveries = c.deliveries || [];
                    const delivered = Number(c.deliveredUnits || 0);
                    const committed = Number(c.units || 0);
                    return (
                      <div key={idx} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between"><div className="font-medium">{c.supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} • {c.type}</div><div className="text-gray-600">Material: <span className="capitalize">{String(c.material).replace(/([A-Z])/g, ' $1').trim()}</span></div></div>
                        <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2"><div>Committed: <span className="font-mono">{committed.toLocaleString()}</span></div><div>Delivered: <span className="font-mono">{delivered.toLocaleString()}</span></div><div>Outstanding: <span className="font-mono">{Math.max(0, committed - delivered).toLocaleString()}</span></div><div>Signed W{c.weekSigned}</div></div>
                        {deliveries.length > 0 && (<div className="mt-2 text-gray-700"><div className="font-medium mb-1">Deliveries</div><div className="space-y-1">{deliveries.map((d: any, i: number) => (<div key={i} className="flex items-center justify-between"><span>W{d.week}: {Number(d.units).toLocaleString()} units</span><span className="flex items-center gap-1 text-gray-600"><PoundSterling size={14}/>{formatCurrency((Number(d.units) || 0) * Number(d.unitPrice || 0))}</span></div>))}</div></div>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
