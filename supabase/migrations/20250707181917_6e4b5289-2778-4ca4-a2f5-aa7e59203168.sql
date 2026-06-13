-- Fix RLS infinite recursion by using existing security definer function
-- First, check if we have users to work with
INSERT INTO trainer_athletes (trainer_id, athlete_id, status) 
SELECT 
  (SELECT id FROM profiles WHERE role = 'trainer' LIMIT 1),
  (SELECT id FROM profiles WHERE role = 'athlete' LIMIT 1),
  'active'
WHERE EXISTS (SELECT 1 FROM profiles WHERE role = 'trainer') 
  AND EXISTS (SELECT 1 FROM profiles WHERE role = 'athlete');

-- Add some sample workout schedules if we have trainer-athlete relationships
INSERT INTO workout_schedules (trainer_id, athlete_id, title, description, scheduled_date, status)
SELECT 
  ta.trainer_id,
  ta.athlete_id,
  'Morning Strength Training',
  'Full body strength workout focusing on compound movements',
  CURRENT_DATE - INTERVAL '7 days',
  'completed'
FROM trainer_athletes ta
WHERE ta.status = 'active'
LIMIT 1;

INSERT INTO workout_schedules (trainer_id, athlete_id, title, description, scheduled_date, status)
SELECT 
  ta.trainer_id,
  ta.athlete_id,
  'Cardio Session',
  'High intensity interval training for cardiovascular fitness',
  CURRENT_DATE - INTERVAL '5 days',
  'completed'
FROM trainer_athletes ta
WHERE ta.status = 'active'
LIMIT 1;

INSERT INTO workout_schedules (trainer_id, athlete_id, title, description, scheduled_date, status)
SELECT 
  ta.trainer_id,
  ta.athlete_id,
  'Upper Body Focus',
  'Targeted upper body strength and hypertrophy work',
  CURRENT_DATE - INTERVAL '3 days',
  'completed'
FROM trainer_athletes ta
WHERE ta.status = 'active'
LIMIT 1;