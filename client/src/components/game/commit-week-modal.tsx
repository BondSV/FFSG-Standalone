import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { CheckCircle, AlertTriangle, Clock, ArrowRight } from "lucide-react";

interface CommitWeekModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameSession: any;
  currentState: any;
}

export default function CommitWeekModal({ 
  open, 
  onOpenChange, 
  gameSession, 
  currentState 
}: CommitWeekModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [validationData, setValidationData] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/validate`);
      return await response.json();
    },
    onSuccess: (data) => {
      setValidationData(data);
      setIsValidating(false);
    },
    onError: (error) => {
      setIsValidating(false);
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
        title: "Validation Error",
        description: "Failed to validate week. Please try again.",
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/commit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game', gameSession.id, 'weeks'] });
      onOpenChange(false);
      toast({
        title: "Week Committed",
        description: `Week ${currentState.weekNumber} has been successfully committed!`,
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
        title: "Commit Failed",
        description: "Failed to commit week. Please address validation errors and try again.",
        variant: "destructive",
      });
    },
  });

  // Trigger validation when modal opens
  useEffect(() => {
    if (open && !validationData && !isValidating) {
      setIsValidating(true);
      validateMutation.mutate();
    }
  }, [open]);

  const handleCommit = () => {
    if (validationData?.canCommit) {
      commitMutation.mutate();
    }
  };

  const getPhaseInfo = (week: number) => {
    if (week <= 2) return { name: 'Strategy Phase', color: 'text-strategy', icon: '🎯' };
    if (week <= 6) return { name: 'Development Phase', color: 'text-development', icon: '🔨' };
    if (week <= 12) return { name: 'Sales Phase', color: 'text-sales', icon: '📈' };
    return { name: 'Run-out Phase', color: 'text-runout', icon: '🏁' };
  };

  const phase = getPhaseInfo(currentState?.weekNumber || 1);
  const currentWeek = currentState?.weekNumber || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
              <CheckCircle className="text-white" size={20} />
            </div>
            Commit Week {currentWeek} Decisions
          </DialogTitle>
          <DialogDescription>
            Review your decisions and finalize this week. Once committed, these choices cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Week Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900">
                Week {currentWeek} - {phase.name}
              </h3>
              <Badge className={`${phase.color} bg-opacity-10`}>
                {phase.icon} {phase.name}
              </Badge>
            </div>
            <p className="text-sm text-gray-600">
              {currentWeek <= 2 && "Set your RRP and design choices for all products."}
              {currentWeek >= 3 && currentWeek <= 6 && "Schedule production and secure materials for launch."}
              {currentWeek >= 7 && currentWeek <= 12 && "Manage sales, marketing, and inventory levels."}
              {currentWeek >= 13 && "Clear remaining inventory with progressive markdowns."}
            </p>
          </div>

          {/* Validation Results */}
          {isValidating ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Validating your decisions...</p>
              </div>
            </div>
          ) : validationData ? (
            <div className="space-y-4">
              {/* Validation Summary */}
              <div className="flex items-center gap-2 mb-4">
                {validationData.canCommit ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : (
                  <AlertTriangle className="text-red-600" size={20} />
                )}
                <span className={`font-medium ${validationData.canCommit ? 'text-green-600' : 'text-red-600'}`}>
                  {validationData.canCommit ? 'Ready to Commit' : 'Issues Detected'}
                </span>
              </div>

              {/* Errors */}
              {validationData.errors && validationData.errors.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Critical Issues (Must Fix)
                  </h4>
                  <ul className="space-y-1">
                    {validationData.errors.map((error: string, index: number) => (
                      <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span>
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validationData.warnings && validationData.warnings.length > 0 && (
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Warnings (Review Recommended)
                  </h4>
                  <ul className="space-y-1">
                    {validationData.warnings.map((warning: string, index: number) => (
                      <li key={index} className="text-sm text-yellow-700 flex items-start gap-2">
                        <span className="text-yellow-500 mt-0.5">•</span>
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* All Clear */}
              {validationData.canCommit && validationData.errors.length === 0 && validationData.warnings.length === 0 && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                    <CheckCircle size={16} />
                    All Systems Go!
                  </h4>
                  <p className="text-sm text-green-700">
                    Your decisions have been validated and are ready for commitment.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Next Steps */}
          {validationData?.canCommit && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                <Clock size={16} />
                What happens next?
              </h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Your Week {currentWeek} decisions will be locked in</li>
                <li>• Game state will be automatically saved</li>
                {currentWeek < 15 && <li>• Week {currentWeek + 1} will begin</li>}
                {currentWeek === 15 && <li>• Final game results will be calculated</li>}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end items-center pt-4 border-t border-gray-200">
            <Button
              onClick={handleCommit}
              disabled={!validationData?.canCommit || commitMutation.isPending}
              className="flex items-center gap-2"
            >
              {commitMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Committing...
                </>
              ) : (
                <>
                  Commit Week {currentWeek}
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
