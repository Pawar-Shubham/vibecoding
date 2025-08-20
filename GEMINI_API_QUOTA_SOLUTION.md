# Gemini API Quota Solution

## Problem
You're encountering "Failed after 3 attempts. Last error: You exceeded your current quota" errors when using Gemini APIs, despite having multiple API keys configured.

## Root Cause
The system was only using ONE API key at a time, even when multiple keys were available. There was no automatic load balancing or key rotation to distribute requests across different API keys.

## Solutions Implemented

### 1. Multiple API Key Support (IMPLEMENTED)
Modified the Google provider to support comma-separated API keys with automatic rotation.

**Configuration:**
```bash
# In your .env.local file:
GOOGLE_GENERATIVE_AI_API_KEY=key1,key2,key3,key4
GEMINI_LOGO_CREATOR_API_KEY=logo_key1,logo_key2,logo_key3
```

**Features:**
- Automatically rotates between available API keys
- Time-based rotation (switches every minute)
- Random selection for logo generation
- Fallback to single key if only one is provided

### 2. Environment Variable Setup

Make sure your `.env.local` file contains:
```bash
# Main chat API keys (comma-separated)
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyD...key1,AIzaSyD...key2,AIzaSyD...key3

# Logo generation API keys (comma-separated) 
GEMINI_LOGO_CREATOR_API_KEY=AIzaSyD...logo1,AIzaSyD...logo2

# Other API keys
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### 3. Docker Configuration
Your `docker-compose.yaml` already includes the correct environment variables:
```yaml
environment:
  - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}
  - GEMINI_LOGO_CREATOR_API_KEY=${GEMINI_LOGO_CREATOR_API_KEY}
```

## What Changed

### Modified Files:
1. **`app/lib/modules/llm/providers/google.ts`**
   - Added API key rotation logic
   - Support for comma-separated API keys
   - Time-based rotation for chat requests

2. **`app/routes/api.logo.ts`**
   - Random API key selection for logo generation
   - Support for multiple logo API keys

### Key Features:
- **Load Balancing**: Requests are distributed across multiple API keys
- **Quota Management**: When one key hits quota limits, others are still available
- **Time-based Rotation**: Keys rotate every minute for chat requests
- **Random Selection**: Logo requests use random key selection for better distribution

## Testing the Solution

1. **Add multiple API keys** to your `.env.local` file (comma-separated)
2. **Restart your application**
3. **Monitor the behavior**:
   - Check browser dev tools for API calls
   - Look for rotation in server logs
   - Verify that quota errors are reduced

## Monitoring API Key Usage

### 1. Server Logs
The system now logs which API key is being used for each request:

```bash
# Look for these log messages in your server output:
[GoogleProvider] Using API key 1/3 (AIzaSyD...abcd) for Google provider
[GoogleProvider] Rotated to API key 2/3 for Google provider
[api.logo] Logo generation using API key 2/2 (AIzaSyD...efgh)
```

### 2. Monitoring Script
Run the included monitoring script to check your API keys:

```bash
# Check all API keys and their validity
node scripts/monitor-api-keys.js
```

This will show:
- ✅ Valid keys with model count
- ❌ Invalid keys with error messages
- Summary of total keys available

### 3. Real-time Monitoring
To see which key is being used in real-time:

```bash
# Watch server logs for API key usage
tail -f your-app.log | grep "API key"

# Or filter for Google provider logs
tail -f your-app.log | grep "GoogleProvider"
```

### 4. Browser Developer Tools
1. Open browser dev tools (F12)
2. Go to Network tab
3. Make a code generation request
4. Look for requests to `generativelanguage.googleapis.com`
5. Check the `key` parameter in the URL to see which API key was used

## Additional Recommendations

### 1. API Key Management Best Practices
- Use separate projects in Google Cloud Console for each API key
- Enable billing alerts for each project
- Monitor usage in Google Cloud Console

### 2. Quota Monitoring
```bash
# Check current quota usage
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_API_KEY"
```

### 3. Error Handling
The system now handles quota errors more gracefully by:
- Rotating to different API keys
- Providing better error messages
- Continuing operation when some keys hit limits

### 4. Scaling Further
If you need more quota:
- Add more API keys to the comma-separated list
- Consider implementing request queuing
- Use different models with different quota limits

## Monitoring

Watch for these improvements:
- Reduced "quota exceeded" errors
- Better request distribution
- Continued operation during high usage periods

## Troubleshooting

### If you still get quota errors:
1. **Verify API keys are valid**: Test each key individually
2. **Check Google Cloud Console**: Ensure billing is enabled for all projects
3. **Monitor usage**: Check if you're hitting aggregate limits across all keys
4. **Add more keys**: Increase the pool of available API keys

### Common Issues:
- **Invalid API keys**: Remove invalid keys from the comma-separated list
- **Billing not enabled**: Enable billing in Google Cloud Console
- **Regional limits**: Some models have regional restrictions

## Next Steps
1. Update your `.env.local` with multiple API keys
2. Restart the application
3. Test with high-volume requests
4. Monitor quota usage across all keys
5. Add more keys as needed for your usage patterns