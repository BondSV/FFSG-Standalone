import { Card, CardContent } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Banknote, CreditCard, Users, Target } from "lucide-react";

interface KpiCardsProps {
  currentState: any;
}

export default function KpiCards({ currentState }: KpiCardsProps) {
  const cashOnHand = Number(currentState?.cashOnHand || 1000000);
  const creditUsed = Number(currentState?.creditUsed || 0);
  const creditAvailable = 10000000 - creditUsed;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="Your current liquid cash available. This does not include your available credit line. All operational expenses are paid from this.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Cash on Hand</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">
                {formatCurrency(cashOnHand)}
              </p>
            </div>
            <div className="h-12 w-12 bg-secondary bg-opacity-10 rounded-lg flex items-center justify-center">
              <Banknote className="text-secondary" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <span className="text-sm text-secondary">
              {cashOnHand >= 1000000 ? "Starting capital" : "Available funds"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="Your remaining credit line available for use. Interest of 0.2% per week is charged on any outstanding balance.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Credit Available</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">
                {formatCurrency(creditAvailable)}
              </p>
            </div>
            <div className="h-12 w-12 bg-accent bg-opacity-10 rounded-lg flex items-center justify-center">
              <CreditCard className="text-accent" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <span className="text-sm text-gray-500">0.2% weekly interest</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="The total demand forecasted across all three products in your Vintage Revival collection.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Total Demand</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">370,000</p>
            </div>
            <div className="h-12 w-12 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center">
              <Users className="text-primary" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <span className="text-sm text-gray-500">Units forecasted</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="The percentage of customer demand you successfully met during the main sales period (Weeks 7-12). A low level indicates you had stock-outs and lost sales. Target: ≥95%.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Service Level</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900">--%</p>
            </div>
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Target className="text-gray-400" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <span className="text-sm text-gray-500">Target: ≥95%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
