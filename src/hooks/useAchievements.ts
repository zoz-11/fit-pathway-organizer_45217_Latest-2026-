import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuthProvider';

export const useAchievements = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: allAchievements, isLoading: isLoadingAllAchievements } = useQuery({
    queryKey: ['allAchievements'],
    queryFn: async () => {
      return [];
    },
  });

  const { data: userAchievements, isLoading: isLoadingUserAchievements } = useQuery({
    queryKey: ['userAchievements', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return [];
    },
    enabled: !!user,
  });

  const awardAchievement = useMutation({
    mutationFn: async (_achievementName: string) => {
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAchievements', user?.id] });
    },
  });

  return {
    allAchievements,
    isLoadingAllAchievements,
    userAchievements,
    isLoadingUserAchievements,
    awardAchievement,
  };
};
