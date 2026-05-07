import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { InventoryTab } from "./logistics/inventory-tab";
import { LogisticsTab } from "./logistics/logistics-tab";

interface LogisticsProps {
  gameSession: any;
  currentState: any;
}

export default function Logistics({ gameSession, currentState }: LogisticsProps) {
  const { data: inventory, isLoading } = useQuery({
    queryKey: ["/api/game", gameSession?.id, "inventory-overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/game/${gameSession.id}/inventory/overview`);
      return res.json();
    },
    enabled: Boolean(gameSession?.id),
    staleTime: 15000,
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Inventory & Logistics</h1>
        <p className="text-gray-600">
          Track raw materials, work-in-process, finished goods, and shipments — and decide how each batch gets to your shelves.
        </p>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          {isLoading && !inventory ? (
            <div className="text-sm text-gray-500 py-12 text-center">Loading inventory…</div>
          ) : (
            <InventoryTab inventory={inventory} currentState={currentState} />
          )}
        </TabsContent>

        <TabsContent value="logistics">
          {isLoading && !inventory ? (
            <div className="text-sm text-gray-500 py-12 text-center">Loading logistics plan…</div>
          ) : (
            <LogisticsTab inventory={inventory} currentState={currentState} gameSession={gameSession} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
