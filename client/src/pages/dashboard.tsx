import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import KpiCards from "@/components/game/kpi-cards";
import ProductPortfolio from "@/components/game/product-portfolio";
import Timeline from "@/components/game/timeline";
import Pricing from "@/components/game/pricing";
import Design from "@/components/game/design";
import Procurement from "@/components/game/procurement";
import Production from "@/components/game/production";
import Logistics from "@/components/game/logistics";
import Marketing from "@/components/game/marketing";
import Analytics from "@/components/game/analytics";
import FinalDashboard from "@/components/game/final-dashboard";
import CommitWeekModal from "@/components/game/commit-week-modal";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

type Tab = 'overview' | 'pricing' | 'design' | 'procurement' | 'production' | 'logistics' | 'marketing' | 'analytics';

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showCommitModal, setShowCommitModal] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  // Always reset scroll to top when switching tabs (must run before any conditional returns)
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  // Get current game data
  const { data: gameData, isLoading, error } = useQuery({
    queryKey: ['/api/game/current'],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  // Start new game mutation
  const startGameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/game/start');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Game Started",
        description: "Welcome to the Vintage Revival simulation!",
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
        description: "Failed to start game. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle unauthorized errors for the main query
  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [error, toast]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game data...</p>
        </div>
      </div>
    );
  }

  // If the current game failed to load (e.g., 404) or no active session, show start screen
  if (error || !gameData || !(gameData as any)?.gameSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto h-16 w-16 bg-primary rounded-xl flex items-center justify-center mb-6">
            <ArrowRight className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Ready to Start?</h1>
          <p className="text-gray-600 mb-8">Launch your Vintage Revival collection and manage it through 15 weeks of strategic decisions.</p>
          <Button 
            onClick={() => startGameMutation.mutate()}
            disabled={startGameMutation.isPending}
            size="lg"
          >
            {startGameMutation.isPending ? "Starting..." : "Start New Game"}
          </Button>
        </div>
      </div>
    );
  }

  const gameSession = (gameData as any)?.gameSession;
  const currentState = (gameData as any)?.currentState;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="p-6 space-y-8">
            <KpiCards currentState={currentState} />
            <ProductPortfolio currentState={currentState} />
            <Timeline currentState={currentState} />
          </div>
        );
      case 'pricing':
        return <Pricing gameSession={gameSession} currentState={currentState} />;
      case 'design':
        return <Design gameSession={gameSession} currentState={currentState} />;
      case 'procurement':
        return <Procurement gameSession={gameSession} currentState={currentState} />;
      case 'production':
        return <Production gameSession={gameSession} currentState={currentState} />;
      case 'logistics':
        return <Logistics gameSession={gameSession} currentState={currentState} />;
      case 'marketing':
        return <Marketing gameSession={gameSession} currentState={currentState} />;
      case 'analytics':
        return <Analytics gameSession={gameSession} currentState={currentState} />;
      default:
        return null;
    }
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <Header currentState={currentState} onCommitWeek={() => setShowCommitModal(true)} />
      
      <div className="flex h-[calc(100vh-80px)]">
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={(tab: string) => setActiveTab(tab as Tab)}
          currentState={currentState}
        />
        
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto">
          {renderTabContent()}
          {gameSession?.isCompleted && (
            <FinalDashboard gameId={gameSession.id} />
          )}
        </main>
      </div>

      {/* Floating Commit Button removed */}

      <CommitWeekModal 
        open={showCommitModal}
        onOpenChange={setShowCommitModal}
        gameSession={gameSession}
        currentState={currentState}
      />
    </div>
  );
}
