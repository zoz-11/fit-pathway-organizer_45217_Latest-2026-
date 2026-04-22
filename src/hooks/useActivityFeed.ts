import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuthProvider';

export interface ActivityItem {
  id: string;
  type: 'workout_completed' | 'workout_assigned' | 'achievement' | 'info';
  description: string;
  timestamp: string;
}

export const useActivityFeed = () => {
  const { user, profile, role } = useAuth();

  return useQuery({
    queryKey: ['activityFeed', user?.id, role, profile?.role],
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!user || !profile) return [];

      try {
        const effectiveRole = role ?? profile.role ?? 'athlete';

        if (effectiveRole === 'trainer' || effectiveRole === 'admin') {
          // For trainers: show completed workouts from all their athletes
          const { data: completedWorkouts, error } = await supabase
            .from('workout_schedules')
            .select(`
              id,
              title,
              updated_at,
              athlete:profiles!workout_schedules_athlete_id_fkey(full_name)
            `)
            .eq('trainer_id', user.id)
            .eq('status', 'completed')
            .order('updated_at', { ascending: false })
            .limit(10);

          if (error) {
            console.error('Error fetching trainer activity:', error);
            return [];
          }

          return (completedWorkouts || []).map(workout => ({
            id: workout.id,
            type: 'workout_completed' as const,
            description: `${workout.athlete?.full_name || 'Athlete'} completed "${workout.title}"`,
            timestamp: workout.updated_at || new Date().toISOString(),
          }));
        } else {
          // For athletes: show their own completed workouts and achievements
          const { data: completedWorkouts, error } = await supabase
            .from('workout_schedules')
            .select('id, title, updated_at')
            .eq('athlete_id', user.id)
            .eq('status', 'completed')
            .order('updated_at', { ascending: false })
            .limit(10);

          if (error) {
            console.error('Error fetching athlete activity:', error);
            return [];
          }

          return (completedWorkouts || []).map(workout => ({
            id: workout.id,
            type: 'workout_completed' as const,
            description: `You completed "${workout.title}"`,
            timestamp: workout.updated_at || new Date().toISOString(),
          }));
        }
      } catch (error) {
        console.error('Activity feed error:', error);
        return [];
      }
    },
    enabled: !!user && !!profile,
    staleTime: 30000, // 30 seconds
  });
};
