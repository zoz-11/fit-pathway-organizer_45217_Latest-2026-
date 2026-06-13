-- Create the missing audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for audit_logs
CREATE POLICY "Enable read access for authenticated users" ON public.audit_logs
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.audit_logs
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Fix the infinite recursion in profiles RLS policies
-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new non-recursive policies using the existing security definer function
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (public.user_owns_profile(id));

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (public.user_owns_profile(id));