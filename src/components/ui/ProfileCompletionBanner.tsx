import { useAuth } from "@/hooks/useAuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const ProfileCompletionBanner = () => {
  const { profile } = useAuth();

  if (!profile) return null;

  const requiredFields = [profile.full_name, profile.phone, profile.location, profile.fitness_level];
  const isProfileIncomplete = requiredFields.some(
    (field) => !field || String(field).trim().length === 0
  );

  if (!isProfileIncomplete) return null;

  return (
    <Alert className="mb-4 border-border bg-muted/40">
      <AlertTitle className="mb-2">Complete Your Profile</AlertTitle>
      <AlertDescription className="mb-3">
        Add your phone number, location, and fitness level to complete your profile.
      </AlertDescription>
      <Button asChild size="sm">
        <Link to="/profile">Complete Profile</Link>
      </Button>
    </Alert>
  );
};
