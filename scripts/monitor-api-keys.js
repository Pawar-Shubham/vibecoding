#!/usr/bin/env node

/**
 * API Key Monitoring Script
 * 
 * This script helps you monitor which API keys are being used
 * and track quota usage across multiple keys.
 * 
 * Usage:
 * node scripts/monitor-api-keys.js
 */

const fs = require('fs');
const path = require('path');

// Function to check API key validity and quota
async function checkApiKey(key, keyNumber) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Key ${keyNumber}: Valid & Healthy (${data.models?.length || 0} models available)`);
      return { valid: true, healthy: true, models: data.models?.length || 0 };
    } else {
      if (response.status === 429 || data.error?.message?.includes('quota')) {
        console.log(`⚠️ Key ${keyNumber}: Valid but quota exceeded - ${data.error?.message || 'Unknown quota error'}`);
        return { valid: true, healthy: false, error: 'quota_exceeded', quotaExceeded: true };
      } else if (response.status === 403 || data.error?.message?.includes('invalid')) {
        console.log(`❌ Key ${keyNumber}: Invalid API key - ${data.error?.message || 'Unknown error'}`);
        return { valid: false, healthy: false, error: 'invalid_key' };
      } else {
        console.log(`⚠️ Key ${keyNumber}: Valid but unhealthy - ${data.error?.message || 'Unknown error'}`);
        return { valid: true, healthy: false, error: data.error?.message };
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`⏰ Key ${keyNumber}: Timeout - Health check took too long`);
      return { valid: false, healthy: false, error: 'timeout' };
    }
    console.log(`❌ Key ${keyNumber}: Error - ${error.message}`);
    return { valid: false, healthy: false, error: error.message };
  }
}

// Function to read and parse API keys from .env.local
function getApiKeysFromEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const keys = {};
    
    // Parse GOOGLE_GENERATIVE_AI_API_KEY
    const geminiMatch = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
    if (geminiMatch) {
      keys.gemini = geminiMatch[1].split(',').map(k => k.trim()).filter(k => k);
    }
    
    // Parse GEMINI_LOGO_CREATOR_API_KEY
    const logoMatch = envContent.match(/GEMINI_LOGO_CREATOR_API_KEY=(.+)/);
    if (logoMatch) {
      keys.logo = logoMatch[1].split(',').map(k => k.trim()).filter(k => k);
    }
    
    return keys;
  } catch (error) {
    console.error('Error reading .env.local file:', error.message);
    return {};
  }
}

// Main monitoring function
async function monitorApiKeys() {
  console.log('🔍 Gemini API Key Monitor\n');
  
  const keys = getApiKeysFromEnv();
  
  if (!keys.gemini && !keys.logo) {
    console.log('❌ No API keys found in .env.local file');
    console.log('Make sure you have GOOGLE_GENERATIVE_AI_API_KEY and/or GEMINI_LOGO_CREATOR_API_KEY set');
    return;
  }
  
  console.log('📋 Found API Keys:');
  
  if (keys.gemini) {
    console.log(`\n🤖 Chat Generation Keys (${keys.gemini.length}):`);
    for (let i = 0; i < keys.gemini.length; i++) {
      const key = keys.gemini[i];
      const preview = key.substring(0, 10) + '...' + key.substring(key.length - 4);
      console.log(`  ${i + 1}. ${preview}`);
    }
  }
  
  if (keys.logo) {
    console.log(`\n🎨 Logo Generation Keys (${keys.logo.length}):`);
    for (let i = 0; i < keys.logo.length; i++) {
      const key = keys.logo[i];
      const preview = key.substring(0, 10) + '...' + key.substring(key.length - 4);
      console.log(`  ${i + 1}. ${preview}`);
    }
  }
  
  console.log('\n🔍 Checking API Key Validity...\n');
  
  const chatResults = [];
  const logoResults = [];
  
  // Check chat generation keys
  if (keys.gemini) {
    console.log('🤖 Chat Generation Keys:');
    for (let i = 0; i < keys.gemini.length; i++) {
      const result = await checkApiKey(keys.gemini[i], `Chat ${i + 1}`);
      chatResults.push(result);
    }
  }
  
  // Check logo generation keys
  if (keys.logo) {
    console.log('\n🎨 Logo Generation Keys:');
    for (let i = 0; i < keys.logo.length; i++) {
      const result = await checkApiKey(keys.logo[i], `Logo ${i + 1}`);
      logoResults.push(result);
    }
  }
  
  // Calculate health statistics
  const totalChatKeys = chatResults.length;
  const healthyChatKeys = chatResults.filter(r => r.healthy).length;
  const quotaExceededChatKeys = chatResults.filter(r => r.quotaExceeded).length;
  const invalidChatKeys = chatResults.filter(r => !r.valid).length;
  
  const totalLogoKeys = logoResults.length;
  const healthyLogoKeys = logoResults.filter(r => r.healthy).length;
  const quotaExceededLogoKeys = logoResults.filter(r => r.quotaExceeded).length;
  const invalidLogoKeys = logoResults.filter(r => !r.valid).length;
  
  console.log('\n📊 Health Summary:');
  
  if (totalChatKeys > 0) {
    console.log(`🤖 Chat Keys: ${healthyChatKeys}/${totalChatKeys} healthy`);
    if (quotaExceededChatKeys > 0) console.log(`   ⚠️ ${quotaExceededChatKeys} quota exceeded`);
    if (invalidChatKeys > 0) console.log(`   ❌ ${invalidChatKeys} invalid`);
  }
  
  if (totalLogoKeys > 0) {
    console.log(`🎨 Logo Keys: ${healthyLogoKeys}/${totalLogoKeys} healthy`);
    if (quotaExceededLogoKeys > 0) console.log(`   ⚠️ ${quotaExceededLogoKeys} quota exceeded`);
    if (invalidLogoKeys > 0) console.log(`   ❌ ${invalidLogoKeys} invalid`);
  }
  
  const totalHealthy = healthyChatKeys + healthyLogoKeys;
  const totalKeys = totalChatKeys + totalLogoKeys;
  
  console.log(`\n🎯 Overall Health: ${totalHealthy}/${totalKeys} keys are healthy and ready to use`);
  
  if (totalHealthy === 0) {
    console.log('\n🚨 WARNING: No healthy API keys found! Check your keys and billing.');
  } else if (totalHealthy < totalKeys * 0.5) {
    console.log('\n⚠️ WARNING: Less than 50% of keys are healthy. Consider checking quotas and billing.');
  } else {
    console.log('\n✅ Good: Majority of keys are healthy and ready for use.');
  }
  
  console.log('\n💡 Tips:');
  console.log('- Proactive health checks now prevent using failed keys');
  console.log('- Check server logs for "🔍 Health checking API key" messages');
  console.log('- Monitor quota usage in Google Cloud Console');
  console.log('- Failed keys are automatically avoided for 5 minutes');
  console.log('- Health checks are cached for 1 minute for performance');
}

// Run the monitor
if (require.main === module) {
  monitorApiKeys().catch(console.error);
}

module.exports = { monitorApiKeys, checkApiKey, getApiKeysFromEnv }; 