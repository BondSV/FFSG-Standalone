import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shirt, User, Zap } from "lucide-react";

interface ProductPortfolioProps {
  currentState: any;
}

const products = [
  {
    id: 'jacket',
    name: 'Vintage Denim Jacket',
    icon: Shirt,
    forecast: 100000,
    hmPrice: 80,
    highEndRange: '£300-550',
    elasticity: -1.40,
  },
  {
    id: 'dress',
    name: 'Floral Print Dress',
    icon: User,
    forecast: 150000,
    hmPrice: 50,
    highEndRange: '£180-210',
    elasticity: -1.20,
  },
  {
    id: 'pants',
    name: 'Corduroy Pants',
    icon: Zap,
    forecast: 120000,
    hmPrice: 60,
    highEndRange: '£190-220',
    elasticity: -1.55,
  },
];

export default function ProductPortfolio({ currentState }: ProductPortfolioProps) {
  const productData = currentState?.productData || {};

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProductStatus = (productId: string) => {
    const data = productData[productId];
    if (!data || !data.rrp) {
      return { label: "RRP not set", variant: "secondary" };
    }
    if (currentState?.weekNumber <= 2) {
      return { label: "Ready for lock", variant: "default" };
    }
    return { label: "RRP locked", variant: "success" };
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader>
        <CardTitle>Product Portfolio - Vintage Revival Collection</CardTitle>
        <p className="text-sm text-gray-600">
          Set your Recommended Retail Price (RRP) and design choices by end of Week 2
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {products.map((product) => {
            const ProductIcon = product.icon;
            const status = getProductStatus(product.id);
            const productInfo = productData[product.id] || {};

            return (
              <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
                  <ProductIcon className="text-gray-400" size={48} />
                </div>
                
                <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
                
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Forecast:</span>
                    <span className="font-mono">{product.forecast.toLocaleString()} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">H&M Price:</span>
                    <span className="font-mono">{formatCurrency(product.hmPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">High-end:</span>
                    <span className="font-mono text-xs">{product.highEndRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Elasticity:</span>
                    <span className="font-mono">{product.elasticity}</span>
                  </div>
                  {productInfo.rrp && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">Your RRP:</span>
                      <span className="font-mono font-semibold">{formatCurrency(productInfo.rrp)}</span>
                    </div>
                  )}
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
                  <div className="mt-1">
                    <Badge 
                      variant={status.variant as any}
                      className={
                        status.variant === 'success' ? 'bg-secondary text-white' :
                        status.variant === 'default' ? 'bg-accent text-white' :
                        'bg-gray-100 text-gray-700'
                      }
                    >
                      {status.label}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
