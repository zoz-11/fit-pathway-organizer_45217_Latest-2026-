import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Shield, Palette, Smartphone, LogOut, Globe, Download, HelpCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLayout } from "@/components/layout/PageLayout";
import { useAuth } from "@/hooks/useAuthProvider";
import { useTheme } from "next-themes";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { handleApiError } from "@/lib/utils";
import { validatePassword } from "@/lib/security";
import { useState, useEffect, useCallback, ReactNode } from "react";
import MfaSetupDialog from "@/components/auth/MfaSetupDialog";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface SettingsSectionProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}

interface SettingsItemProps {
  label: string;
  description: string;
  control: ReactNode;
}

const SettingsSection = ({ title, icon, children }: SettingsSectionProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-center space-x-2">
        {icon}
        <CardTitle>{title}</CardTitle>
      </div>
    </CardHeader>
    <CardContent className="space-y-6">{children}</CardContent>
  </Card>
);

const SettingsItem = ({ label, description, control }: SettingsItemProps) => (
  <div className="flex items-center justify-between">
    <div className="space-y-1">
      <Label className="text-base font-medium">{label}</Label>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
    {control}
  </div>
);
const Settings = () => {
  const { signOut, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [units, setUnits] = useState('imperial');
  const [mounted, setMounted] = useState(false);
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [showMfaSetupDialog, setShowMfaSetupDialog] = useState(false);

  // Dialog states
  const [showProfileVisibilityDialog, setShowProfileVisibilityDialog] = useState(false);
  const [showDataSharingDialog, setShowDataSharingDialog] = useState(false);
  const [showPasswordChangeDialog, setShowPasswordChangeDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  
  // Form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [dataSharing, setDataSharing] = useState({
    analytics: true,
    thirdParty: false,
    marketing: false,
    personalization: false
  });

  // Load persisted data-sharing preferences (if any) on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dataSharing');
      if (saved) {
        setDataSharing(JSON.parse(saved));
      }
    } catch (err) {
      console.warn('Failed to load dataSharing from localStorage', err);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const fetchTwoFactorStatus = async () => {
      setTwoFactorLoading(true);
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        setIsTwoFactorEnabled(data.currentLevel === 'aal2');
      } catch (error) {
        console.error('Error fetching 2FA status:', error);
        handleApiError(error, 'Failed to fetch 2FA status.');
      } finally {
        setTwoFactorLoading(false);
      }
    };
    fetchTwoFactorStatus();
  }, []);

  const handleTwoFactorToggle = useCallback(async (enabled: boolean) => {
    setTwoFactorLoading(true);
    try {
      if (enabled) {
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (error) throw error;
        if (data.totp) {
          setQrCode(data.totp.qr_code);
          setSecret(data.totp.secret);
          setFactorId(data.id);
          setShowMfaSetupDialog(true);
        }
        toast.info(t('2fa.enrollment.initiated'));
      } else {
        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;

        const totpFactor = factors?.totp?.find((factor: any) => factor.factorType === 'totp');
        if (totpFactor) {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
          if (error) throw error;
          toast.success('Two-factor authentication disabled.');
          setIsTwoFactorEnabled(false);
        } else {
          toast.info('No TOTP factor found to disable.');
        }
      }
    } catch (error) {
      handleApiError(error, `Failed to ${enabled ? 'enable' : 'disable'} 2FA.`);
    } finally {
      setTwoFactorLoading(false);
    }
  }, []);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t('password.mismatch'));
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      toast.error(passwordValidation.errors[0] || 'Password must be at least 6 characters long');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setShowPasswordChangeDialog(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      handleApiError(error, 'Failed to update password');
    }
  };

  const handleExportData = async () => {
    try {
      toast.success(t('data.export.requested'), {
        description: t('data.export.description')
      });
    } catch (error) {
      handleApiError(error, t('data.export.error'));
    }
  };

  const handleSendSupportRequest = () => {
    if (!supportMessage.trim()) {
      toast.error(t('support.message.required'));
      return;
    }

    toast.success(t('support.request.sent'), {
      description: t('support.request.description')
    });
    setShowSupportDialog(false);
    setSupportMessage('');
  };

  const handleDeleteAccount = async () => {
    try {
      toast.success(t('account.deletion.initiated'), {
        description: t('account.deletion.description')
      });
      setShowDeleteAccountDialog(false);
      await signOut();
    } catch (error) {
      handleApiError(error, t('account.deletion.error'));
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success(t('sign.out.success'));
  };

  if (!mounted) return null;

  return (
    <AppLayout>
      <PageLayout title={t('settings.title') || "Settings"} description={t('settings.description') || "Manage your app preferences and account settings"}>
        <div className="grid gap-6 lg:grid-cols-2">
          <SettingsSection title={t('settings.notifications')} icon={<Bell className="h-5 w-5 text-blue-600" />}>
            <SettingsItem label={t('workout.reminders')} description={t('settings.notifications.description')} control={<Switch defaultChecked onCheckedChange={(checked) => toast.success(`${t('workout.reminders')} ${checked ? t('enabled') : t('disabled')}`)} />} />
            <SettingsItem label={t('progress.updates')} description={t('settings.notifications.progress.description')} control={<Switch defaultChecked onCheckedChange={(checked) => toast.success(`${t('progress.updates')} ${checked ? t('enabled') : t('disabled')}`)} />} />
            <SettingsItem label={t('meal.reminders')} description={t('settings.notifications.meal.description')} control={<Switch onCheckedChange={(checked) => toast.success(`${t('meal.reminders')} ${checked ? t('enabled') : t('disabled')}`)} />} />
            <SettingsItem label={t('social.notifications')} description={t('settings.notifications.social.description')} control={<Switch defaultChecked onCheckedChange={(checked) => toast.success(`${t('social.notifications')} ${checked ? t('enabled') : t('disabled')}`)} />} />
          </SettingsSection>

          <SettingsSection title={t('settings.privacy')} icon={<Shield className="h-5 w-5 text-green-600" />}>
            <SettingsItem label={t('profile.visibility')} description={t('settings.privacy.description')} control={<Button variant="outline" size="sm" onClick={() => setShowProfileVisibilityDialog(true)}>{t('manage')}</Button>} />
            <SettingsItem label={t('data.sharing')} description={t('settings.privacy.data.description')} control={<Button variant="outline" size="sm" onClick={() => setShowDataSharingDialog(true)}>{t('configure')}</Button>} />
            <SettingsItem label={t('two.factor.auth')} description={t('settings.privacy.2fa.description')} control={<Button variant="outline" size="sm" onClick={() => handleTwoFactorToggle(!isTwoFactorEnabled)} disabled={twoFactorLoading}>{twoFactorLoading ? t('loading') : (isTwoFactorEnabled ? t('disable') : t('enable'))}</Button>} />
            <SettingsItem label={t('change.password')} description={t('settings.privacy.password.description')} control={<Button variant="outline" size="sm" onClick={() => setShowPasswordChangeDialog(true)}>{t('update')}</Button>} />
          </SettingsSection>

          <SettingsSection title={t('settings.preferences')} icon={<Palette className="h-5 w-5 text-purple-600" />}>
            <SettingsItem label={t('dark.mode')} description={t('settings.preferences.description')} control={<Switch checked={theme === 'dark'} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />} />
            <SettingsItem label={t('settings.language')} description={t('settings.language.description')} control={
              <Select value={language} onValueChange={(value) => {
                setLanguage(value);
                const nameKey = value === 'en' ? 'language.english' : value === 'es' ? 'language.spanish' : 'language.arabic';
                toast.success(`${t('language.changed')} ${t(nameKey)}`);
              }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{t('language.english')}</SelectItem>
                  <SelectItem value="es">{t('language.spanish')}</SelectItem>
                  <SelectItem value="ar">{t('language.arabic')}</SelectItem>
                </SelectContent>
              </Select>
            } />
            <SettingsItem label={t('settings.preferences.units')} description={t('settings.preferences.units.description')} control={
              <Select value={units} onValueChange={(value) => {
                setUnits(value);
                toast.success(`${t('units.changed')} ${value}`);
              }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="imperial">Imperial</SelectItem>
                  <SelectItem value="metric">Metric</SelectItem>
                </SelectContent>
              </Select>
            } />
          </SettingsSection>

          <SettingsSection title={t('settings.account')} icon={<Smartphone className="h-5 w-5 text-orange-600" />}>
            <SettingsItem
              label={t('export.data')}
              description={t('settings.account.description')}
              control={<Button variant="outline" size="sm" onClick={handleExportData}>{t('export')}</Button>}
            />
            <SettingsItem
              label={t('contact.support')}
              description={t('settings.account.support.description')}
              control={<Button variant="outline" size="sm" onClick={() => setShowSupportDialog(true)}>{t('contact')}</Button>}
            />
            <SettingsItem
              label={t('delete.account')}
              description={t('settings.account.delete.description')}
              control={<Button variant="outline" size="sm" onClick={() => setShowDeleteAccountDialog(true)} className="text-red-600 hover:text-red-700 border-red-600 hover:bg-red-50">{t('delete')}</Button>}
            />
            <SettingsItem
              label={t('sign.out')}
              description={t('sign.out.description') || "Sign out of your account"}
              control={<Button variant="outline" size="sm" onClick={handleSignOut} className="text-red-600 hover:text-red-700 border-red-600 hover:bg-red-50">{t('sign.out')}</Button>}
            />
          </SettingsSection>
        </div>
      </PageLayout>
      
      <Dialog open={showProfileVisibilityDialog} onOpenChange={setShowProfileVisibilityDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.visibility.title')}</DialogTitle>
            <DialogDescription>{t('profile.visibility.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('profile.visibility.level')}</Label>
              <Select value={profileVisibility} onValueChange={setProfileVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('profile.visibility.public')}</SelectItem>
                  <SelectItem value="connections">{t('profile.visibility.connections')}</SelectItem>
                  <SelectItem value="private">{t('profile.visibility.private')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => setShowProfileVisibilityDialog(false)}>{t('cancel')}</Button>
            <Button size="default" onClick={() => {
              toast.success(t('profile.visibility.updated'));
              setShowProfileVisibilityDialog(false);
            }}>{t('save.changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDataSharingDialog} onOpenChange={setShowDataSharingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('data.sharing.title')}</DialogTitle>
            <DialogDescription>{t('data.sharing.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('data.sharing.analytics')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('data.sharing.analytics.description')}</p>
              </div>
              <Switch checked={dataSharing.analytics} onCheckedChange={(checked) => setDataSharing({...dataSharing, analytics: checked})} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('data.sharing.thirdparty')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('data.sharing.thirdparty.description')}</p>
              </div>
              <Switch checked={dataSharing.thirdParty} onCheckedChange={(checked) => setDataSharing({...dataSharing, thirdParty: checked})} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('data.sharing.marketing')}</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('data.sharing.marketing.description')}</p>
              </div>
              <Switch checked={dataSharing.marketing} onCheckedChange={(checked) => setDataSharing({...dataSharing, marketing: checked})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => setShowDataSharingDialog(false)}>{t('cancel')}</Button>
            <Button size="default" onClick={() => {
              toast.success(t('data.sharing.updated'));
              setShowDataSharingDialog(false);
            }}>{t('save.changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordChangeDialog} onOpenChange={setShowPasswordChangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('password.change.title')}</DialogTitle>
            <DialogDescription>{t('password.change.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t('password.change.current')}</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('password.change.new')}</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('password.change.confirm')}</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => setShowPasswordChangeDialog(false)}>{t('cancel')}</Button>
            <Button size="default" onClick={handleChangePassword}>{t('update')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('support.contact.title')}</DialogTitle>
            <DialogDescription>{t('support.contact.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="support-message">{t('support.contact.message')}</Label>
              <Textarea
                id="support-message"
                placeholder={t('support.contact.placeholder')}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => setShowSupportDialog(false)}>{t('cancel')}</Button>
            <Button size="default" onClick={handleSendSupportRequest}>{t('send.message')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.delete.title')}</DialogTitle>
            <DialogDescription>This action cannot be undone. Your account and all associated data will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-red-500">{t('account.delete.confirm')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="default" onClick={() => setShowDeleteAccountDialog(false)}>{t('cancel')}</Button>
            <Button variant="destructive" size="default" onClick={handleDeleteAccount}>{t('delete.account.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showMfaSetupDialog && (
        <MfaSetupDialog
          isOpen={showMfaSetupDialog}
          onClose={() => setShowMfaSetupDialog(false)}
          qrCode={qrCode}
          secret={secret}
          factorId={factorId}
          onMfaEnabled={() => setIsTwoFactorEnabled(true)}
        />
      )}
    </AppLayout>
  );
};

export default Settings;
