import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuthProvider';

export const useStats = () => {
  const { user, profile, role } = useAuth();

  return useQuery({
    queryKey: ['stats', user?.id, role, profile?.role],
    queryFn: async () => {
      if (!user || !profile) return null;

      const effectiveRole = role ?? profile.role ?? 'athlete';

      if (effectiveRole === 'trainer' || effectiveRole === 'admin') {
        // Get trainer stats
        const [athletesResult, workoutsResult, completedResult] = await Promise.all([
          supabase.from('trainer_athletes').select('id').eq('trainer_id', user.id),
          supabase.from('workout_schedules').select('id').eq('trainer_id', user.id),
          supabase.from('workout_schedules').select('id').eq('trainer_id', user.id).eq('status', 'completed')
        ]);

        const totalAthletes = athletesResult.data?.length || 0;
        const totalWorkouts = workoutsResult.data?.length || 0;
        const completedWorkouts = completedResult.data?.length || 0;
        const completionRate = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0;

        return {
          totalAthletes,
          scheduledWorkouts: totalWorkouts,
          activePrograms: Math.min(totalAthletes, 5), // Assuming max 5 programs
          completionRate: `${completionRate}%`
        };
      } else {
        // Get athlete stats
        const [workoutsResult, completedResult, achievementsResult] = await Promise.all([
          supabase.from('workout_schedules').select('id').eq('athlete_id', user.id),
          supabase.from('workout_schedules').select('id').eq('athlete_id', user.id).eq('status', 'completed'),
          supabase.from('exercise_completions').select('id').eq('athlete_id', user.id)
        ]);

        const totalWorkouts = workoutsResult.data?.length || 0;
        const completedWorkouts = completedResult.data?.length || 0;
        const achievements = achievementsResult.data?.length || 0;

        // Get next workout
        const { data: nextWorkout } = await supabase
          .from('workout_schedules')
          .select('title, scheduled_date')
          .eq('athlete_id', user.id)
          .eq('status', 'scheduled')
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .single();

        return {
          completedWorkouts,
          nextWorkout: nextWorkout?.title || 'No scheduled workouts',
          currentProgram: 'General Fitness',
          achievements
        };
      }
    },
    enabled: !!user && !!profile,
    staleTime: 30000, // 30 seconds
  });
};
