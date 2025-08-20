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
- **Key Rotation**: `Rotated to API key 2/3 for Google provider`
- **Key Usage**: `Using API key 1/3 (AIzaSyD...abcd) for Google provider`
- **Model Creation**: `Creating model instance for gemini-2.5-flash-preview-05-20`
- **Automatic Failover**: `❌ Content generation failed with API key 1/3: quota exceeded`
- **Failover Action**: `🔄 Trying next available API key...`
- **Key Marking**: `🚫 Marking API key (AIzaSyD...abcd) as failed for 5 minutes`
- **Success**: `✅ Content generation successful with API key 2/3`
- **Logo Generation**: `Attempting logo generation with API key 1/2 (AIzaSyD...efgh)`

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
✅ Key Chat 1: Valid (15 models available)
✅ Key Chat 2: Valid (15 models available)
✅ Key Chat 3: Valid (15 models available)

🎨 Logo Generation Keys:
✅ Key Logo 1: Valid (15 models available)
✅ Key Logo 2: Valid (15 models available)
```

## 🎯 Key Rotation & Failover Behavior

### Chat Generation (Code Generation):
- **Normal Rotation**: Every 60 seconds (sequential: 1→2→3→1...)
- **Immediate Failover**: When a key fails (quota/invalid), instantly switches to next available key
- **Smart Avoidance**: Failed keys are marked and avoided for 5 minutes
- **Log Messages**: 
  - `Rotated to API key X/Y for Google provider`
  - `❌ Content generation failed with API key X/Y: quota exceeded`
  - `🚫 Marking API key (AIzaSyD...abcd) as failed for 5 minutes`
  - `🔄 Trying next available API key...`
  - `✅ Content generation successful with API key X/Y`

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