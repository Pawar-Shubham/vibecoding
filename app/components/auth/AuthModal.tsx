import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  signInWithGoogle,
  signInWithGitHub,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
} from "~/lib/supabase";
import { toast } from "react-toastify";
import Cookies from "js-cookie";
import { getSession, getCurrentUser } from "~/lib/supabase";
import { authStore } from "~/lib/stores/auth";
import { FiEye, FiEyeOff } from "react-icons/fi";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (pendingPrompt?: string) => void;
  initialTab?: "signin" | "signup";
}

export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  initialTab = "signin",
}: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [tabValue, setTabValue] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Reset tab when modal opens with initialTab
  useEffect(() => {
    if (isOpen) {
      setTabValue(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleSuccessfulLogin = async () => {
    try {
      // Get the latest session and user data
      const session = await getSession();
      const user = await getCurrentUser();

      if (user && session) {
        // Update auth store directly
        authStore.set({
          user,
          session,
          loading: false,
          initialized: true,
          error: null,
        });

        // Handle any pending prompts
        const pendingPrompt = Cookies.get("pending_prompt");
        if (pendingPrompt) {
          Cookies.remove("pending_prompt");
          if (onSuccess) onSuccess(pendingPrompt);
        } else {
          if (onSuccess) onSuccess();
        }

        // Show success message
        toast.success("Signed in successfully");

        // Close the modal
        onClose();
      } else {
        throw new Error("Failed to get user data after login");
      }
    } catch (error) {
      console.error("Error handling successful login:", error);
      toast.error("There was a problem completing your sign in");
      setErrorMessage("Failed to complete sign in process");
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { data, error } = await signInWithGoogle();

      if (error) {
        throw error;
      }

      // For OAuth providers, we'll get a redirect so we don't need to handle success here
      // The auth state will be handled by the auth callback route
    } catch (error: any) {
      console.error("Google sign in error:", error);
      setErrorMessage(error.message || "Failed to sign in with Google");
      toast.error(error.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { data, error } = await signInWithGitHub();

      if (error) {
        throw error;
      }

      // For OAuth providers, we'll get a redirect so we don't need to handle success here
      // The auth state will be handled by the auth callback route
    } catch (error: any) {
      console.error("GitHub sign in error:", error);
      setErrorMessage(error.message || "Failed to sign in with GitHub");
      toast.error(error.message || "Failed to sign in with GitHub");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const { data, error } = await signInWithEmail(email, password);

      if (error) {
        throw error;
      }

      if (data?.user) {
        await handleSuccessfulLogin();
      } else {
        throw new Error("No user data returned from sign in");
      }
    } catch (error: any) {
      console.error("Sign in error:", error);
      setErrorMessage(error.message || "Failed to sign in");
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setErrorMessage("Please enter both email and password");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters");
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await signUpWithEmail(email, password);

      if (error) {
        console.error("Email sign up error:", error);
        setErrorMessage(error.message || "Failed to sign up with email");
      } else {
        setSuccessMessage("Check your email to confirm your account");
        toast.success("Check your email to confirm your account");
        setTabValue("signin");
      }
    } catch (error: any) {
      console.error("Email sign up error:", error);
      setErrorMessage(error.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email) {
      setErrorMessage("Please enter your email");
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await resetPassword(email);

      if (error) {
        console.error("Password reset error:", error);
        setErrorMessage(error.message || "Failed to send password reset email");
      } else {
        setSuccessMessage("Check your email for password reset instructions");
        toast.success("Check your email for password reset instructions");
        setForgotPassword(false);
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      setErrorMessage(error.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset messages when switching tabs or toggling forgot password
  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [tabValue, forgotPassword]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="auth-modal-overlay fixed inset-0 z-50" />
        <Dialog.Content className="auth-modal-content fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-8 w-full max-w-md">
          <div className="mb-7 text-center">
            <Dialog.Title className="text-2xl font-bold text-white dark:text-white light-mode-title mb-2">
              {forgotPassword ? (
                "Reset Password"
              ) : (
                <div className="flex items-center justify-center gap-2">
                  Welcome to{" "}
                  <span className="flex items-center">
                    <img
                      src="/logo-dark-styled.png"
                      alt="logo"
                      className="h-[30px] w-auto hidden dark:inline-block"
                    />
                    <img
                      src="/chat-logo-light-styled.png"
                      alt="logo"
                      className="h-[30px] w-auto dark:hidden inline-block"
                    />
                  </span>
                </div>
              )}
            </Dialog.Title>
            <Dialog.Description className="text-gray-800 dark:text-gray-300 text-sm">
              {forgotPassword
                ? "Enter your email to receive a password reset link"
                : tabValue === "signup"
                  ? "Sign up to save your chats and build"
                  : "Sign in to save your chats and build"}
            </Dialog.Description>
          </div>

          {errorMessage && <div className="auth-error">{errorMessage}</div>}

          {successMessage && (
            <div className="auth-success">{successMessage}</div>
          )}

          <Tabs.Root
            value={tabValue}
            onValueChange={(value: string) => {
              // Only set if it's one of our valid values
              if (value === "signin" || value === "signup") {
                setTabValue(value);
              }
            }}
          >
            {!forgotPassword ? (
              <>
                <Tabs.List className="flex mb-6 border-b border-gray-700">
                  <Tabs.Trigger
                    value="signin"
                    className="auth-tabs-trigger flex-1 py-3 text-sm font-medium"
                  >
                    Sign In
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="signup"
                    className="auth-tabs-trigger flex-1 py-3 text-sm font-medium"
                  >
                    Sign Up
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="signin">
                  <form onSubmit={handleEmailSignIn} className="space-y-5 mb-5">
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2"
                      >
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input w-full px-4 py-3 rounded-lg"
                        disabled={isLoading}
                        placeholder="bro@email.com"
                        required
                      />
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input w-full px-4 py-3 rounded-lg pr-12"
                        disabled={isLoading}
                        placeholder="********"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent border-none outline-none focus:outline-none"
                        tabIndex={-1}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <FiEyeOff size={20} />
                        ) : (
                          <FiEye size={20} />
                        )}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="forgot-password text-xs"
                        onClick={() => setForgotPassword(true)}
                        disabled={isLoading}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <button
                      type="submit"
                      className="auth-btn-primary w-full py-3 rounded-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? "Signing in..." : "Sign In"}
                    </button>
                  </form>
                </Tabs.Content>

                <Tabs.Content value="signup">
                  <form onSubmit={handleEmailSignUp} className="space-y-5 mb-5">
                    <div>
                      <label
                        htmlFor="signup-email"
                        className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2"
                      >
                        Email Address
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input w-full px-4 py-3 rounded-lg"
                        disabled={isLoading}
                        placeholder="bro@email.com"
                        required
                      />
                    </div>
                    <div className="relative">
                      <input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input w-full px-4 py-3 rounded-lg pr-12"
                        disabled={isLoading}
                        placeholder="********"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent border-none outline-none focus:outline-none"
                        tabIndex={-1}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <FiEyeOff size={20} />
                        ) : (
                          <FiEye size={20} />
                        )}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="auth-input w-full px-4 py-3 rounded-lg pr-12"
                        disabled={isLoading}
                        placeholder="********"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent border-none outline-none focus:outline-none"
                        tabIndex={-1}
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirmPassword ? (
                          <FiEyeOff size={20} />
                        ) : (
                          <FiEye size={20} />
                        )}
                      </button>
                    </div>
                    <button
                      type="submit"
                      className="auth-btn-primary w-full py-3 rounded-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? "Signing up..." : "Sign Up"}
                    </button>
                  </form>
                </Tabs.Content>
              </>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-5 mb-5">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-sm font-medium text-gray-900 dark:text-gray-200 mb-2"
                  >
                    Email Address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="auth-input w-full px-4 py-3 rounded-lg"
                    disabled={isLoading}
                    placeholder="bro@email.com"
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="auth-btn-secondary flex-1 py-3 rounded-lg"
                    onClick={() => setForgotPassword(false)}
                    disabled={isLoading}
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="submit"
                    className="auth-btn-primary flex-1 py-3 rounded-lg"
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Send Reset Link"}
                  </button>
                </div>
              </form>
            )}
          </Tabs.Root>

          {!forgotPassword && (
            <>
              <div className="auth-divider">
                <span>Or continue with</span>
              </div>

              <div className="space-y-3">
                <button
                  className="auth-social-btn w-full"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    width="24px"
                    height="24px"
                  >
                    <path
                      fill="#FFC107"
                      d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                    />
                    <path
                      fill="#1976D2"
                      d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
                <button
                  className="auth-social-btn w-full"
                  onClick={handleGitHubSignIn}
                  disabled={isLoading}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M12 2C6.477 2 2 6.477 2 12C2 16.418 4.865 20.166 8.839 21.489C9.339 21.581 9.5 21.277 9.5 21.012C9.5 20.776 9.485 19.967 9.485 19.092C7 19.591 6.35 18.466 6.15 17.891C6.037 17.592 5.5 16.668 5 16.431C4.6 16.242 4.1 15.743 4.994 15.736C5.827 15.728 6.437 16.518 6.625 16.825C7.55 18.38 8.988 17.929 9.541 17.665C9.634 16.969 9.907 16.493 10.21 16.225C7.91 15.957 5.5 15.031 5.5 11.167C5.5 10.034 5.93 9.099 6.645 8.358C6.541 8.107 6.156 7.042 6.745 5.785C6.745 5.785 7.615 5.52 9.5 6.852C10.29 6.622 11.15 6.507 12.01 6.507C12.87 6.507 13.73 6.622 14.52 6.852C16.4 5.512 17.27 5.785 17.27 5.785C17.859 7.042 17.475 8.107 17.37 8.358C18.085 9.099 18.515 10.026 18.515 11.167C18.515 15.041 16.097 15.957 13.797 16.225C14.178 16.554 14.512 17.195 14.512 18.19C14.512 19.603 14.497 20.678 14.497 21.012C14.497 21.277 14.658 21.588 15.158 21.489C19.1399 20.161 21.9999 16.4191 22 12C22 6.477 17.523 2 12 2Z" />
                  </svg>
                  <span>Sign in with GitHub</span>
                </button>
              </div>
            </>
          )}

          <Dialog.Close asChild>
            <button
              className="absolute top-3 right-3 p-2 rounded-full"
              aria-label="Close"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
