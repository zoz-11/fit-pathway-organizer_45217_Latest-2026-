import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuthProvider';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  full_name: string;
  role: string | null;
  messages: Message[];
}

export const useMessages = (participantId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', user?.id, participantId],
    queryFn: async (): Promise<Message[]> => {
      if (!user || !participantId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, recipient_id, content, created_at')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${participantId}),and(sender_id.eq.${participantId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!participantId,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ recipientId, content }: { recipientId: string; content: string }) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          recipient_id: recipientId,
          content,
        })
        .select('id, sender_id, recipient_id, content, created_at')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', user?.id, variables.recipientId] });
      queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] });
    },
  });

  return { messages, isLoading, sendMessage };
};

export const useConversations = () => {
  const { user } = useAuth();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async (): Promise<Conversation[]> => {
      if (!user) return [];

      const { data: messageRows, error: messagesError } = await supabase
        .from('messages')
        .select('id, sender_id, recipient_id, content, created_at')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      const rows = messageRows ?? [];
      if (rows.length === 0) return [];

      const byParticipant = new Map<string, Message>();

      rows.forEach((message) => {
        const otherParticipantId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
        if (!byParticipant.has(otherParticipantId)) {
          byParticipant.set(otherParticipantId, message);
        }
      });

      const participantIds = Array.from(byParticipant.keys());
      if (participantIds.length === 0) return [];

      const [profilesResult, rolesResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', participantIds),
        supabase.from('user_roles').select('user_id, role').in('user_id', participantIds),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;

      const profileMap = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
      const roleMap = new Map((rolesResult.data ?? []).map((role) => [role.user_id, role.role]));

      return participantIds.map((participantId) => {
        const latestMessage = byParticipant.get(participantId);
        const profile = profileMap.get(participantId);

        return {
          id: participantId,
          full_name: profile?.full_name ?? 'Unknown user',
          role: roleMap.get(participantId) ?? null,
          messages: latestMessage ? [latestMessage] : [],
        };
      });
    },
    enabled: !!user,
  });

  return { conversations, isLoading };
};
