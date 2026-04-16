// ========================================
// SECURITY UTILITIES
// ========================================
// Centralized security functions for the application

import { z } from 'zod';

// ========================================
// CORS CONFIGURATION
// ========================================

export const getCorsHeaders = (origin?: string) => {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://fitpathway.app',
    'https://www.fitpathway.app'
  ];

  const requestOrigin = origin || '*';
  const corsOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://api.openrouter.ai https://oauth2.googleapis.com https://api.stripe.com;"
  };
};

// ========================================
// INPUT VALIDATION & SANITIZATION
// ========================================

export const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

export const sanitizeEmail = (email: string): string => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email.toLowerCase().trim() : '';
};

export const sanitizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

// ========================================
// PASSWORD VALIDATION
// ========================================

export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
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
// RATE LIMITING
// ========================================

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number; violations: number }>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(identifier);

    if (!userRequests || now > userRequests.resetTime) {
      // Reset or initialize, but maintain violation history
      const violations = userRequests?.violations || 0;
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.config.windowMs,
        violations
      });
      return true;
    }

    if (userRequests.count >= this.config.maxRequests) {
      // Track violations for progressive penalties
      userRequests.violations = (userRequests.violations || 0) + 1;
      
      // Apply progressive penalties (exponential backoff)
      const penaltyMultiplier = Math.min(Math.pow(2, userRequests.violations), 8);
      userRequests.resetTime = now + (this.config.windowMs * penaltyMultiplier);
      
      return false;
    }

    userRequests.count++;
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const userRequests = this.requests.get(identifier);
    if (!userRequests) return this.config.maxRequests;
    return Math.max(0, this.config.maxRequests - userRequests.count);
  }

  getResetTime(identifier: string): number {
    const userRequests = this.requests.get(identifier);
    return userRequests?.resetTime || Date.now();
  }
}

// ========================================
// AUTHENTICATION HELPERS
// ========================================

export const validateAuthHeader = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.replace('Bearer ', '').trim();
  if (token.length === 0) {
    return null;
  }
  
  return token;
};

// ========================================
// ERROR HANDLING
// ========================================

export class SecurityError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'SECURITY_ERROR'
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

export const handleSecurityError = (error: unknown): SecurityError => {
  if (error instanceof SecurityError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new SecurityError(error.message, 500, 'INTERNAL_ERROR');
  }
  
  return new SecurityError('An unknown security error occurred', 500, 'UNKNOWN_ERROR');
};

// ========================================
// VALIDATION SCHEMAS
// ========================================

export const UserInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(1, 'Full name is required').max(100, 'Full name too long'),
  role: z.enum(['trainer', 'athlete'], { errorMap: () => ({ message: 'Invalid role' }) })
});

export const WorkoutInputSchema = z.object({
  name: z.string().min(1, 'Workout name is required').max(200, 'Workout name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  exercises: z.array(z.object({
    name: z.string().min(1, 'Exercise name is required').max(100, 'Exercise name too long'),
    sets: z.number().min(1, 'Sets must be at least 1').max(100, 'Sets too high'),
    reps: z.string().min(1, 'Reps are required').max(50, 'Reps too long')
  })).min(1, 'At least one exercise is required')
});

export const MessageInputSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(1000, 'Message too long'),
  recipientId: z.string().uuid('Invalid recipient ID')
});

// ========================================
// LOGGING & MONITORING
// ========================================

export const logSecurityEvent = (
  event: string,
  details: Record<string, unknown>,
  userId?: string
) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    userId,
    details,
    environment: process.env.NODE_ENV || 'development'
  };

  // In production, this should go to a proper logging service
  if (process.env.NODE_ENV === 'production') {
    console.log('[SECURITY]', JSON.stringify(logEntry));
  } else {
    console.log('[SECURITY]', logEntry);
  }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

export const generateSecureId = (): string => {
  return crypto.randomUUID();
};

export const hashString = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
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