import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle, Clock, RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface HeaderProps {
  currentState: any;
  onCommitWeek: () => void;
}

export default function Header({ currentState, onCommitWeek }: HeaderProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPhaseInfo = (week: number) => {
    if (week <= 2) return { name: 'Strategy Phase', color: 'bg-blue-100 text-blue-800' };
    if (week <= 6) return { name: 'Development Phase', color: 'bg-green-100 text-green-800' };
    if (week <= 12) return { name: 'Sales Phase', color: 'bg-purple-100 text-purple-800' };
    return { name: 'Run-out Phase', color: 'bg-orange-100 text-orange-800' };
  };

  const phase = getPhaseInfo(currentState?.weekNumber || 1);

  const handleRestart = async () => {
    try {
      await fetch('/api/game/restart', { method: 'POST', credentials: 'include' });
      window.location.href = '/';
    } catch (_) {
      window.location.href = '/';
    }
  };

  const { data: constants } = useQuery({ queryKey: ["/api/game/constants"], retry: false });
  // Always refresh current game after a commit so header reflects start-of-week balances
  useQuery({ queryKey: ['/api/game/current'], staleTime: 0 });
  const creditUsed = parseFloat(currentState?.creditUsed || '0');
  const creditLimit = Number((constants as any)?.CREDIT_LIMIT || 0);
  const creditAvailable = Math.max(0, creditLimit - creditUsed);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Game info */}
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Vintage Revival</h1>
            <p className="text-sm text-gray-600">Fast Fashion Business Simulation</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge className={phase.color}>
              {phase.name}
            </Badge>
            
            <div className="flex items-center gap-2">
              {currentState?.isCommitted ? (
                <CheckCircle className="text-green-600" size={16} />
              ) : (
                <Clock className="text-gray-500" size={16} />
              )}
              <span className="text-sm font-medium">
                Week {currentState?.weekNumber || 1}/15
              </span>
            </div>
            
            <div className="text-sm">
              <span className="text-gray-600">Cash: </span>
              <span className="font-mono font-semibold">
                {formatCurrency(parseFloat(currentState?.cashOnHand || '500000'))}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Credit Available: </span>
              <span className="font-mono font-semibold">
                {formatCurrency(creditAvailable)}
              </span>
            </div>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-3">
          {/* Commit Week Button */}
          <Button 
            onClick={onCommitWeek}
            disabled={currentState?.isCommitted}
            className="flex items-center gap-2"
          >
            {currentState?.isCommitted ? (
              <>
                <CheckCircle size={16} />
                Week Committed
              </>
            ) : (
              <>
                Commit Week {currentState?.weekNumber || 1}
                <ArrowRight size={16} />
              </>
            )}
          </Button>

          {/* Restart Game */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            title="Restart Game"
          >
            <RotateCcw size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
}