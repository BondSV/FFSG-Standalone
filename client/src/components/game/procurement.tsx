import { useState, useEffect } from "react";
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
import { ShoppingCart, Calculator, Palette } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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

  // Load existing procurement data when component mounts or currentState changes
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
      
      if (contracts.supplier) {
        setSelectedSupplier(contracts.supplier);
      }

      // Reconstruct material quantities and print options from saved data
      if (contracts.materialQuantities) {
        setMaterialQuantities(contracts.materialQuantities);
      } else if (contracts.orders && contracts.orders.length > 0) {
        const quantities: Record<string, number> = {
          selvedgeDenim: 0,
          standardDenim: 0,
          egyptianCotton: 0,
          polyesterBlend: 0,
          fineWaleCorduroy: 0,
          wideWaleCorduroy: 0,
        };
        
        contracts.orders.forEach((order: MaterialOrder) => {
          quantities[order.material] = order.quantity;
        });
        
        setMaterialQuantities(quantities);
      }

      if (contracts.printOptions) {
        setPrintOptions(contracts.printOptions);
      }
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
  };

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
  };

  // Get materials relevant to the current design choices
  const getRelevantMaterials = () => {
    const productData = currentState?.productData || {};
    const relevantMaterials = new Set<string>();
    
    // Add materials based on design choices
    Object.values(productData).forEach((product: any) => {
      if (product?.fabric) {
        relevantMaterials.add(product.fabric);
      }
    });
    
    // If no design choices made yet, show all materials
    if (relevantMaterials.size === 0) {
      return Object.keys(supplierPrices[selectedSupplier]);
    }
    
    return Array.from(relevantMaterials).filter(material => 
      supplierPrices[selectedSupplier][material as keyof typeof supplierPrices.supplier1] !== undefined
    );
  };

  // Calculate volume discount
  const calculateDiscount = (totalVolume: number, supplier: string) => {
    if (totalVolume >= 500000) return supplier === 'supplier1' ? 0.12 : 0.12;
    if (totalVolume >= 300000) return 0.07;
    if (totalVolume >= 100000) return 0.03;
    return 0;
  };

  // Calculate total cost and commitment
  useEffect(() => {
    const orders: MaterialOrder[] = [];
    let totalVolume = 0;
    let totalCost = 0;

    Object.entries(materialQuantities).forEach(([material, quantity]) => {
      if (quantity > 0) {
        const basePrice = supplierPrices[selectedSupplier][material as keyof typeof supplierPrices.supplier1];
        const printSurcharge = printOptions[material] ? 
          (printSurcharges[selectedSupplier][material as keyof typeof printSurcharges.supplier1] || 0) : 0;
        
        if (basePrice !== undefined) {
          const unitPrice = basePrice + printSurcharge;
          const order: MaterialOrder = {
            supplier: selectedSupplier,
            material,
            quantity,
            unitPrice,
            totalCost: quantity * unitPrice,
          };
          orders.push(order);
          totalVolume += quantity;
          totalCost += order.totalCost;
        }
      }
    });

    // Determine single-supplier bonus eligibility (Week 1 and cover full seasonal need)
    const seasonNeed = (gameConstants?.PRODUCTS?.jacket?.forecast || 0)
      + (gameConstants?.PRODUCTS?.dress?.forecast || 0)
      + (gameConstants?.PRODUCTS?.pants?.forecast || 0);
    const isWeek1 = (currentState?.weekNumber || 1) === 1;
    const singleSupplierBonusEligible = isWeek1 && totalVolume >= seasonNeed;
    const supplierMax = selectedSupplier === 'supplier1' ? 0.15 : 0.10;

    const tierDiscount = calculateDiscount(totalVolume, selectedSupplier);
    const appliedDiscount = singleSupplierBonusEligible ? supplierMax : tierDiscount;
    const discountedCost = totalCost * (1 - appliedDiscount);

    setContractData(prev => ({
      ...prev,
      orders,
      totalCommitment: discountedCost,
      discount: appliedDiscount * 100,
    }));
  }, [materialQuantities, printOptions, selectedSupplier, gameConstants, currentState?.weekNumber]);

  // Save procurement data mutation
  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game', gameSession?.id, 'weeks'] });
      toast({
        title: "Materials Purchased Successfully!",
        description: `£${contractData.totalCommitment.toLocaleString()} charged. Materials arrive Week ${(currentState?.weekNumber || 1) + (contractData.type === 'spot' ? 1 : contractData.type === 'fvc' ? 3 : 2)}.`,
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
        description: "Failed to save procurement data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContractSelect = (contractType: 'fvc' | 'gmc' | 'spot') => {
    setContractData(prev => ({
      ...prev,
      type: contractType,
    }));
  };

  const handleMaterialQuantityChange = (material: string, quantity: number) => {
    const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
    const safeQuantity = Math.max(0, quantity);
    if (safeQuantity % batchSize !== 0) {
      setQuantityErrors(prev => ({ ...prev, [material]: `Quantity must be a multiple of ${batchSize.toLocaleString()}` }));
    } else {
      setQuantityErrors(prev => { const { [material]: _, ...rest } = prev; return rest; });
    }
    setMaterialQuantities(prev => ({
      ...prev,
      [material]: safeQuantity,
    }));
  };

  const handlePrintOptionChange = (material: string, hasPrint: boolean) => {
    setPrintOptions(prev => ({
      ...prev,
      [material]: hasPrint,
    }));
  };

  const handleBuyMaterials = () => {
    if (contractData.orders.length === 0) {
      toast({
        title: "No Materials Selected",
        description: "Please select materials and quantities before purchasing.",
        variant: "destructive",
      });
      return;
    }
    if (Object.keys(quantityErrors).length > 0) {
      toast({ title: "Invalid Quantities", description: "Fix quantity errors before purchasing.", variant: "destructive" });
      return;
    }

    // Calculate shipment arrival week based on contract type and current week
    const currentWeek = currentState?.weekNumber || 1;
    let shipmentWeek = currentWeek + 1; // Default: next week
    
    if (contractData.type === 'spot') {
      shipmentWeek = currentWeek + 1; // Spot orders arrive next week
    } else if (contractData.type === 'fvc') {
      shipmentWeek = currentWeek + 3; // Forward contracts arrive in 3 weeks
    } else if (contractData.type === 'gmc') {
      shipmentWeek = currentWeek + 2; // GMC contracts arrive in 2 weeks
    }

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
    };

    const updates = {
      materialPurchases: [
        ...(currentState?.materialPurchases || []),
        materialPurchase
      ]
    };

    updateStateMutation.mutate(updates);
    
    // Show success message
    toast({
      title: "Materials Purchased!",
      description: `Materials ordered from ${selectedSupplier === 'supplier1' ? 'Supplier A' : 'Supplier B'}. Shipment arrives Week ${shipmentWeek}.`,
      variant: "default",
    });

    // Reset form after successful purchase
    setMaterialQuantities({
      selvedgeDenim: 0,
      standardDenim: 0,
      egyptianCotton: 0,
      polyesterBlend: 0,
      fineWaleCorduroy: 0,
      wideWaleCorduroy: 0,
    });
    setPrintOptions({
      selvedgeDenim: false,
      standardDenim: false,
      egyptianCotton: false,
      polyesterBlend: false,
      fineWaleCorduroy: false,
      wideWaleCorduroy: false,
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

  const canPlaceOrders = currentState?.weekNumber <= 6;  // Can only order in development phase
  const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
  const totalUnits = Object.values(materialQuantities).reduce((s, v) => s + (Number(v) || 0), 0);
  const tierLabel = (() => {
    if (contractData.discount >= 15) return 'Single Supplier Bonus';
    if (totalUnits >= 500000) return 'Tier 3 (12%)';
    if (totalUnits >= 300000) return 'Tier 2 (7%)';
    if (totalUnits >= 100000) return 'Tier 1 (3%)';
    return 'No Discount';
  })();
  const downPaymentNow = (() => {
    if (!contractData.type) return 0;
    if (contractData.type === 'fvc') return contractData.totalCommitment * 0.25;
    if (contractData.type === 'gmc') return contractData.totalCommitment * 0.40;
    return 0; // Spot pays on delivery
  })();
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

      {/* Contract & Ordering Flow - Redesigned */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Procurement Planner</CardTitle>
          <p className="text-sm text-gray-600">1) Choose contract. 2) Set GMC commitment (if chosen). 3) Place weekly material orders.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Contract picker */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Contract</h3>
              <div className="space-y-2">
                <Button variant={contractData.type === 'fvc' ? 'default' : 'outline'} className="w-full justify-start" onClick={() => handleContractSelect('fvc')}>FVC (30% now, 70% in 8w)</Button>
                <Button variant={contractData.type === 'gmc' ? 'default' : 'outline'} className="w-full justify-start" onClick={() => handleContractSelect('gmc')}>GMC (2w settlement per batch)</Button>
                <Button variant={contractData.type === 'spot' ? 'default' : 'outline'} className="w-full justify-start" disabled={currentState?.weekNumber <= 2} onClick={() => currentState?.weekNumber > 2 && handleContractSelect('spot')}>SPT (pay on delivery)</Button>
              </div>
            </div>
            {/* GMC commitment */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">GMC Commitment</h3>
              <p className="text-xs text-gray-600 mb-2">Total season units across materials with this supplier. Counts for discounts. Min 70% of season need.</p>
              <Input type="number" placeholder={`0 (x ${((gameConstants?.BATCH_SIZE as number) || 25000).toLocaleString()})`} disabled={contractData.type !== 'gmc'} onChange={() => { /* store when posting order */ }} />
            </div>
            {/* Supplier select */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Supplier</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={selectedSupplier === 'supplier1' ? 'default' : 'outline'} onClick={() => setSelectedSupplier('supplier1')} className="justify-start">Supplier-1</Button>
                <Button variant={selectedSupplier === 'supplier2' ? 'default' : 'outline'} onClick={() => setSelectedSupplier('supplier2')} className="justify-start">Supplier-2</Button>
              </div>
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
            <p className="text-sm text-gray-600">
              Specify quantities for each material type from your selected supplier
            </p>
          </CardHeader>
          <CardContent>
            {/* Supplier Selection */}
            <div className="mb-6">
              <Label className="text-base font-medium">Select Supplier</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <Button
                  variant={selectedSupplier === 'supplier1' ? 'default' : 'outline'}
                  onClick={() => setSelectedSupplier('supplier1')}
                  className="justify-start"
                >
                  Supplier-1 (Premium) - 0% Defects
                </Button>
                <Button
                  variant={selectedSupplier === 'supplier2' ? 'default' : 'outline'}
                  onClick={() => setSelectedSupplier('supplier2')}
                  className="justify-start"
                >
                  Supplier-2 (Standard) - Up to 5% Defects
                </Button>
              </div>
            </div>

            {/* Material Quantity Inputs */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getRelevantMaterials().map((material) => {
                  const basePrice = supplierPrices[selectedSupplier][material as keyof typeof supplierPrices.supplier1];
                  const printSurcharge = printSurcharges[selectedSupplier][material as keyof typeof printSurcharges.supplier1] || 0;
                  const finalPrice = basePrice + (printOptions[material] ? printSurcharge : 0);
                  
                  return (
                    <div key={material} className="border border-gray-200 rounded-lg p-4">
                      <Label className="text-sm font-medium capitalize">
                        {material.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                      <div className="text-xs text-gray-500 mb-2">
                        Base Price: {formatCurrency(basePrice)}
                        {printSurcharge > 0 && (
                          <span className="ml-1">
                            (Print: +{formatCurrency(printSurcharge)})
                          </span>
                        )}
                      </div>
                      
                      {/* Print Option */}
                      <div className="flex items-center space-x-2 mb-3">
                        <Checkbox
                          id={`print-${material}`}
                          checked={printOptions[material] || false}
                          onCheckedChange={(checked) => handlePrintOptionChange(material, !!checked)}
                        />
                        <Label 
                          htmlFor={`print-${material}`} 
                          className="text-xs text-gray-600 cursor-pointer flex items-center gap-1"
                        >
                          <Palette size={12} />
                          Add Print (+{formatCurrency(printSurcharge)})
                        </Label>
                      </div>

                      <Input
                        type="number"
                        min="0"
                        step={(gameConstants?.BATCH_SIZE as number) || 25000}
                        value={materialQuantities[material] || ''}
                        onChange={(e) => handleMaterialQuantityChange(material, parseInt(e.target.value) || 0)}
                        placeholder={`0 (x ${((gameConstants?.BATCH_SIZE as number) || 25000).toLocaleString()})`}
                        className="mb-2"
                      />
                      {quantityErrors[material] && (
                        <div className="text-xs text-red-600 mb-1">{quantityErrors[material]}</div>
                      )}
                      <div className="text-xs text-gray-600">
                        <div>Unit Price: {formatCurrency(finalPrice)}</div>
                        <div className="font-medium">
                          Total: {formatCurrency((materialQuantities[material] || 0) * finalPrice)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show message if no materials are available based on design choices */}
              {getRelevantMaterials().length === 0 && (
                <div className="text-center p-6 bg-blue-50 border border-blue-200 rounded-lg">
                  <Palette className="mx-auto mb-2 text-blue-500" size={24} />
                  <p className="text-sm text-blue-800 font-medium mb-1">
                    Complete your product designs first
                  </p>
                  <p className="text-xs text-blue-600">
                    Visit the Design tab to select materials for your products. 
                    Only selected materials will appear here for procurement.
                  </p>
                </div>
              )}
            </div>

            {/* Order Summary */}
            {contractData.orders.length > 0 && (
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Calculator size={16} />
                  Order Summary
                </h4>
                <div className="space-y-2">
                  {contractData.orders.map((order, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="capitalize">
                        {order.material.replace(/([A-Z])/g, ' $1').trim()}: {order.quantity.toLocaleString()} units
                      </span>
                      <span className="font-mono">{formatCurrency(order.totalCost)}</span>
                    </div>
                  ))}
                    <div className="border-t border-gray-200 pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Units</span>
                        <span className="font-mono text-sm">{totalUnits.toLocaleString()}</span>
                      </div>
                    <div className="flex justify-between items-center font-medium">
                      <span>Subtotal:</span>
                      <span className="font-mono">{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0))}</span>
                    </div>
                      {contractData.discount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span>{tierLabel} ({contractData.discount.toFixed(1)}%):</span>
                        <span className="font-mono">-{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0) * (contractData.discount / 100))}</span>
                      </div>
                    )}
                      <div className="flex justify-between items-center text-sm text-gray-700">
                        <span>Down Payment Due This Week</span>
                        <span className="font-mono">{formatCurrency(downPaymentNow)}</span>
                      </div>
                    <div className="flex justify-between items-center font-bold text-lg border-t border-gray-300 pt-2 mt-2">
                      <span>Total Commitment:</span>
                      <span className="font-mono">{formatCurrency(contractData.totalCommitment)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-4 mt-6">
              <Button
                onClick={handleBuyMaterials}
                disabled={contractData.orders.length === 0 || updateStateMutation.isPending || !canPlaceOrders}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                {updateStateMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart size={16} />
                    Buy Materials
                  </>
                )}
              </Button>
            </div>

            {/* Shipment Timeline Info */}
            {contractData.orders.length > 0 && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Shipment Timeline</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>• Current Week: {currentState?.weekNumber || 1}</div>
                  <div>• Contract Type: {
                    contractData.type === 'spot' ? 'Spot Order' : 
                    contractData.type === 'fvc' ? 'Forward Contract' : 
                    'GMC Contract'
                  }</div>
                  <div>• Materials will arrive in: <span className="font-medium">
                    Week {(currentState?.weekNumber || 1) + (
                      contractData.type === 'spot' ? 1 : 
                      contractData.type === 'fvc' ? 3 : 2
                    )}
                  </span></div>
                  <div className="text-xs text-blue-600 mt-2">
                    {contractData.type === 'spot' 
                      ? 'Spot orders arrive the following week' 
                      : contractData.type === 'fvc'
                      ? 'Forward contracts take 3 weeks to fulfill'
                      : 'GMC contracts take 2 weeks to fulfill'}
                  </div>
                  <div className="text-xs text-blue-600">Batch Size: {batchSize.toLocaleString()} units</div>
                </div>
              </div>
            )}

            {!canPlaceOrders && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Material ordering is only available during the Strategy and Development phases (Weeks 1-6).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Volume Discount Tiers */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle>Volume Discount Tiers</CardTitle>
          <p className="text-sm text-gray-600">
            <TooltipWrapper content="A dynamic discount applied to your material costs based on the total volume you commit to a single supplier. Larger commitments unlock higher discounts.">
              <span className="cursor-help">Discounts based on total units committed to single supplier</span>
            </TooltipWrapper>
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Tier 1: 100,000 - 299,999 units</div>
                <div className="text-sm text-gray-600">Basic volume discount</div>
              </div>
              <div className="text-lg font-bold text-gray-900">3%</div>
            </div>
            <div className="flex items-center justify-between p-4 bg-secondary bg-opacity-10 rounded-lg">
              <div>
                <div className="font-medium text-secondary">Tier 2: 300,000 - 499,999 units</div>
                <div className="text-sm text-gray-600">Preferred partner discount</div>
              </div>
              <div className="text-lg font-bold text-secondary">7%</div>
            </div>
            <div className="flex items-center justify-between p-4 bg-primary bg-opacity-10 rounded-lg">
              <div>
                <div className="font-medium text-primary">Tier 3: 500,000+ units</div>
                <div className="text-sm text-gray-600">Strategic partnership discount</div>
              </div>
              <div className="text-lg font-bold text-primary">12%</div>
            </div>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg border border-yellow-200">
              <div>
                <div className="font-medium text-yellow-800">Single Supplier Bonus</div>
                <div className="text-sm text-yellow-700">100% commitment to one supplier in Week 1</div>
              </div>
              <div className="text-lg font-bold text-yellow-800">15% (S1) / 10% (S2)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
