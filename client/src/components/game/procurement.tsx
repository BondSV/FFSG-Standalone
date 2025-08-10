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
import { ShoppingCart, Calculator, Palette, Truck, PoundSterling, History, Lock, Trash2, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  type: 'gmc' | 'spot' | null;
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
  // Use best-available marketing info
  const marketingPlan = (currentState as any)?.marketingPlan || { totalSpend: (currentState as any)?.marketingSpend };
  const hasMarketingPlan = marketingPlan && typeof marketingPlan.totalSpend === 'number' && !Number.isNaN(marketingPlan.totalSpend);
  const currentWeek = currentState?.weekNumber || 1;

  const [contractData, setContractData] = useState<ContractData>({ type: null, supplier: currentState?.procurementContracts?.supplier || 'supplier1', orders: [], totalCommitment: 0, discount: 0 });

  const [materialQuantities, setMaterialQuantities] = useState<Record<string, number>>({ selvedgeDenim: 0, standardDenim: 0, egyptianCotton: 0, polyesterBlend: 0, fineWaleCorduroy: 0, wideWaleCorduroy: 0 });
  const [printOptions, setPrintOptions] = useState<Record<string, boolean>>({ selvedgeDenim: false, standardDenim: false, egyptianCotton: false, polyesterBlend: false, fineWaleCorduroy: false, wideWaleCorduroy: false });
  const [selectedSupplier, setSelectedSupplier] = useState<'supplier1' | 'supplier2'>('supplier1');
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({});
  const [gmcCommitments, setGmcCommitments] = useState<Record<string, number>>(() => { return (currentState?.procurementContracts?.gmcCommitments as Record<string, number>) || {} });
  const [dealDialog, setDealDialog] = useState<{ open: boolean; supplier: 'supplier1' | 'supplier2' | null }>({ open: false, supplier: null });
  const [gmcConfirm, setGmcConfirm] = useState<{ open: boolean; supplier: 'supplier1' | 'supplier2' | null }>({ open: false, supplier: null });

  // Prices and surcharges
  const supplierPrices = { supplier1: { selvedgeDenim: 16, standardDenim: 10, egyptianCotton: 12, polyesterBlend: 7, fineWaleCorduroy: 14, wideWaleCorduroy: 9 }, supplier2: { selvedgeDenim: 13, egyptianCotton: 10, polyesterBlend: 6, fineWaleCorduroy: 11, wideWaleCorduroy: 7 } } as const;
  const printSurcharges = { supplier1: { selvedgeDenim: 3, standardDenim: 3, egyptianCotton: 2, polyesterBlend: 2, fineWaleCorduroy: 3, wideWaleCorduroy: 3 }, supplier2: { selvedgeDenim: 2, egyptianCotton: 1, polyesterBlend: 1, fineWaleCorduroy: 2, wideWaleCorduroy: 2 } } as const;

  // Selected fabrics and print locks
  const selectedFabrics = useMemo(() => { const set = new Set<string>(); ['jacket', 'dress', 'pants'].forEach((p) => { const f = productData?.[p]?.fabric; if (f) set.add(f); }); return set; }, [productData]);
  const printForcedMaterials = useMemo(() => { const set = new Set<string>(); ['jacket', 'dress', 'pants'].forEach((p) => { const f = productData?.[p]?.fabric; const locked = !!productData?.[p]?.designLocked; const pr = !!productData?.[p]?.hasPrint; if (f && locked && pr) set.add(f); }); return set; }, [productData]);

  // Sync print options with design locks on load/change
  useEffect(() => {
    const next: Record<string, boolean> = { ...printOptions };
    printForcedMaterials.forEach((mat) => { next[mat] = true; });
    setPrintOptions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printForcedMaterials]);

  // Helper: supplier basket counts
  const getSupplierBasketCount = (supplier: 'supplier1' | 'supplier2') => Object.keys(supplierPrices[supplier]).reduce((count, material) => count + ((materialQuantities[material] || 0) > 0 ? 1 : 0), 0);

  // Demand helpers (match Price Positioning)
  const UNIFIED_ELASTICITY = -1.4;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const computePositionEffect = (price: number, ref: number) => { const d = Math.abs(price / ref - 1); const ceil = 0.95, p = 3, s = 0.21; const base = 1 - Math.exp(-Math.pow(d / s, p)); const bump = 40 * (d * d) * Math.exp(-Math.pow(d / 0.08, 2)); const mag = Math.min(1, ceil * base + bump); const raw = 1 + ((price < ref) ? mag : -mag); return clamp(raw, 0, 2); };
  const fabricLift: Record<string, number> = { selvedgeDenim: 0.06, standardDenim: 0.0, egyptianCotton: 0.05, polyesterBlend: -0.02, fineWaleCorduroy: 0.04, wideWaleCorduroy: 0.0 };
  const printLift = 0.03;
  // Supplier-specific volume discount tiers
  const SUPPLIER_TIERS: Record<'supplier1'|'supplier2', { min: number; max: number; discount: number }[]> = {
    supplier1: [
      { min: 130000, max: 169999, discount: 0.03 },
      { min: 170000, max: 219999, discount: 0.05 },
      { min: 220000, max: 289999, discount: 0.07 },
      { min: 290000, max: 349999, discount: 0.09 },
      { min: 350000, max: 499999, discount: 0.12 },
      { min: 500000, max: Infinity, discount: 0.15 },
    ],
    supplier2: [
      { min: 100000, max: 149999, discount: 0.02 },
      { min: 150000, max: 199999, discount: 0.03 },
      { min: 200000, max: 249999, discount: 0.04 },
      { min: 250000, max: 299999, discount: 0.05 },
      { min: 300000, max: 399999, discount: 0.07 },
      { min: 400000, max: Infinity, discount: 0.09 },
    ],
  };
  const computeTierForSupplier = (supplier: 'supplier1' | 'supplier2', units: number): { discount: number; tierIndex: number | null } => {
    const tiers = SUPPLIER_TIERS[supplier];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (units >= t.min && units <= t.max) return { discount: t.discount, tierIndex: i + 1 };
    }
    return { discount: 0, tierIndex: null };
  };

  // Single Supplier Deal (must be defined before any effects that use it)
  const singleSupplierDeal: 'supplier1' | 'supplier2' | undefined = (currentState?.procurementContracts as any)?.singleSupplierDeal;
  const isSupplierDisabledByDeal = (sup: 'supplier1' | 'supplier2') => singleSupplierDeal && singleSupplierDeal !== sup;
  const projectedSeasonDemand = useMemo(() => {
    if (!gameConstants) return 0;
    const base = gameConstants.PRODUCTS || {};
    // Temporarily exclude marketing from the calculation to match Design tab exactly
    const promoLift = 1.0;
    const products: Array<'jacket' | 'dress' | 'pants'> = ['jacket', 'dress', 'pants'];
    let total = 0;
    products.forEach((p) => {
      const info = base[p]; if (!info) return;
      const refPrice = Number(info.hmPrice) * 1.2;
      // Use locked RRP; if missing, assume reference price to avoid undercounting
      const rrp = Number((productData as any)[p]?.rrp ?? refPrice);
      const priceEffect = Math.pow(rrp / refPrice, UNIFIED_ELASTICITY);
      const posEffect = computePositionEffect(rrp, refPrice);
      const material = (productData as any)[p]?.fabric || '';
      const hasPrint = !!(productData as any)[p]?.hasPrint;
      const designEffect = 1 + (fabricLift[material] || 0) + (hasPrint ? printLift : 0);
      const units = Number(info.forecast) * priceEffect * posEffect * promoLift * designEffect;
      total += Math.round(clamp(units, 0, info.forecast * 2));
    });
     return total;
  }, [gameConstants, productData]);

  // Totals and discounts (based on current basket)
  useEffect(() => {
    const orders: MaterialOrder[] = [];
    let totalVolume = 0, totalCost = 0;
    Object.entries(materialQuantities).forEach(([material, quantity]) => {
      if (quantity > 0) {
        const basePrice = (supplierPrices as any)[selectedSupplier]?.[material];
        const printSurcharge = (printOptions as any)[material] ? (printSurcharges as any)[selectedSupplier]?.[material] || 0 : 0;
        if (basePrice !== undefined) {
          const unitPrice = basePrice + printSurcharge;
          orders.push({ supplier: selectedSupplier, material, quantity, unitPrice, totalCost: quantity * unitPrice });
          totalVolume += quantity; totalCost += quantity * unitPrice;
        }
      }
    });
    const { discount: tierDiscount } = computeTierForSupplier(selectedSupplier, totalVolume);
    const extra = singleSupplierDeal === selectedSupplier ? 0.02 : 0;
    const appliedDiscount = tierDiscount + extra;
    const discountedCost = totalCost * (1 - appliedDiscount);
    setContractData(prev => ({ ...prev, orders, totalCommitment: discountedCost, discount: appliedDiscount * 100 }));
  }, [materialQuantities, printOptions, selectedSupplier, gameConstants, currentWeek]);

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => { await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, updates); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/game/current'] }); queryClient.invalidateQueries({ queryKey: ['/api/game', gameSession?.id, 'weeks'] }); },
    onError: (error) => { if (isUnauthorizedError(error)) { toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" }); setTimeout(() => { window.location.href = "/api/login"; }, 500); return; } toast({ title: "Error", description: "Failed to update procurement data.", variant: "destructive" }); },
  });

  const handleSaveGmc = (supplier: 'supplier1' | 'supplier2') => {
    const updates: any = { gmcCommitments: { ...(currentState?.procurementContracts?.gmcCommitments || {}), [supplier]: gmcCommitments[supplier] || 0 } };
    updateStateMutation.mutate(updates);
    toast({ title: 'GMC Updated', description: `${supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} commitment set to ${(gmcCommitments[supplier] || 0).toLocaleString()} units.` });
  };

  const handleMaterialQuantityChange = (material: string, quantity: number) => {
    const safeQuantity = Math.max(0, quantity);
    const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
    if (safeQuantity % batchSize !== 0) { setQuantityErrors(prev => ({ ...prev, [material]: `Quantity must be a multiple of ${batchSize.toLocaleString()}` })); }
    else { setQuantityErrors(prev => { const { [material]: _, ...rest } = prev; return rest; }); }
    setMaterialQuantities(prev => ({ ...prev, [material]: safeQuantity }));
  };

  const handlePrintOptionChange = (material: string, hasPrint: boolean) => {
    // If design forced print on this fabric, ignore attempts to uncheck
    if (printForcedMaterials.has(material) && !hasPrint) return;
    setPrintOptions(prev => ({ ...prev, [material]: hasPrint }));
  };

  const handleBuyMaterials = () => {
    if (contractData.orders.length === 0) { toast({ title: "No fabrics selected", description: "Please select fabrics and quantities before purchasing.", variant: "destructive" }); return; }
    if (Object.keys(quantityErrors).length > 0) { toast({ title: "Invalid quantities", description: "Fix quantity errors before purchasing.", variant: "destructive" }); return; }

    const isGmcTerms = (gmcCommitments[selectedSupplier] || 0) > 0;
    const orderType: 'gmc' | 'spot' = isGmcTerms ? 'gmc' : 'spot';
    const shipmentWeek = currentWeek + (orderType === 'spot' ? 1 : 2);

    const materialPurchase = { ...contractData, type: orderType, supplier: selectedSupplier, printOptions, materialQuantities, purchaseWeek: currentWeek, shipmentWeek, timestamp: new Date().toISOString(), status: 'ordered', totalUnits: Object.values(materialQuantities).reduce((s: number, v: any) => s + (Number(v) || 0), 0), canDelete: true };
    const updates: any = { materialPurchases: [ ...(currentState?.materialPurchases || []), materialPurchase ] };
    if (orderType === 'gmc') updates.gmcCommitments = gmcCommitments;
    updateStateMutation.mutate(updates);
    toast({ title: "Fabrics Purchased!", description: `Fabrics ordered from ${selectedSupplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'}. Shipment arrives Week ${shipmentWeek}.` });
    setMaterialQuantities({ selvedgeDenim: 0, standardDenim: 0, egyptianCotton: 0, polyesterBlend: 0, fineWaleCorduroy: 0, wideWaleCorduroy: 0 });
  };

  const handleRemovePurchase = async (timestamp: string) => {
    const newList = (currentState?.materialPurchases || []).filter((p: any) => p.timestamp !== timestamp);
    try { await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, { materialPurchases: newList }); queryClient.invalidateQueries({ queryKey: ['/api/game/current'] }); toast({ title: 'Removed', description: 'Order removed from this week.' }); }
    catch (e) { if (isUnauthorizedError(e)) { toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' }); setTimeout(() => { window.location.href = '/api/login'; }, 500); return; } toast({ title: 'Error', description: 'Failed to remove order. Try again.', variant: 'destructive' }); }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  const batchSize = (gameConstants?.BATCH_SIZE as number) || 25000;
  const totalUnits = Object.values(materialQuantities).reduce((s, v) => s + (Number(v) || 0), 0);

  const { tierIndex: currTierIndex } = computeTierForSupplier(selectedSupplier, totalUnits);
  const extraSSD = singleSupplierDeal === selectedSupplier ? 0.02 : 0;

  // Projected demand and penalty preview
  const totalCommitted = (gmcCommitments['supplier1'] || 0) + (gmcCommitments['supplier2'] || 0);
  const overCommitUnits = Math.max(0, totalCommitted - Math.round(projectedSeasonDemand * 1.03));
  const avgUnitForPenalty = (() => { const sup1Vals = Object.values(supplierPrices.supplier1) as number[]; const sup2Vals = Object.values(supplierPrices.supplier2) as number[]; return Math.round((sup1Vals.reduce((a, b) => a + b, 0) / sup1Vals.length + sup2Vals.reduce((a, b) => a + b, 0) / sup2Vals.length) / 2); })();
  const potentialPenalty = overCommitUnits > 0 ? Math.round(overCommitUnits * avgUnitForPenalty * 0.2) : 0;

  // derive single supplier deal from state
  const singleSupplierDeal: 'supplier1' | 'supplier2' | undefined = (currentState?.procurementContracts as any)?.singleSupplierDeal;
  const isSupplierDisabledByDeal = (sup: 'supplier1' | 'supplier2') => singleSupplierDeal && singleSupplierDeal !== sup;

  // Saved GMC commitments in state (used to decide Signed/Not signed and locking)
  const savedGmcCommitments: Record<string, number> = (currentState?.procurementContracts?.gmcCommitments as any) || {};
  const isLocked = (sup: 'supplier1' | 'supplier2') => Number(savedGmcCommitments[sup] || 0) > 0;

  // Helper: cumulative GMC orders placed with a supplier (for infographic)
  const getGmcOrderedUnitsForSupplier = (sup: 'supplier1' | 'supplier2') => {
    const contracts = (currentState?.procurementContracts?.contracts || []) as any[];
    return contracts
      .filter((c) => c.type === 'GMC' && c.supplier === sup)
      .reduce((sum, c) => sum + (c.gmcOrders || []).reduce((s: number, o: any) => s + Number(o.units || o.quantity || 0), 0), 0);
  };

  // If a deal is signed, force selection to that supplier
  useEffect(() => {
    if (singleSupplierDeal && selectedSupplier !== singleSupplierDeal) {
      setSelectedSupplier(singleSupplierDeal);
    }
  }, [singleSupplierDeal]);

  // function to sign deal
  const signSingleSupplierDeal = async (supplier: 'supplier1' | 'supplier2') => {
    try {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, { procurementContracts: { singleSupplierDeal: supplier } });
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({ title: 'Single Supplier Deal Signed', description: `All future orders from ${supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} will receive an additional +2% discount.` });
    } catch (e) {
      if (isUnauthorizedError(e)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/api/login'; }, 500);
        return;
      }
      toast({ title: 'Error', description: 'Failed to sign deal. Please try again.', variant: 'destructive' });
    } finally {
      setDealDialog({ open: false, supplier: null });
    }
  };

  // Confirm and save GMC commitment; locks the supplier pane
  const confirmAndSaveGmc = async (supplier: 'supplier1' | 'supplier2') => {
    try {
      const updates: any = { gmcCommitments: { ...(currentState?.procurementContracts?.gmcCommitments || {}), [supplier]: gmcCommitments[supplier] || 0 } };
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentWeek}/update`, updates);
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({ title: 'GMC Signed', description: `${supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} commitment signed at ${(gmcCommitments[supplier] || 0).toLocaleString()} units.` });
    } catch (e) {
      if (isUnauthorizedError(e)) {
        toast({ title: 'Unauthorized', description: 'You are logged out. Logging in again...', variant: 'destructive' });
        setTimeout(() => { window.location.href = '/api/login'; }, 500);
        return;
      }
      toast({ title: 'Error', description: 'Failed to sign GMC. Please try again.', variant: 'destructive' });
    } finally {
      setGmcConfirm({ open: false, supplier: null });
    }
  };

  // Confirmation dialog for Single Supplier Deal
  const renderDealDialog = () => (
    <Dialog open={dealDialog.open} onOpenChange={(open) => setDealDialog({ open, supplier: open ? dealDialog.supplier : null })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign Single Supplier Deal?</DialogTitle>
          <DialogDescription>
            You’ll receive an additional +2% discount on all future orders from this supplier (on top of any volume discounts).<br/>
            You won’t be able to order from the other supplier afterwards.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDealDialog({ open: false, supplier: null })}>Cancel</Button>
          <Button onClick={() => dealDialog.supplier && signSingleSupplierDeal(dealDialog.supplier)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Procurement</h1>
        <p className="text-gray-600">Secure fabrics from suppliers with optimal contract terms</p>
      </div>

      {/* Supplier Overview (restored large cards) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Supplier-1 Card */}
        <Card className="border border-gray-100 relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Supplier-1 (Premium)</CardTitle>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">0% Defects</Badge>
            </div>
            <p className="text-sm text-gray-600">Premium quality, higher cost, 2-week lead time</p>
          </CardHeader>
          <CardContent className="flex flex-col h-full pb-16">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <div className="text-gray-600">Quality:</div>
                <div className="font-medium">Premium (0% defects)</div>
              </div>
              <div>
                <div className="text-gray-600">Lead Time:</div>
                <div className="font-medium">2 weeks</div>
              </div>
              <div className="col-span-2">
                <div className="font-semibold">Single Supplier Deal: +2% extra (locks other supplier)</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left: materials with price + print surcharge */}
              <div>
                <div className="mb-2 font-semibold">Material Prices (per unit)</div>
                <div className="text-sm text-gray-800">
                  {/* Desktop (3 columns) – only at lg and above */}
                  <div className="hidden xl:grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 font-medium text-gray-600 mb-1">
                    <div className="whitespace-nowrap">Fabric</div>
                    <div className="text-right whitespace-nowrap">Price</div>
                    <div className="text-right whitespace-nowrap">Add Print</div>
                  </div>
                  <div className="hidden xl:block">
                    {Object.keys(supplierPrices.supplier1).map((mat) => (
                      <div key={mat} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 py-0.5">
                        <div className="capitalize whitespace-nowrap">{mat.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="text-right font-mono whitespace-nowrap">{formatCurrency((supplierPrices as any).supplier1[mat])}</div>
                        <div className="text-right font-mono text-gray-700 whitespace-nowrap">+{formatCurrency(((printSurcharges as any).supplier1[mat] || 0))}</div>
                      </div>
                    ))}
                  </div>
                  {/* Mobile/tablet (2 columns): Price (+Print) */}
                  <div className="xl:hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 font-medium text-gray-600 mb-1">
                      <div>Fabric</div>
                      <div className="text-right">Price (+Print)</div>
                    </div>
                    {Object.keys(supplierPrices.supplier1).map((mat) => (
                      <div key={mat} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-0.5">
                        <div className="capitalize whitespace-nowrap">{mat.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="text-right font-mono whitespace-nowrap">
                          {formatCurrency((supplierPrices as any).supplier1[mat])} <span className="text-gray-600">(+{formatCurrency(((printSurcharges as any).supplier1[mat] || 0))})</span>
              </div>
            </div>
                    ))}
                </div>
                </div>
                </div>
              {/* Right: discount tiers for Supplier-1 */}
              <div>
                <div className="mb-2 font-semibold">Discount Tiers</div>
                <div className="text-sm text-gray-800 space-y-1">
                  {(gameConstants?.VOLUME_DISCOUNTS?.supplier1 || [
                    { min:130000, max:169999, discount:0.03 },
                    { min:170000, max:219999, discount:0.05 },
                    { min:220000, max:289999, discount:0.07 },
                    { min:290000, max:349999, discount:0.09 },
                    { min:350000, max:499999, discount:0.12 },
                    { min:500000, max:Infinity, discount:0.15 },
                  ]).map((t:any, i:number)=> (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-x-4">
                      <span className="whitespace-nowrap">{t.max===Infinity ? `${t.min.toLocaleString()}+ units` : `${t.min.toLocaleString()} – ${t.max.toLocaleString()} units`}</span>
                      <span className="font-medium text-right whitespace-nowrap tabular-nums font-mono">{Math.round(t.discount*100)}%</span>
                </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 flex items-center justify-end gap-2">
              {!singleSupplierDeal && (
                <Button variant="outline" onClick={() => setDealDialog({ open: true, supplier: 'supplier1' })}>
                  Sign Single Supplier Deal
                </Button>
              )}
              {singleSupplierDeal === 'supplier1' && (
                <Badge variant="secondary" className="ml-auto"><Lock size={12} className="mr-1"/> Deal signed</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Supplier-2 Card */}
        <Card className="border border-gray-100 relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Supplier-2 (Standard)</CardTitle>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Up to 5% Defects</Badge>
            </div>
            <p className="text-sm text-gray-600">Standard quality, lower cost, 2-week lead time</p>
          </CardHeader>
          <CardContent className="flex flex-col h-full pb-16">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <div className="text-gray-600">Quality:</div>
                <div className="font-medium">Standard (up to 5% defects)</div>
              </div>
              <div>
                <div className="text-gray-600">Lead Time:</div>
                <div className="font-medium">2 weeks</div>
              </div>
              
              <div className="col-span-2">
                <div className="font-semibold">Single Supplier Deal: +2% extra (locks other supplier)</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left: materials with price + print surcharge */}
              <div>
                <div className="mb-2 font-semibold">Material Prices (per unit)</div>
                <div className="text-sm text-gray-800">
                  {/* Desktop (3 columns) – only at lg and above */}
                  <div className="hidden xl:grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 font-medium text-gray-600 mb-1">
                    <div className="whitespace-nowrap">Fabric</div>
                    <div className="text-right whitespace-nowrap">Price</div>
                    <div className="text-right whitespace-nowrap">Add Print</div>
                  </div>
                  <div className="hidden xl:block">
                    {Object.keys(supplierPrices.supplier2).map((mat) => (
                      <div key={mat} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 py-0.5">
                        <div className="capitalize whitespace-nowrap">{mat.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="text-right font-mono whitespace-nowrap">{formatCurrency((supplierPrices as any).supplier2[mat])}</div>
                        <div className="text-right font-mono text-gray-700 whitespace-nowrap">+{formatCurrency(((printSurcharges as any).supplier2[mat] || 0))}</div>
                      </div>
                    ))}
                  </div>
                  {/* Mobile/tablet (2 columns): Price (+Print) */}
                  <div className="xl:hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 font-medium text-gray-600 mb-1">
                      <div>Fabric</div>
                      <div className="text-right">Price (+Print)</div>
                    </div>
                    {Object.keys(supplierPrices.supplier2).map((mat) => (
                      <div key={mat} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-0.5">
                        <div className="capitalize whitespace-nowrap">{mat.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="text-right font-mono whitespace-nowrap">
                          {formatCurrency((supplierPrices as any).supplier2[mat])} <span className="text-gray-600">(+{formatCurrency(((printSurcharges as any).supplier2[mat] || 0))})</span>
              </div>
            </div>
                    ))}
                </div>
                </div>
                </div>
              {/* Right: discount tiers for Supplier-2 */}
              <div>
                <div className="mb-2 font-semibold">Discount Tiers</div>
                <div className="text-sm text-gray-800 space-y-1">
                  {(gameConstants?.VOLUME_DISCOUNTS?.supplier2 || [
                    { min:100000, max:149999, discount:0.02 },
                    { min:150000, max:199999, discount:0.03 },
                    { min:200000, max:249999, discount:0.04 },
                    { min:250000, max:299999, discount:0.05 },
                    { min:300000, max:399999, discount:0.07 },
                    { min:400000, max:Infinity, discount:0.09 },
                  ]).map((t:any, i:number)=> (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-x-4">
                      <span className="whitespace-nowrap">{t.max===Infinity ? `${t.min.toLocaleString()}+ units` : `${t.min.toLocaleString()} – ${t.max.toLocaleString()} units`}</span>
                      <span className="font-medium text-right whitespace-nowrap tabular-nums font-mono">{Math.round(t.discount*100)}%</span>
                </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 flex items-center justify-end gap-2">
              {!singleSupplierDeal && (
                <Button variant="outline" onClick={() => setDealDialog({ open: true, supplier: 'supplier2' })}>
                  Sign Single Supplier Deal
                </Button>
              )}
              {singleSupplierDeal === 'supplier2' && (
                <Badge variant="secondary" className="ml-auto"><Lock size={12} className="mr-1"/> Deal signed</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guaranteed Minimum Commitments (GMC) */}
      <Card className="border border-gray-100 mb-8">
        <CardHeader>
          <CardTitle>Guaranteed Minimum Commitments (GMC)</CardTitle>
          <div className="space-y-3 mt-1">
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Info size={14} className="mt-0.5 text-gray-500" />
              <p>
                A Guaranteed Minimum Commitment (GMC) is a promise to buy at least a stated number of units over the season. In exchange, the supplier plans capacity for you and typically offers sharper pricing through volume tiers and more reliable availability. You still place orders week‑by‑week in batches; each batch invoice is due two weeks after shipment (a two‑week settlement period).
                <br/>
                The risk: if demand falls short and by the end of Week 15 your total delivered units are below your commitment, you pay a shortfall fee of <strong>20% of the value of the missing units</strong> (undelivered units × contracted unit price). Choose a GMC only if you’re confident about demand and supply needs.
              </p>
            </div>
            <div className="rounded-lg bg-blue-50/70 border border-blue-200 p-3 flex items-center justify-between">
              <div className="text-sm font-medium text-blue-900">Projected season demand (reference)</div>
              <div className="text-2xl font-bold text-blue-900 font-mono">{projectedSeasonDemand.toLocaleString()} units</div>
            </div>
            {/* Over‑commitment warning temporarily disabled */}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-2">

            {/* GMC — Supplier 1 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">GMC — Supplier‑1</h3><Badge variant={isLocked('supplier1') ? 'default' : 'secondary'}>{isLocked('supplier1') ? 'Signed' : 'Not signed'}</Badge></div>
              {isLocked('supplier1') || (singleSupplierDeal && singleSupplierDeal !== 'supplier1') ? (
                <div className="space-y-2">
                  {isLocked('supplier1') ? (
                    <>
                      <div className="text-sm text-gray-700">Agreed: <span className="font-mono font-semibold">{(savedGmcCommitments['supplier1'] || 0).toLocaleString()}</span> units</div>
                      <div className="text-sm text-gray-700">Ordered so far: <span className="font-mono font-semibold">{getGmcOrderedUnitsForSupplier('supplier1').toLocaleString()}</span> units</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">Locked due to Single Supplier Deal with the other supplier.</div>
                  )}
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (getGmcOrderedUnitsForSupplier('supplier1') / Math.max(1, Number(savedGmcCommitments['supplier1'] || 0))) * 100)}%` }} />
                  </div>
                </div>
              ) : (
                <>
                  <Slider value={[gmcCommitments['supplier1'] || 0]} onValueChange={(v) => setGmcCommitments(prev => ({ ...prev, supplier1: Number(v[0] || 0) }))} min={0} max={5000000} step={10000} />
                  <div className="flex items-center gap-2 mt-2">
                    <Input type="number" step={10000} value={gmcCommitments['supplier1'] || 0} onChange={(e) => setGmcCommitments(prev => ({ ...prev, supplier1: Math.max(0, Number(e.target.value || 0)) }))} className="w-40" />
                    <Button variant="outline" onClick={() => setGmcConfirm({ open: true, supplier: 'supplier1' })}>Sign Commitment</Button>
              </div>
                </>
              )}
            </div>

            {/* GMC — Supplier 2 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">GMC — Supplier‑2</h3><Badge variant={isLocked('supplier2') ? 'default' : 'secondary'}>{isLocked('supplier2') ? 'Signed' : 'Not signed'}</Badge></div>
              {isLocked('supplier2') || (singleSupplierDeal && singleSupplierDeal !== 'supplier2') ? (
                <div className="space-y-2">
                  {isLocked('supplier2') ? (
                    <>
                      <div className="text-sm text-gray-700">Agreed: <span className="font-mono font-semibold">{(savedGmcCommitments['supplier2'] || 0).toLocaleString()}</span> units</div>
                      <div className="text-sm text-gray-700">Ordered so far: <span className="font-mono font-semibold">{getGmcOrderedUnitsForSupplier('supplier2').toLocaleString()}</span> units</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">Locked due to Single Supplier Deal with the other supplier.</div>
                  )}
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (getGmcOrderedUnitsForSupplier('supplier2') / Math.max(1, Number(savedGmcCommitments['supplier2'] || 0))) * 100)}%` }} />
              </div>
            </div>
              ) : (
                <>
                  <Slider value={[gmcCommitments['supplier2'] || 0]} onValueChange={(v) => setGmcCommitments(prev => ({ ...prev, supplier2: Number(v[0] || 0) }))} min={0} max={5000000} step={10000} />
                  <div className="flex items-center gap-2 mt-2">
                    <Input type="number" step={10000} value={gmcCommitments['supplier2'] || 0} onChange={(e) => setGmcCommitments(prev => ({ ...prev, supplier2: Math.max(0, Number(e.target.value || 0)) }))} className="w-40" />
                    <Button variant="outline" onClick={() => setGmcConfirm({ open: true, supplier: 'supplier2' })}>Sign Commitment</Button>
              </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fabric Orders */}
        <Card className="border border-gray-100 mb-8">
          <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShoppingCart size={20} /> Fabric Orders</CardTitle>
          <p className="text-sm text-gray-600">Orders from a supplier with a signed GMC use GMC terms; otherwise SPT terms.</p>
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
                disabled={isSupplierDisabledByDeal('supplier1')}
                >
                <span>Supplier-1 {gmcCommitments['supplier1'] ? '(GMC)' : '(SPT)'}</span>
                <Badge variant="secondary">{getSupplierBasketCount('supplier1')}</Badge>
                </Button>
                <Button
                  variant={selectedSupplier === 'supplier2' ? 'default' : 'outline'}
                  onClick={() => setSelectedSupplier('supplier2')}
                className="justify-between"
                disabled={isSupplierDisabledByDeal('supplier2')}
                >
                <span>Supplier-2 {gmcCommitments['supplier2'] ? '(GMC)' : '(SPT)'}</span>
                <Badge variant="secondary">{getSupplierBasketCount('supplier2')}</Badge>
                </Button>
              </div>
            </div>

          {/* Fabric tiles with constraints */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(supplierPrices[selectedSupplier]).map((material) => {
                const basePrice = (supplierPrices as any)[selectedSupplier][material];
                const printSurcharge = (printSurcharges as any)[selectedSupplier][material] || 0;
                const isSelected = selectedFabrics.has(material);
                const isDisabled = !!productData && Object.keys(productData).length > 0 && !isSelected;
                const isPrintForced = printForcedMaterials.has(material);
                const finalChecked = isPrintForced ? true : !!printOptions[material];
                const finalPrice = basePrice + (finalChecked ? printSurcharge : 0);
                  
                  return (
                  <div
                    key={material}
                    className={`border rounded-lg p-4 transition-colors ${
                      isDisabled
                        ? 'bg-gray-50 border-gray-200 opacity-70'
                        : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Label className={`text-sm font-medium capitalize ${isDisabled ? '' : 'text-blue-900'}`}>{material.replace(/([A-Z])/g, ' $1').trim()}</Label>
                      {isDisabled && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-gray-200 text-gray-700 px-2 py-0.5 rounded"><Lock size={10}/> Not in Design</span>
                      )}
                      </div>
                    <div className={`text-xs mb-2 ${isDisabled ? 'text-gray-500' : 'text-blue-900'}`}>Base Price: {formatCurrency(basePrice)}{printSurcharge > 0 && (<span className="ml-1">(Print: +{formatCurrency(printSurcharge)})</span>)}</div>
                      
                      {/* Print Option */}
                      <div className="flex items-center space-x-2 mb-3">
                      <Checkbox id={`print-${material}`} checked={finalChecked} onCheckedChange={(checked) => handlePrintOptionChange(material, !!checked)} disabled={isPrintForced || isDisabled} />
                      <Label htmlFor={`print-${material}`} className={`text-xs flex items-center gap-1 ${isDisabled ? 'text-gray-600 cursor-not-allowed' : 'text-blue-900 cursor-pointer'}`}><Palette size={12} /> Add Print (+{formatCurrency(printSurcharge)})</Label>
                      {isPrintForced && (<span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500"><Lock size={10}/> Locked</span>)}
                      </div>

                    <Input type="number" min="0" step={batchSize} value={materialQuantities[material] || ''} onChange={(e) => !isDisabled && handleMaterialQuantityChange(material, parseInt(e.target.value) || 0)} placeholder={`0 (x ${batchSize.toLocaleString()})`} className="mb-2" disabled={isDisabled} />
                    {quantityErrors[material] && (<div className="text-xs text-red-600 mb-1">{quantityErrors[material]}</div>)}
                    <div className="text-xs text-gray-600"><div>Unit Price: {formatCurrency(finalPrice)}</div><div className="font-medium">Total: {formatCurrency((materialQuantities[material] || 0) * finalPrice)}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Summary */}
            {contractData.orders.length > 0 && (
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2"><Calculator size={16} /> Order Summary</h4>
                <div className="space-y-2">
                  {contractData.orders.map((order, index) => (
                  <div key={index} className="flex justify-between items-center text-sm"><span className="capitalize">{order.material.replace(/([A-Z])/g, ' $1').trim()}: {order.quantity.toLocaleString()} units</span><span className="font-mono">{formatCurrency(order.totalCost)}</span></div>
                  ))}
                  <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total Units</span><span className="font-mono text-sm">{totalUnits.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center font-medium"><span>Subtotal:</span><span className="font-mono">{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0))}</span></div>
                    {contractData.discount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                      <span>Discount {currTierIndex ? `(Tier ${currTierIndex})` : ''}{extraSSD ? ' (+2% Single Supplier Deal)' : ''} ({contractData.discount.toFixed(1)}%):</span>
                        <span className="font-mono">-{formatCurrency(contractData.orders.reduce((sum, order) => sum + order.totalCost, 0) * (contractData.discount / 100))}</span>
                      </div>
                    )}
                  <div className="flex justify-between items-center text-sm text-gray-700"><span>{(gmcCommitments[selectedSupplier] || 0) > 0 ? 'GMC: each batch settles at W+2' : 'SPT: pay on delivery (defects not billed)'}</span><span className="font-mono"></span></div>
                  <div className="flex justify-between items-center font-bold text-lg border-t border-gray-300 pt-2 mt-2"><span>Total Commitment:</span><span className="font-mono">{formatCurrency(contractData.totalCommitment)}</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-4 mt-6">
            <Button onClick={handleBuyMaterials} disabled={contractData.orders.length === 0 || updateStateMutation.isPending} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">{updateStateMutation.isPending ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Processing...</>) : (<><ShoppingCart size={16} />Buy Fabrics</>)}</Button>
              </div>
          </CardContent>
        </Card>

      {/* Contracts / Orders Ledger */}
      {renderDealDialog()}
      {/* GMC confirmation dialog */}
      <Dialog open={gmcConfirm.open} onOpenChange={(open) => setGmcConfirm({ open, supplier: open ? gmcConfirm.supplier : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign GMC?</DialogTitle>
            <DialogDescription>
              This will lock the commitment with {gmcConfirm.supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} at {(gmcCommitments[gmcConfirm.supplier || 'supplier1'] || 0).toLocaleString()} units. You can no longer adjust the slider afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGmcConfirm({ open: false, supplier: null })}>Cancel</Button>
            <Button onClick={() => gmcConfirm.supplier && confirmAndSaveGmc(gmcConfirm.supplier)}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History size={18}/> Contracts & Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="week">
            <TabsList><TabsTrigger value="week">This Week's Orders</TabsTrigger><TabsTrigger value="season">Season Commitments & History</TabsTrigger></TabsList>
            <TabsContent value="week" className="mt-4">
              {(currentState?.materialPurchases || []).filter((p: any) => p.purchaseWeek === currentWeek).length === 0 ? (<div className="text-sm text-gray-600">No orders placed this week.</div>) : (
                <div className="space-y-3">
                  {(currentState?.materialPurchases || []).filter((p: any) => p.purchaseWeek === currentWeek).map((p: any, idx: number) => {
                    const delivery = p.purchaseWeek + (p.type === 'gmc' ? 2 : 1);
                    return (
                      <div key={idx} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="font-medium">{p.supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} • {p.type?.toUpperCase()}</div>
                          <div className="flex items-center gap-2">
                            <div className="text-gray-600 flex items-center gap-1"><Truck size={14}/> Arrives W{delivery}</div>
                            <Button variant="outline" size="sm" onClick={() => handleRemovePurchase(p.timestamp)} disabled={currentState?.isCommitted || !p.canDelete} className="h-7 px-2"><Trash2 size={14}/> Remove</Button>
              </div>
            </div>
                        <div className="mt-1 text-gray-700">{(p.orders || []).map((o: any, i: number) => (<div key={i} className="flex justify-between"><span className="capitalize">{o.material.replace(/([A-Z])/g, ' $1').trim()} — {o.quantity.toLocaleString()} units</span><span className="font-mono">{formatCurrency(o.totalCost)}</span></div>))}</div>
              </div>
                    );
                  })}
            </div>
              )}
            </TabsContent>
            <TabsContent value="season" className="mt-4">
              {!(currentState?.procurementContracts?.contracts || []).length ? (<div className="text-sm text-gray-600">No procurement commitments yet.</div>) : (
                <div className="space-y-3">
                  {(currentState?.procurementContracts?.contracts || []).map((c: any, idx: number) => {
                    const deliveries = c.deliveries || [];
                    const delivered = Number(c.deliveredUnits || 0);
                    const committed = Number(c.units || 0);
                    return (
                      <div key={idx} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between"><div className="font-medium">{c.supplier === 'supplier1' ? 'Supplier-1' : 'Supplier-2'} • {c.type}</div><div className="text-gray-600">Fabric: <span className="capitalize">{String(c.material).replace(/([A-Z])/g, ' $1').trim()}</span></div></div>
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
