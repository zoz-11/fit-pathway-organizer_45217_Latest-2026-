-- Create the trigger using SQL function
DO $$
BEGIN
    -- Drop existing trigger if it exists
    IF EXISTS (SELECT 1 FROM information_schema.triggers 
               WHERE trigger_name = 'on_auth_user_created' 
               AND event_object_table = 'users' 
               AND event_object_schema = 'auth') THEN
        DROP TRIGGER on_auth_user_created ON auth.users;
    END IF;
    
    -- Create the trigger
    EXECUTE 'CREATE TRIGGER on_auth_user_created 
             AFTER INSERT ON auth.users 
             FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
END $$;