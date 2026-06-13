-- Add a policy that allows the trigger to insert profiles
DROP POLICY IF EXISTS "System can insert profiles for new users" ON public.profiles;
CREATE POLICY "System can insert profiles for new users" ON public.profiles
  FOR INSERT 
  WITH CHECK (true);