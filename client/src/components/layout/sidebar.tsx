import { cn } from "@/lib/utils";
import { 
  Home, 
  DollarSign,
  Palette, 
  ShoppingCart, 
  Factory, 
  Truck, 
  Megaphone, 
  BarChart3,
  Clock,
  CheckCircle
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentState: any;
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'logistics', label: 'Logistics', icon: Truck },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Sidebar({ activeTab, onTabChange, currentState }: SidebarProps) {
  const getPhaseInfo = (week: number) => {
    if (week <= 2) return { name: 'Strategy', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (week <= 6) return { name: 'Development', color: 'text-green-600', bg: 'bg-green-50' };
    if (week <= 12) return { name: 'Sales', color: 'text-purple-600', bg: 'bg-purple-50' };
    return { name: 'Run-out', color: 'text-orange-600', bg: 'bg-orange-50' };
  };

  const phase = getPhaseInfo(currentState?.weekNumber || 1);

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Phase Indicator */}
      <div className={`p-4 ${phase.bg} border-b border-gray-200`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            {currentState?.isCommitted ? (
              <CheckCircle className="text-green-600" size={16} />
            ) : (
              <Clock className="text-gray-500" size={16} />
            )}
            <span className="text-sm font-medium text-gray-700">
              Week {currentState?.weekNumber || 1}
            </span>
          </div>
        </div>
        <div className={`text-xs font-medium ${phase.color}`}>
          {phase.name} Phase
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}