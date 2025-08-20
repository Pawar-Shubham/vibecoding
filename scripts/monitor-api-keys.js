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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Key ${keyNumber}: Valid (${data.models?.length || 0} models available)`);
      return { valid: true, models: data.models?.length || 0 };
    } else {
      console.log(`❌ Key ${keyNumber}: Invalid - ${data.error?.message || 'Unknown error'}`);
      return { valid: false, error: data.error?.message };
    }
  } catch (error) {
    console.log(`❌ Key ${keyNumber}: Error - ${error.message}`);
    return { valid: false, error: error.message };
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
  
  // Check chat generation keys
  if (keys.gemini) {
    console.log('🤖 Chat Generation Keys:');
    for (let i = 0; i < keys.gemini.length; i++) {
      await checkApiKey(keys.gemini[i], `Chat ${i + 1}`);
    }
  }
  
  // Check logo generation keys
  if (keys.logo) {
    console.log('\n🎨 Logo Generation Keys:');
    for (let i = 0; i < keys.logo.length; i++) {
      await checkApiKey(keys.logo[i], `Logo ${i + 1}`);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`- Total Chat Keys: ${keys.gemini?.length || 0}`);
  console.log(`- Total Logo Keys: ${keys.logo?.length || 0}`);
  console.log(`- Total Keys: ${(keys.gemini?.length || 0) + (keys.logo?.length || 0)}`);
  
  console.log('\n💡 Tips:');
  console.log('- Check server logs for "Using API key X/Y" messages');
  console.log('- Monitor quota usage in Google Cloud Console');
  console.log('- Keys rotate every minute for chat requests');
  console.log('- Logo requests use random key selection');
}

// Run the monitor
if (require.main === module) {
  monitorApiKeys().catch(console.error);
}

module.exports = { monitorApiKeys, checkApiKey, getApiKeysFromEnv }; 