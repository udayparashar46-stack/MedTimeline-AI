import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { authApi } from '../lib/apiClient';

interface AuthPageProps {
  onSuccess: () => void;
  onSwitchMode: () => void;
  isRegister?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess, onSwitchMode, isRegister = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await authApi.register(email, password, fullName || undefined);
        // Automatically login after successful registration
        await authApi.login(email, password);
      } else {
        await authApi.login(email, password);
      }
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-lg border border-slate-200">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-slate-800">
            {isRegister ? 'Create an Account' : 'Sign In to MedTimeline'}
          </CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            {isRegister
              ? 'Secure, isolated clinical timelines for your patients'
              : 'Enter your credentials to access your patient workspaces'}
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Full Name (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="Dr. Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <Input
                type="email"
                required
                placeholder="clinician@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Password
              </label>
              <Input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading
                ? isRegister
                  ? 'Creating Account...'
                  : 'Signing In...'
                : isRegister
                ? 'Sign Up'
                : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 border-t border-slate-100 pt-4">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchMode}
                  className="font-medium text-indigo-600 hover:text-indigo-500 underline"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchMode}
                  className="font-medium text-indigo-600 hover:text-indigo-500 underline"
                >
                  Create one now
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
