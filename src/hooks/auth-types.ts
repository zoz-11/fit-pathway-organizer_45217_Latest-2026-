import { User, Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role?: 'admin' | 'trainer' | 'athlete';
  subscription_status?: 'active' | 'expired' | 'trial' | 'cancelled';
  subscription_expiry?: string | null;
  trainer_id?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
