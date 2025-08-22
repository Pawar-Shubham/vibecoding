import { useState, useCallback, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { classNames } from "~/utils/classNames";
import {
  profileStore,
  updateProfile,
  initializeProfile,
} from "~/lib/stores/profile";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import { useAuth } from "~/lib/hooks/useAuth";

interface Profile {
  username: string;
  email: string;
  bio: string;
  avatar?: string;
}

export default function ProfileTab() {
  const { user } = useAuth();
  const profile = useStore(profileStore);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  // Safety check: Don't render if no user is authenticated
  if (!user?.id) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="text-gray-500 dark:text-gray-400">
          Please sign in to access profile settings.
        </div>
      </div>
    );
  }

  // Local form state
  const [formData, setFormData] = useState<Profile>({
    username: profile.username || "",
    email: profile.email || user?.email || "",
    bio: profile.bio || "",
    avatar: profile.avatar || "",
  });

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize profile if not loaded
  useEffect(() => {
    const loadProfile = async () => {
      if (user?.id && (!profile.userId || profile.userId !== user.id)) {
        console.log("Profile not loaded for current user, initializing...");
        setIsProfileLoading(true);
        try {
          await initializeProfile(user.id, user.user_metadata);
        } catch (error) {
          console.error("Error initializing profile:", error);
        } finally {
          setIsProfileLoading(false);
        }
      } else {
        setIsProfileLoading(false);
      }
    };

    loadProfile();
  }, [user?.id, profile.userId]);

  // Update local state when profile store changes (e.g., from avatar upload)
  useEffect(() => {
    if (!profile.userId || profile.userId === user?.id) {
      const newFormData = {
        username: profile.username || "",
        email: profile.email || user?.email || "",
        bio: profile.bio || "",
        avatar: profile.avatar || "",
      };
      setFormData(newFormData);
    }
  }, [profile, user?.email, user?.id]);

  // Check for changes
  useEffect(() => {
    const originalData = {
      username: profile.username || "",
      email: profile.email || user?.email || "",
      bio: profile.bio || "",
      avatar: profile.avatar || "",
    };

    const hasFormChanges =
      formData.username !== originalData.username ||
      formData.email !== originalData.email ||
      formData.bio !== originalData.bio;

    setHasChanges(hasFormChanges);
  }, [formData, profile, user?.email]);

  const handleInputChange = useCallback(
    (field: keyof Profile, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasChanges || isSaving) return;

    setIsSaving(true);

    try {
      await updateProfile(
        {
          username: formData.username,
          email: formData.email,
          bio: formData.bio,
          avatar: formData.avatar,
        },
        user?.id
      );

      toast.success("Account Information Updated");
      setHasChanges(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update account information");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsUploading(true);

      // Convert the file to base64
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;
          // Update the form data and save avatar immediately
          setFormData((prev) => ({ ...prev, avatar: base64String }));
          await updateProfile({ avatar: base64String }, user?.id);
          setIsUploading(false);
          toast.success("Profile picture updated");
        } catch (error) {
          console.error("Error updating avatar:", error);
          setIsUploading(false);
          toast.error("Failed to update profile picture");
        }
      };

      reader.onerror = () => {
        console.error("Error reading file:", reader.error);
        setIsUploading(false);
        toast.error("Failed to update profile picture");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      setIsUploading(false);
      toast.error("Failed to update profile picture");
    }
  };

  // Show loading state while profile is being loaded
  if (isProfileLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-center gap-3 text-gray-600 dark:text-gray-400">
          <div className="i-ph:spinner-gap w-6 h-6 animate-spin" />
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Profile Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Your Profile
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your account information and preferences
            </p>
          </div>

          {/* Profile Picture Section */}
          <div className="flex flex-col items-center">
            <div
              className={classNames(
                "w-32 h-32 rounded-full overflow-hidden",
                "bg-gray-100 dark:bg-gray-800/50",
                "flex items-center justify-center",
                "ring-4 ring-gray-200 dark:ring-gray-700",
                "relative group",
                "transition-all duration-300 ease-out",
                "hover:ring-[#07F29C]/30 dark:hover:ring-[#07F29C]/30",
                "hover:shadow-xl hover:shadow-[#07F29C]/20"
              )}
            >
              {formData.avatar ? (
                <img
                  src={formData.avatar}
                  alt="Profile"
                  className={classNames(
                    "w-full h-full object-cover",
                    "transition-all duration-300 ease-out",
                    "group-hover:scale-110 group-hover:brightness-90"
                  )}
                />
              ) : (
                <div className="i-ph:robot-fill w-20 h-20 text-gray-400 dark:text-gray-500 transition-colors group-hover:text-[#07F29C]/70 transform -translate-y-1" />
              )}

              <label
                className={classNames(
                  "absolute inset-0",
                  "flex items-center justify-center",
                  "bg-black/0 group-hover:bg-black/40",
                  "cursor-pointer transition-all duration-300 ease-out",
                  "rounded-full",
                  isUploading ? "cursor-wait" : ""
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={isUploading}
                />
                {isUploading ? (
                  <div className="i-ph:spinner-gap w-8 h-8 text-white animate-spin" />
                ) : (
                  <div className="i-ph:camera-plus w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out transform group-hover:scale-110" />
                )}
              </label>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                Profile Picture
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Click to upload a new avatar
              </p>
            </div>
          </div>

          {/* Profile Information */}
          <div className="grid grid-cols-1 gap-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="i-ph:user-circle-fill w-5 h-5 text-[#07F29C]" />
                  Username
                </div>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleInputChange("username", e.target.value)}
                className={classNames(
                  "w-full px-4 py-3 rounded-xl",
                  "bg-white dark:bg-gray-800/50",
                  "border border-gray-200 dark:border-gray-700/50",
                  "text-gray-900 dark:text-white",
                  "placeholder-gray-400 dark:placeholder-gray-500",
                  "focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]/30",
                  "transition-all duration-300 ease-out"
                )}
                placeholder="Enter your username"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="i-ph:envelope-fill w-5 h-5 text-[#07F29C]" />
                  Email
                </div>
              </label>
              <input
                type="email"
                value={formData.email}
                readOnly
                className={classNames(
                  "w-full px-4 py-3 rounded-xl",
                  "bg-gray-50 dark:bg-gray-800/30",
                  "border border-gray-200 dark:border-gray-700/50",
                  "text-gray-700 dark:text-gray-300",
                  "cursor-not-allowed",
                  "transition-all duration-300 ease-out"
                )}
                placeholder="Enter your email address"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="i-ph:text-aa w-5 h-5 text-[#07F29C]" />
                  Bio
                </div>
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => handleInputChange("bio", e.target.value)}
                className={classNames(
                  "w-full px-4 py-3 rounded-xl",
                  "bg-white dark:bg-gray-800/50",
                  "border border-gray-200 dark:border-gray-700/50",
                  "text-gray-900 dark:text-white",
                  "placeholder-gray-400 dark:placeholder-gray-500",
                  "focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30 focus:border-[#07F29C]/30",
                  "transition-all duration-300 ease-out",
                  "resize-none",
                  "h-32"
                )}
                placeholder="Tell us about yourself..."
              />
            </div>
          </div>

          {/* Submit Button */}
          {hasChanges && (
            <div className="pt-6">
              <button
                type="submit"
                disabled={!hasChanges || isSaving}
                className={classNames(
                  "w-full py-2 px-4 rounded-md font-medium text-sm relative overflow-hidden",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-all duration-300 ease-out",
                  "focus:outline-none focus:ring-2 focus:ring-[#07F29C]/30"
                )}
                style={{
                  background: "linear-gradient(90deg, #F2E59F, #07F29C)",
                }}
              >
                <div className="relative z-10 text-black">
                  {isSaving ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="i-ph:spinner-gap w-6 h-6 animate-spin" />
                      Saving...
                    </div>
                  ) : (
                    "Save Changes"
                  )}
                </div>
                <div
                  className="absolute inset-0 transition-opacity duration-500 ease-in-out opacity-0 hover:opacity-100"
                  style={{
                    background: "linear-gradient(90deg, #07F29C, #F2E59F)",
                  }}
                />
              </button>
            </div>
          )}
        </form>
      </motion.div>
    </div>
  );
}
