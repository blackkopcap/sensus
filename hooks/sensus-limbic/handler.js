#!/usr/bin/env node
/**
 * Sensus Limbic Hook Handler
 * 
 * Automatically analyzes incoming messages through the Sensus limbic system.
 * Runs as fire-and-forget to avoid blocking the main message flow.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Paths
const SENSUS_ROOT = path.resolve(__dirname, '..', '..');
const LIMBIC_SCRIPT = path.join(SENSUS_ROOT, 'scripts', 'limbic.js');

function log(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] sensus-limbic: ${message}`;
  
  if (error) {
    console.error(logEntry, error);
  } else {
    console.log(logEntry);
  }
}

function extractMessageText(event) {
  // Try various message formats
  if (typeof event.text === 'string' && event.text.trim()) {
    return event.text.trim();
  }
  
  if (typeof event.content === 'string' && event.content.trim()) {
    return event.content.trim();
  }
  
  if (typeof event.message === 'string' && event.message.trim()) {
    return event.message.trim();
  }
  
  if (event.data && typeof event.data.text === 'string' && event.data.text.trim()) {
    return event.data.text.trim();
  }
  
  return null;
}

function extractUserId(event) {
  // Try various user ID formats
  if (event.userId) return event.userId;
  if (event.user_id) return event.user_id;
  if (event.from && event.from.id) return event.from.id;
  if (event.author && event.author.id) return event.author.id;
  if (event.data && event.data.userId) return event.data.userId;
  if (event.data && event.data.user_id) return event.data.user_id;
  
  return null;
}

function extractChannelInfo(event) {
  // Extract channel/platform info for reaction support
  const channelId = event.channelId || event.channel_id || event.data?.channelId;
  const messageId = event.messageId || event.message_id || event.data?.messageId || event.id;
  const platform = event.platform || event.data?.platform;
  
  return { channelId, messageId, platform };
}

function analyzeReactionPreference(messageText, userId) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(LIMBIC_SCRIPT)) {
      return reject(new Error(`Limbic script not found: ${LIMBIC_SCRIPT}`));
    }
    
    const args = ['reaction-preference', messageText];
    if (userId) {
      args.push('--user', userId);
    }
    
    log('debug', `Analyzing reaction preference for: "${messageText.slice(0, 50)}..."`);
    
    const child = spawn('node', [LIMBIC_SCRIPT, ...args], {
      cwd: SENSUS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Reaction analysis failed with code ${code}: ${stderr}`));
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse reaction analysis result: ${error.message}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

function analyzeLimbic(messageText, userId) {
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!messageText || messageText.length === 0) {
      return reject(new Error('Empty message text'));
    }
    
    if (!fs.existsSync(LIMBIC_SCRIPT)) {
      return reject(new Error(`Limbic script not found: ${LIMBIC_SCRIPT}`));
    }
    
    // Build command arguments
    const args = ['analyze', messageText];
    if (userId) {
      args.push('--user', userId);
    }
    
    log('debug', `Analyzing message: "${messageText.slice(0, 50)}..." for user: ${userId || 'default'}`);
    
    // Spawn detached process (fire-and-forget)
    const child = spawn('node', [LIMBIC_SCRIPT, ...args], {
      cwd: SENSUS_ROOT,
      detached: true,
      stdio: 'ignore', // Ignore stdout/stderr to avoid blocking
      env: process.env
    });
    
    // Detach from parent process
    child.unref();
    
    // Handle process events
    child.on('spawn', () => {
      log('debug', `Limbic analysis spawned (PID: ${child.pid})`);
      resolve(child.pid);
    });
    
    child.on('error', (error) => {
      log('error', 'Failed to spawn limbic analysis', error);
      reject(error);
    });
    
    // Set timeout for spawn
    const spawnTimeout = setTimeout(() => {
      log('warn', 'Limbic analysis spawn timeout');
      reject(new Error('Spawn timeout'));
    }, 5000);
    
    child.on('spawn', () => {
      clearTimeout(spawnTimeout);
    });
  });
}

async function handleMessage(event) {
  try {
    // Extract message components
    const messageText = extractMessageText(event);
    if (!messageText) {
      log('debug', 'No text found in message event, skipping');
      return;
    }
    
    const userId = extractUserId(event);
    const channelInfo = extractChannelInfo(event);
    
    // Skip very short messages (likely bot commands or noise)
    if (messageText.length < 3) {
      log('debug', 'Message too short, skipping analysis');
      return;
    }
    
    // Skip messages that look like bot commands
    if (messageText.startsWith('/') || messageText.startsWith('!')) {
      log('debug', 'Bot command detected, skipping analysis');
      return;
    }
    
    // Analyze through limbic system (fire-and-forget)
    analyzeLimbic(messageText, userId).then((pid) => {
      log('info', `Started limbic analysis (PID: ${pid}) for ${userId || 'default'}`);
    }).catch((error) => {
      log('error', 'Limbic analysis failed', error);
    });
    
    // Analyze reaction preference
    try {
      const reactionAnalysis = await analyzeReactionPreference(messageText, userId);
      
      if (reactionAnalysis.ok && reactionAnalysis.preference) {
        const { shouldReact, shouldReply, reactionHint } = reactionAnalysis.preference;
        
        // Output reaction recommendation for main agent
        const recommendation = {
          type: 'sensus-reaction-recommendation',
          channelInfo,
          userId,
          messageText: messageText.slice(0, 100),
          shouldReact,
          shouldReply,
          reactionHint,
          agentState: reactionAnalysis.agentState
        };
        
        // Write recommendation to stdout for main agent
        console.log(JSON.stringify(recommendation, null, 2));
        log('info', `Reaction recommendation: react=${shouldReact}, reply=${shouldReply}, hint="${reactionHint}"`);
      }
      
    } catch (error) {
      log('error', 'Reaction preference analysis failed', error);
      // Continue with normal flow
    }
    
  } catch (error) {
    log('error', 'Hook handler error', error);
    // Don't throw - we don't want to break the main flow
  }
}

// Main entry point
if (require.main === module) {
  // Read event from stdin
  let eventData = '';
  
  process.stdin.on('data', (chunk) => {
    eventData += chunk.toString();
  });
  
  process.stdin.on('end', async () => {
    try {
      if (!eventData.trim()) {
        log('warn', 'No event data received');
        process.exit(1);
      }
      
      const event = JSON.parse(eventData);
      log('debug', `Received event: ${event.type || 'unknown'}`);
      
      if (event.type === 'message:incoming') {
        await handleMessage(event);
        log('info', 'Hook processing complete');
        process.exit(0);
      } else {
        log('debug', `Ignoring event type: ${event.type}`);
        process.exit(0);
      }
      
    } catch (error) {
      log('error', 'Failed to process event', error);
      process.exit(1);
    }
  });
  
  // Handle timeout
  setTimeout(() => {
    log('error', 'Hook timeout - no event data received');
    process.exit(1);
  }, 10000);
}

module.exports = { handleMessage, analyzeLimbic, extractMessageText, extractUserId };