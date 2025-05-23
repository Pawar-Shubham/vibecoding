import { useState, useEffect } from 'react';
import { json, redirect, type LoaderFunction, type ActionFunction } from '@remix-run/cloudflare';
import { useLoaderData, useSubmit, Form } from '@remix-run/react';
import { updatePassword } from '~/lib/supabase';
import { toast } from 'react-toastify';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const hash = url.hash;
  
  if (!hash) {
    return redirect('/');
  }
  
  return json({ hash });
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  
  if (!password || !confirmPassword) {
    return json({ error: 'Please enter both password fields' }, { status: 400 });
  }
  
  if (password !== confirmPassword) {
    return json({ error: 'Passwords do not match' }, { status: 400 });
  }
  
  if (password.length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }
  
  return json({ success: true });
};

export default function ResetPassword() {
  const { hash } = useLoaderData<{ hash: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const submit = useSubmit();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!password || !confirmPassword) {
      setError('Please enter both password fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await updatePassword(password);
      
      if (error) {
        console.error('Password update error:', error);
        setError(error.message || 'Failed to update password');
      } else {
        setSuccess(true);
        toast.success('Password updated successfully. You can now sign in with your new password.');
        
        // Redirect to home after a delay
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    } catch (err: any) {
      console.error('Password update error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 flex items-center justify-center p-4">
      <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-semibold text-bolt-elements-text-default mb-6">Reset Password</h1>
        
        {success ? (
          <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-md mb-4">
            Password updated successfully! Redirecting you to the sign-in page...
          </div>
        ) : (
          <Form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-md mb-4">
                {error}
              </div>
            )}
            
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-bolt-elements-text-default mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-border-default rounded-md text-bolt-elements-text-default"
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
            
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-bolt-elements-text-default mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-border-default rounded-md text-bolt-elements-text-default"
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-bolt-elements-background-accent hover:bg-bolt-elements-background-accent-hover text-white font-medium p-2 rounded-md transition-colors"
            >
              {isLoading ? 'Updating Password...' : 'Update Password'}
            </button>
            
            <div className="mt-4 text-center">
              <a href="/" className="text-sm text-bolt-elements-text-accent hover:underline">
                Back to Home
              </a>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
} 