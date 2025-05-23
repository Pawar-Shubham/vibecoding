# Supabase Authentication Setup

This document outlines the steps required to set up Supabase authentication for the VibesXCoded application.

## Prerequisites

1. Supabase account
2. Project with ID: `hwxqmtguaaarjneyfyad`
3. Google Cloud Console account (for Google OAuth)
4. GitHub account (for GitHub OAuth)

## Configuration Steps

### 1. Database Setup

Run the SQL script in the Supabase SQL editor to create the necessary tables:

```sql
-- Copy the contents of supabase-tables.sql here
```

### 2. Authentication Providers Setup

1. Navigate to Authentication > Providers in the Supabase dashboard
2. Enable the following providers:
   - Email (default)
   - Google
   - GitHub

#### Email Authentication Setup

1. In your Supabase dashboard, go to Authentication > Settings
2. Under "Email Auth", make sure it's enabled
3. Configure these settings:
   - Confirm email: Enabled (recommended for security)
   - Secure email change: Enabled (recommended for security)
   - Double confirm changes: Enabled (recommended for security)
   - Custom SMTP server (optional):
     - If you want to use your own email server, fill in the SMTP settings
     - Otherwise, Supabase will use its default email service

#### Google OAuth Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Configure the OAuth consent screen:
   - User Type: External
   - App name: VibesXCoded
   - User support email: Your email
   - Developer contact information: Your email
   - Authorized domains: Add your domain or use `hwxqmtguaaarjneyfyad.supabase.co`
6. Create OAuth client ID:
   - Application type: Web application
   - Name: VibesXCoded Web Client
   - Authorized JavaScript origins:
     - `https://hwxqmtguaaarjneyfyad.supabase.co`
     - `http://localhost:5173` (for development)
   - Authorized redirect URIs:
     - `https://hwxqmtguaaarjneyfyad.supabase.co/auth/v1/callback`
     - `http://localhost:5173/api/auth/callback` (for development)
7. Click "Create" and note the Client ID and Client Secret
8. Go back to Supabase dashboard > Authentication > Providers
9. Find "Google" provider and click "Edit"
10. Enter the Client ID and Client Secret from Google Cloud Console
11. Save changes

#### GitHub OAuth Setup

1. Go to your [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: VibesXCoded
   - Homepage URL: Your application URL or `https://hwxqmtguaaarjneyfyad.supabase.co`
   - Application description: Brief description of your app
   - Authorization callback URL: `https://hwxqmtguaaarjneyfyad.supabase.co/auth/v1/callback`
4. Click "Register application"
5. On the next screen, note the Client ID
6. Click "Generate a new client secret" and note the secret
7. Go back to Supabase dashboard > Authentication > Providers
8. Find "GitHub" provider and click "Edit"
9. Enter the Client ID and Client Secret from GitHub
10. Save changes

### 3. Environment Variables

Ensure your application has the following environment variables (already set in the codebase):

```
SUPABASE_URL=https://hwxqmtguaaarjneyfyad.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3eHFtdGd1YWFhcmpuZXlmeWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTc0MTg0OTUsImV4cCI6MjAzMjk5NDQ5NX0.BGBHS2nYSFDM9Bd5IC53o9Ln7I0yjEDO_ZeZgJLv6xI
```

## Testing OAuth Setup

### Google OAuth Testing

1. Make sure you've properly configured Google OAuth in both Google Cloud Console and Supabase
2. Open your application and try to sign in with Google
3. You should be redirected to Google's consent screen
4. After granting permission, you should be redirected back to your application and signed in

### GitHub OAuth Testing

1. Make sure you've properly configured GitHub OAuth in both GitHub Developer Settings and Supabase
2. Open your application and try to sign in with GitHub
3. You should be redirected to GitHub's authorization page
4. After authorizing, you should be redirected back to your application and signed in

### Email Authentication Testing

1. Test sign-up: Enter an email and password, and check if confirmation email is sent
2. Test sign-in: Use the email and password to sign in
3. Test password reset: Use the "Forgot password?" option and check if reset email is sent

## Troubleshooting OAuth Issues

### Common Google OAuth Issues

1. **Redirect URI mismatch**: Ensure the redirect URIs in Google Cloud Console exactly match those in Supabase
2. **Missing scopes**: Ensure you've added required scopes (email, profile) in Google Cloud Console
3. **API not enabled**: Make sure you've enabled the "Google+ API" or "People API" in Google Cloud Console
4. **Application not verified**: For production use, you may need to verify your app with Google

### Common GitHub OAuth Issues

1. **Callback URL mismatch**: Ensure the callback URL in GitHub exactly matches the one in Supabase
2. **Rate limiting**: GitHub has API rate limits which might affect authentication during high traffic
3. **Scope issues**: Make sure you've set appropriate scopes in both GitHub and Supabase settings

## Usage

Once set up, the application will:

1. Show a sign-in modal when a user attempts to submit a prompt without being authenticated
2. Offer email/password authentication, "Continue with Google", and "Continue with GitHub" options
3. After authentication, store user data in Supabase linked to their user ID
4. Allow authenticated users to continue using the app normally

## Data Structure

The following tables are created in Supabase:

1. `user_data` - Stores user-specific data and preferences
2. `chats` - Stores chat history metadata
3. `messages` - Stores individual chat messages
4. `files` - Stores user files and code

## Security

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

For more information, refer to the [Supabase Authentication documentation](https://supabase.com/docs/guides/auth) 