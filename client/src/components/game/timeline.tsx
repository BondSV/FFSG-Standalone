import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimelineProps {
  currentState: any;
}

const milestones = [
  {
    week: 2,
    title: "RRP Lock Deadline",
    description: "Finalize Recommended Retail Prices for all products",
    phase: "strategy",
  },
  {
    week: 7,
    title: "Launch Deadline", 
    description: "Products must be available in stores",
    phase: "development",
  },
  {
    week: 12,
    title: "Sales Phase End",
    description: "Maintain ≥95% service level during this period",
    phase: "sales",
  },
  {
    week: 15,
    title: "Game End",
    description: "Clear all inventory with progressive markdowns",
    phase: "runout",
  },
];

export default function Timeline({ currentState }: TimelineProps) {
  const currentWeek = currentState?.weekNumber || 1;

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'strategy': return 'bg-strategy border-strategy text-strategy';
      case 'development': return 'bg-development border-development text-development';
      case 'sales': return 'bg-sales border-sales text-sales';
      case 'runout': return 'bg-runout border-runout text-runout';
      default: return 'bg-gray-100 border-gray-200 text-gray-600';
    }
  };

  const getWeeksRemaining = (week: number) => {
    const remaining = week - currentWeek;
    if (remaining <= 0) return "Complete";
    if (remaining === 1) return "1 week remaining";
    return `${remaining} weeks remaining`;
  };

  const isCurrentMilestone = (week: number) => {
    return currentWeek === week;
  };

  const isPastMilestone = (week: number) => {
    return currentWeek > week;
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader>
        <CardTitle>15-Week Timeline</CardTitle>
        <p className="text-sm text-gray-600">Key milestones and deadlines</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {milestones.map((milestone) => {
            const isCurrent = isCurrentMilestone(milestone.week);
            const isPast = isPastMilestone(milestone.week);
            const phaseColors = getPhaseColor(milestone.phase);
            
            return (
              <div 
                key={milestone.week}
                className={`flex items-center p-4 rounded-lg border ${
                  isCurrent 
                    ? `${phaseColors} bg-opacity-10 border-opacity-20`
                    : isPast
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div 
                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-semibold mr-4 ${
                    isCurrent || isPast
                      ? `${phaseColors.split(' ')[0]} text-white`
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  W{milestone.week}
                </div>
                
                <div className="flex-1">
                  <h3 className={`font-medium ${
                    isCurrent 
                      ? phaseColors.split(' ')[2]
                      : isPast 
                      ? 'text-green-700'
                      : 'text-gray-900'
                  }`}>
                    {milestone.title}
                  </h3>
                  <p className="text-sm text-gray-600">{milestone.description}</p>
                </div>
                
                <div className="text-sm font-medium">
                  {isCurrent ? (
                    <Badge className={`${phaseColors.split(' ')[0]} text-white`}>
                      Current Week
                    </Badge>
                  ) : isPast ? (
                    <Badge className="bg-green-100 text-green-700">
                      Complete
                    </Badge>
                  ) : (
                    <span className="text-gray-500">
                      {getWeeksRemaining(milestone.week)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
