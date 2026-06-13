-- Create trainer_athletes table for managing trainer-athlete relationships
CREATE TABLE public.trainer_athletes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(trainer_id, athlete_id)
);

-- Enable Row Level Security
ALTER TABLE public.trainer_athletes ENABLE ROW LEVEL SECURITY;

-- Create policies for trainer_athletes
CREATE POLICY "Trainers can manage their relationships" 
ON public.trainer_athletes 
FOR ALL 
USING (trainer_id = auth.uid());

CREATE POLICY "Athletes can view and update their relationships" 
ON public.trainer_athletes 
FOR ALL 
USING (athlete_id = auth.uid());

-- Create function to update timestamps
CREATE TRIGGER update_trainer_athletes_updated_at
BEFORE UPDATE ON public.trainer_athletes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();