import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, MapPin, Calendar, Edit, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { useAuth } from "@/hooks/useAuthProvider";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { handleApiError } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Profile = () => {
  const { profile, role, loading, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    joinDate: '',
    fitnessLevel: '',
    goals: ''
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        location: profile.location || '',
        joinDate: profile.join_date ? new Date(profile.join_date).toISOString().split('T')[0] : '',
        fitnessLevel: profile.fitness_level || '',
        goals: profile.goals || ''
      });
      
      if (profile.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    }
  }, [profile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${profile?.id}/avatar.${fileExt}`;
      
      if (filePath.includes('..')) {
        throw new Error('Invalid file path');
      }
      
      setUploading(true);
      
      // Upload the file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });
        
      if (uploadError) throw uploadError;
      
      // Get the public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
        
      // Update the avatar_url in the profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: data.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile?.id);
        
      if (updateError) throw updateError;
      
      setAvatarUrl(data.publicUrl);
      toast.success('Profile picture updated');
      
      // Refresh the profile data
      refreshProfile();
    } catch (error) {
      handleApiError(error, 'Error uploading avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          location: formData.location,
          fitness_level: formData.fitnessLevel,
          goals: formData.goals,
          join_date: formData.joinDate ? new Date(formData.joinDate).toISOString().split('T')[0] : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      toast.success('Profile updated successfully!');
      setIsEditing(false);
      refreshProfile();
    } catch (error) {
      handleApiError(error, 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data to original profile data
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        location: profile.location || '',
        joinDate: profile.join_date ? new Date(profile.join_date).toISOString().split('T')[0] : '',
        fitnessLevel: profile.fitness_level || '',
        goals: profile.goals || ''
      });
    }
    setIsEditing(false);
  };

  if (loading) {
    return (
      <AppLayout>
        <PageLayout title="Profile" description="Manage your personal information.">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Profile Picture</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Skeleton className="w-32 h-32 rounded-full mx-auto" />
                <div>
                  <Skeleton className="h-6 w-40 mx-auto" />
                  <Skeleton className="h-4 w-20 mx-auto mt-2" />
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageLayout>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageLayout title="Profile" description="Manage your personal information.">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="relative w-32 h-32 mx-auto">
                <Avatar className="w-32 h-32 mx-auto">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={formData.fullName} />
                  ) : null}
                  <AvatarFallback className="text-3xl">
                    {formData.fullName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <label 
                  htmlFor="avatar-upload" 
                  className="absolute bottom-0 right-0 p-1 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
                  aria-label="Upload profile picture"
                >
                  <Upload className="h-4 w-4" />
                  <input 
                    id="avatar-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                    aria-label="Upload profile picture"
                  />
                </label>
              </div>
              <div>
                <h3 className="text-xl font-semibold">{formData.fullName}</h3>
                <p className="text-muted-foreground capitalize">{role || 'athlete'}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="flex justify-between items-center">
              <CardTitle>Personal Information</CardTitle>
              <Button 
                variant="outline" 
                size="default"
                onClick={() => setIsEditing(!isEditing)}
                aria-label="Edit profile information"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input 
                    id="fullName" 
                    value={formData.fullName} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    aria-label="Full Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.email} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                    aria-label="Email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    aria-label="Phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input 
                    id="location" 
                    value={formData.location} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    aria-label="Location"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="joinDate">Join Date</Label>
                  <Input 
                    id="joinDate" 
                    value={formData.joinDate} 
                    disabled 
                    aria-label="Join date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fitnessLevel">Fitness Level</Label>
                  <Input 
                    id="fitnessLevel" 
                    value={formData.fitnessLevel} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="e.g., Beginner, Intermediate, Advanced"
                    aria-label="Fitness level"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="goals">Fitness Goals</Label>
                  <Input 
                    id="goals" 
                    value={formData.goals} 
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="e.g., Weight loss, Muscle gain, Endurance"
                    aria-label="Fitness goals"
                  />
                </div>
              </div>
              {isEditing && (
                <div className="flex justify-end gap-3">
                  <Button 
                    variant="outline" 
                    size="default"
                    onClick={handleCancel} 
                    disabled={isSaving}
                    aria-label="Cancel changes"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="default"
                    onClick={handleSave} 
                    disabled={isSaving}
                    aria-label="Save changes"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    </AppLayout>
  );
};

export default Profile;
