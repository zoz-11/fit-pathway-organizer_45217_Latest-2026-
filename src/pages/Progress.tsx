import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, Calendar, Award } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProgressCharts } from "@/components/dashboard/ProgressCharts";
import { AdvancedAnalytics } from "@/components/dashboard/AdvancedAnalytics";
import { useAuth } from "@/hooks/useAuthProvider";

const summaryCards = [
  {
    title: "Total Workouts",
    value: "—",
    description: "No verified summary data available yet.",
    icon: Calendar,
  },
  {
    title: "Weight Change",
    value: "—",
    description: "No verified body metric data available yet.",
    icon: TrendingUp,
  },
  {
    title: "Current Streak",
    value: "—",
    description: "No verified streak data available yet.",
    icon: Target,
  },
  {
    title: "Achievements",
    value: "—",
    description: "No verified achievement data available yet.",
    icon: Award,
  },
];

const Progress = () => {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Progress Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Track your fitness journey and review verified progress data as it becomes available.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ title, value, description, icon: Icon }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <ProgressCharts userId={user?.id || ''} />
        <AdvancedAnalytics userId={user?.id || ''} />

        <Card>
          <CardHeader>
            <CardTitle>Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No achievement data is available yet.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No verified goal progress is available yet.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Progress;
