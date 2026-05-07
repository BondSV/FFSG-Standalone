import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, X } from "lucide-react";

interface IntroCardProps {
  gameId: string;
}

const STORAGE_KEY_PREFIX = "ffsg.logistics.introDismissed.";

export function IntroCard({ gameId }: IntroCardProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${gameId}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // localStorage unavailable — dismiss for this session only
    }
    setDismissed(true);
  };

  return (
    <Card className="border border-amber-200 bg-amber-50/40 mb-6">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-amber-100 p-2 text-amber-700 shrink-0">
            <Truck size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">How Logistics Works</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              Logistics is how finished goods move from production to your shelves. For each batch you choose
              {" "}<strong>Standard</strong> (cheaper, 2 weeks transit) or <strong>Expedited</strong> (faster, 1 week).
              Goods arrive on shelves at <em>completion week + transit weeks + 1</em>. Your goal is to have every
              product on shelves <strong>before Week 7</strong> when sales begin. Holding cost (0.3% / week) applies
              to all stored inventory at every stage.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDismiss} aria-label="Dismiss" className="shrink-0">
            <X size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
