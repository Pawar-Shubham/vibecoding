# API Key Monitoring Quick Guide

## 🔍 How to Check Which Key is Being Used

### Method 1: Server Logs (Recommended)
```bash
# Start your application and watch the logs
npm run dev

# Look for these log messages:
[GoogleProvider] Using API key 1/3 (AIzaSyD...abcd) for Google provider
[GoogleProvider] Rotated to API key 2/3 for Google provider
[api.logo] Logo generation using API key 2/2 (AIzaSyD...efgh)
```

### Method 2: Monitoring Script
```bash
# Check all your API keys at once
node scripts/monitor-api-keys.js
```

### Method 3: Browser Developer Tools
1. Open Dev Tools (F12)
2. Go to Network tab
3. Generate some code
4. Look for requests to `generativelanguage.googleapis.com`
5. Check the URL parameter `key=...` to see which key was used

### Method 4: Real-time Log Filtering
```bash
# Filter logs for API key usage
tail -f your-app.log | grep "API key"

# Filter for Google provider specifically
tail -f your-app.log | grep "GoogleProvider"
```

## 📊 What You'll See

### Server Logs Show:
- **Proactive Health Check**: `🔍 Proactively checking health of 12 available API keys`
- **Individual Health Check**: `🔍 Health checking API key (AIzaSyD...abcd)`
- **Health Results**: `✅ API key (AIzaSyD...abcd) is healthy` or `⚠️ API key (AIzaSyD...abcd) quota exceeded`
- **Healthy Key Found**: `✅ Found 8 healthy API keys`
- **Key Selection**: `Using healthy API key 3/12 (AIzaSyD...efgh) for Google provider`
- **Pre-validated Usage**: `Attempting content generation with pre-validated healthy API key 3/12`
- **Success**: `✅ Content generation successful with API key 3/12`
- **Fallback (if needed)**: `🔄 Trying reactive failover to other keys...`
- **Key Marking**: `🚫 Marking API key (AIzaSyD...abcd) as failed for 5 minutes`

### Monitoring Script Shows:
```
🔍 Gemini API Key Monitor

📋 Found API Keys:

🤖 Chat Generation Keys (3):
  1. AIzaSyD...abcd
  2. AIzaSyE...efgh
  3. AIzaSyF...ijkl

🎨 Logo Generation Keys (2):
  1. AIzaSyG...mnop
  2. AIzaSyH...qrst

🔍 Checking API Key Validity...

🤖 Chat Generation Keys:
✅ Key Chat 1: Valid & Healthy (15 models available)
⚠️ Key Chat 2: Valid but quota exceeded
❌ Key Chat 3: Invalid API key
✅ Key Chat 4: Valid & Healthy (15 models available)

🎨 Logo Generation Keys:
✅ Key Logo 1: Valid & Healthy (15 models available)
✅ Key Logo 2: Valid & Healthy (15 models available)

📊 Health Summary:
🤖 Chat Keys: 2/4 healthy
   ⚠️ 1 quota exceeded
   ❌ 1 invalid
🎨 Logo Keys: 2/2 healthy

🎯 Overall Health: 4/6 keys are healthy and ready to use
✅ Good: Majority of keys are healthy and ready for use.
```

## 🎯 Key Rotation & Failover Behavior

### Chat Generation (Code Generation):
- **Proactive Health Checking**: Before each request, checks which keys are healthy
- **Smart Key Selection**: Only uses keys that pass health checks
- **Health Caching**: Health checks are cached for 1 minute for performance
- **Automatic Avoidance**: Failed keys are avoided for 5 minutes
- **Fallback Protection**: If pre-validated key fails, falls back to other healthy keys
- **Log Messages**: 
  - `🔍 Proactively checking health of 12 available API keys`
  - `🔍 Health checking API key (AIzaSyD...abcd)`
  - `✅ Found 8 healthy API keys`
  - `Using healthy API key 3/12 (AIzaSyD...efgh) for Google provider`
  - `Attempting content generation with pre-validated healthy API key 3/12`
  - `✅ Content generation successful with API key 3/12`

### Logo Generation:
- **Sequential Failover**: Tries each key in order until one succeeds
- **Pattern**: 1→2→3→... (tries each key until success)
- **Log Messages**:
  - `Attempting logo generation with API key X/Y (AIzaSyD...abcd)`
  - `❌ Logo generation failed with API key X/Y: quota exceeded`
  - `🔄 Falling back to next API key for logo generation...`
  - `✅ Logo generation successful with API key X/Y`

## 🚨 Troubleshooting

### If you don't see rotation logs:
1. **Check if you have multiple keys**: Ensure your `.env.local` has comma-separated keys
2. **Restart the application**: Changes require a restart
3. **Check log level**: Make sure logging is enabled

### If keys aren't rotating:
1. **Wait 60 seconds**: Chat keys only rotate every minute
2. **Make multiple requests**: Logo keys rotate per request
3. **Check key format**: Ensure keys are comma-separated without spaces

### If monitoring script fails:
1. **Check .env.local exists**: Script looks for this file
2. **Verify key format**: Keys should be comma-separated
3. **Check network**: Script needs internet to validate keys

## 📝 Example .env.local Format
```bash
# Multiple keys for chat generation (comma-separated)
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyD...key1,AIzaSyE...key2,AIzaSyF...key3

# Multiple keys for logo generation (comma-separated)
GEMINI_LOGO_CREATOR_API_KEY=AIzaSyG...logo1,AIzaSyH...logo2
```

## 🔄 Expected Behavior

### With Multiple Keys:
- ✅ Keys rotate automatically
- ✅ Quota errors are reduced
- ✅ Better load distribution
- ✅ Continued operation when some keys hit limits

### With Single Key:
- ✅ Works as before
- ✅ No rotation (as expected)
- ✅ Same behavior as original system 