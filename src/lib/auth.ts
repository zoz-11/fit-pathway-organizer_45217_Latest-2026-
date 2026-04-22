// ========================================
// AUTHENTICATION UTILITIES
// ========================================
// Centralized authentication functions for the application

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateAuthHeader, SecurityError, logSecurityEvent } from './security';

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'trainer' | 'athlete';
  profile: any;
}

export const validateAuth = async (
  req: Request,
  supabaseClient: SupabaseClient
): Promise<AuthenticatedUser> => {
  try {
    // Validate authorization header
    const authHeader = req.headers.get('Authorization');
    const token = validateAuthHeader(authHeader);
    
    if (!token) {
      logSecurityEvent('AUTH_FAILED', { reason: 'Missing or invalid auth header' });
      throw new SecurityError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Verify user with Supabase
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      logSecurityEvent('AUTH_FAILED', { reason: 'Invalid token', error: authError?.message });
      throw new SecurityError('Invalid authentication token', 401, 'INVALID_TOKEN');
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logSecurityEvent('AUTH_FAILED', { reason: 'Profile not found', userId: user.id });
      throw new SecurityError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    const { data: userRoleRow, error: userRoleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userRoleError) {
      logSecurityEvent('AUTH_FAILED', { reason: 'Unable to read user role', userId: user.id, error: userRoleError.message });
      throw new SecurityError('Unable to validate user role', 403, 'INVALID_ROLE');
    }

    const resolvedRole = userRoleRow?.role ?? profile.role;
    if (!resolvedRole || !['admin', 'trainer', 'athlete'].includes(resolvedRole)) {
      logSecurityEvent('AUTH_FAILED', { reason: 'Invalid user role', userId: user.id, role: resolvedRole });
      throw new SecurityError('Invalid user role', 403, 'INVALID_ROLE');
    }

    logSecurityEvent('AUTH_SUCCESS', { userId: user.id, role: resolvedRole });

    return {
      id: user.id,
      email: user.email || '',
      role: resolvedRole as 'admin' | 'trainer' | 'athlete',
      profile
    };
  } catch (error) {
    if (error instanceof SecurityError) {
      throw error;
    }
    
    logSecurityEvent('AUTH_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
    throw new SecurityError('Authentication failed', 500, 'AUTH_ERROR');
  }
};

// ========================================
// ROLE-BASED ACCESS CONTROL
// ========================================

const roleRank: Record<'athlete' | 'trainer' | 'admin', number> = {
  athlete: 1,
  trainer: 2,
  admin: 3,
};

export const requireRole = (requiredRole: 'admin' | 'trainer' | 'athlete' | 'both') => {
  return (user: AuthenticatedUser): boolean => {
    if (requiredRole === 'both') {
      return true; // Both roles are allowed
    }

    return roleRank[user.role] >= roleRank[requiredRole];
  };
};

export const requireAdmin = requireRole('admin');
export const requireTrainer = requireRole('trainer');
export const requireAthlete = requireRole('athlete');

export const validateUserAccess = (
  user: AuthenticatedUser,
  resourceUserId: string,
  allowSelf: boolean = true,
  allowTrainer: boolean = false
): boolean => {
  // User can always access their own resources
  if (allowSelf && user.id === resourceUserId) {
    return true;
  }

  // Trainers can access their athletes' resources
  if (allowTrainer && (user.role === 'trainer' || user.role === 'admin')) {
    // Allow trainers/admins to access athlete resources (will be validated by RLS policies)
    return true;
  }

  return false;
};

// ========================================
// SESSION MANAGEMENT
// ========================================

export const validateSession = async (
  supabaseClient: SupabaseClient,
  token: string
): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
      return false;
    }

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < now) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

// ========================================
// PASSWORD MANAGEMENT
// ========================================

export const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// ========================================
// ACCOUNT LOCKOUT
// ========================================

interface LoginAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

export const checkAccountLockout = (email: string): { isLocked: boolean; remainingTime?: number } => {
  const attempts = loginAttempts.get(email);
  
  if (!attempts) {
    return { isLocked: false };
  }

  const now = Date.now();
  
  // Check if account is locked
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    return { 
      isLocked: true, 
      remainingTime: attempts.lockedUntil - now 
    };
  }

  // Reset lockout if time has passed
  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    loginAttempts.delete(email);
    return { isLocked: false };
  }

  return { isLocked: false };
};

export const recordLoginAttempt = (email: string, success: boolean): void => {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
  
  if (success) {
    // Reset on successful login
    loginAttempts.delete(email);
    return;
  }

  attempts.count++;
  attempts.lastAttempt = Date.now();

  // Lock account after 5 failed attempts for 15 minutes
  if (attempts.count >= 5) {
    attempts.lockedUntil = Date.now() + (15 * 60 * 1000); // 15 minutes
  }

  loginAttempts.set(email, attempts);
};

// ========================================
// TWO-FACTOR AUTHENTICATION
// ========================================

export const validateMFA = async (
  supabaseClient: SupabaseClient,
  factorId: string,
  code: string
): Promise<boolean> => {
  try {
    const { error } = await supabaseClient.auth.mfa.verify({
      factorId,
      code,
      challengeId: factorId,
    });

    return !error;
  } catch {
    return false;
  }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

export const generateSecureToken = (): string => {
  return crypto.randomUUID();
};

export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const sanitizeUserInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}; 
