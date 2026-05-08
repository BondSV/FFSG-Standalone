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
              Logistics is how finished goods move from production to your shelves. Pick{" "}
              <strong>Standard</strong> or <strong>Expedited</strong> freight (<strong>2</strong> vs{" "}
              <strong>1</strong> simulated in‑transit week). Units only book <strong>on shelf</strong> after an extra{" "}
              <strong>+1 stocking week</strong>: <em>arrival week = week production finishes (“ships”) + freight weeks + 1</em>.
              Expedited trims one ladder step vs Standard overall. Aim to land everything <strong>before Week 7</strong>.
              Holding cost (0.3% per week on stored value) applies at every stage.
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
