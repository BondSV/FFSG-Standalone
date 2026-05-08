import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { InventoryTab } from "./logistics/inventory-tab";
import { LogisticsTab } from "./logistics/logistics-tab";

interface LogisticsProps {
  gameSession: any;
  currentState: any;
  /** Which sub-section to show — matches sidebar entries for Inventory vs Logistics. */
  defaultSection?: "inventory" | "logistics";
}

export default function Logistics({ gameSession, currentState, defaultSection = "inventory" }: LogisticsProps) {
  const { data: inventory, isLoading } = useQuery({
    queryKey: ["/api/game", gameSession?.id, "inventory-overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/game/${gameSession.id}/inventory/overview`);
      return res.json();
    },
    enabled: Boolean(gameSession?.id),
    staleTime: 15000,
  });

  const loading = isLoading && !inventory;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{defaultSection === "logistics" ? "Logistics" : "Inventory"}</h1>
        <p className="text-gray-600">
          {defaultSection === "logistics"
            ? "Shipping modes, launch readiness, lead times, and how each production batch reaches shelves."
            : "Raw materials, work-in-process, finished goods, and warehouse-level metrics."}
        </p>
      </div>

      {defaultSection === "inventory" ? (
        loading ? (
          <div className="text-sm text-gray-500 py-12 text-center">Loading inventory…</div>
        ) : (
          <InventoryTab inventory={inventory} currentState={currentState} />
        )
      ) : loading ? (
        <div className="text-sm text-gray-500 py-12 text-center">Loading logistics…</div>
      ) : (
        <LogisticsTab inventory={inventory} currentState={currentState} gameSession={gameSession} />
      )}
    </div>
  );
}
