import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Truck, Clock, Zap } from "lucide-react";

interface LogisticsProps {
  gameSession: any;
  currentState: any;
}

export default function Logistics({ gameSession, currentState }: LogisticsProps) {
  const shippingOptions = [
    {
      product: "Vintage Denim Jacket",
      standard: { cost: 4, time: 2 },
      expedited: { cost: 7, time: 1 },
    },
    {
      product: "Floral Print Dress", 
      standard: { cost: 2.5, time: 2 },
      expedited: { cost: 4, time: 1 },
    },
    {
      product: "Corduroy Pants",
      standard: { cost: 3, time: 2 },
      expedited: { cost: 6, time: 1 },
    },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Logistics & Shipping</h1>
        <p className="text-gray-600">Manage shipping and delivery schedules to meet customer demand</p>
      </div>

      {/* Shipping Options Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Standard Shipping */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck size={20} />
              <TooltipWrapper content="Lower cost shipping option with a 2-week transit time.">
                <span className="cursor-help">Standard Shipping</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Cost-effective option with longer transit time</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-500" />
                <span className="font-medium">Transit Time</span>
              </div>
              <Badge variant="outline">2 weeks</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Expedited Shipping */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} />
              <TooltipWrapper content="A premium, higher-cost shipping option with a 1-week transit time. Use this to get products to market faster.">
                <span className="cursor-help">Expedited Shipping</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Premium option for faster delivery</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-3 bg-primary bg-opacity-10 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <span className="font-medium text-primary">Transit Time</span>
              </div>
              <Badge className="bg-primary text-white">1 week</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shipping Costs by Product */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle>Shipping Costs by Product</CardTitle>
          <p className="text-sm text-gray-600">Compare standard vs expedited shipping costs for each product</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Product</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-900">Standard Shipping</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-900">Expedited Shipping</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-900">Premium Cost</th>
                </tr>
              </thead>
              <tbody>
                {shippingOptions.map((option, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                    <td className="py-3 px-4 font-medium text-gray-900">{option.product}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="space-y-1">
                        <div className="font-mono font-semibold">{formatCurrency(option.standard.cost)}</div>
                        <div className="text-xs text-gray-500">{option.standard.time} weeks</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="space-y-1">
                        <div className="font-mono font-semibold text-primary">{formatCurrency(option.expedited.cost)}</div>
                        <div className="text-xs text-primary">{option.expedited.time} week</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="font-mono font-semibold text-accent">
                        +{formatCurrency(option.expedited.cost - option.standard.cost)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Timeline */}
      <Card className="border border-gray-100 mt-6">
        <CardHeader>
          <CardTitle>Logistics Timeline</CardTitle>
          <p className="text-sm text-gray-600">
            Products must arrive in stores by Week 7 to meet launch deadline
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="text-yellow-600" size={16} />
                <span className="font-medium text-yellow-800">Important Timeline Rules</span>
              </div>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Goods completing shipping by end of a week are available for sale the next week</li>
                <li>• Example: 1-week expedited shipping finishing in Week 6 = ready for Week 7 launch</li>
                <li>• Standard shipping from Week 5 production = arrives Week 7 (just in time)</li>
                <li>• Expedited shipping from Week 6 production = arrives Week 7 (last chance)</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">Week 5 Production + Standard Shipping</h4>
                <p className="text-sm text-green-700">Production complete: End of Week 5</p>
                <p className="text-sm text-green-700">Shipping complete: End of Week 7</p>
                <p className="text-sm font-medium text-green-800">✓ Meets launch deadline</p>
              </div>
              
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2">Week 6 Production + Standard Shipping</h4>
                <p className="text-sm text-red-700">Production complete: End of Week 6</p>
                <p className="text-sm text-red-700">Shipping complete: End of Week 8</p>
                <p className="text-sm font-medium text-red-800">✗ Misses launch deadline</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
