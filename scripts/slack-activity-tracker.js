#!/usr/bin/env node

/**
 * Slack Activity Tracker for Helen AI
 * Monitors employee online/away status and tracks daily patterns
 * 
 * Usage:
 *   node slack-activity-tracker.js check    # Poll all users now
 *   node slack-activity-tracker.js report   # Show daily summary
 *   node slack-activity-tracker.js users    # List tracked users
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const SENSUS_CONFIG_PATH = path.join(__dirname, '..', 'sensus-config.json');

// Load feature flags
function loadSensusConfig() {
  try {
    return JSON.parse(fs.readFileSync(SENSUS_CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { features: {} };
  }
}

function isFeatureEnabled(feature) {
  const config = loadSensusConfig();
  return config.features && config.features[feature] === true;
}
const DATA_FILE = path.join(process.env.HOME, '.openclaw', 'workspace', 'sensus', 'sensus-data', 'activity-tracker.json');
const HISTORY_DAYS = 30;

// Tracked users with their display names
const TRACKED_USERS = {
  'U07EMF8UVQW': 'Никита Молчанов',
  'U062YPCLRA4': 'Андрей Малышкин',
  'U08MUNM32FN': 'Станислав Москальцов',
  'U0891317R6Z': 'Тимур Насипкереев',
  'U08GGQ01KM5': 'Сергей Артеменко',
  'U0A5TLU5G7P': 'Петр Фадеев',
  'U04UWETBFQW': 'Андрей Шамин (CEO)',
  'U06S83ABVT6': 'Юрий Карпич',
  'U07CVRC5XNZ': 'Евгений Копиленко',
  'U06K09VBGET': 'Полина Вапнярук',
  'U097APSJVAB': 'Erik Kairov',
  'U06RZ073FAA': 'Анна Васильева',
  'U06CTCTPXT8': 'Сергей Сатанин',
  'U09FNLE97R6': 'Полина Нехорошева',
  'U04V2V8LVEF': 'Елена Смольянова'
};

/**
 * Get Slack bot token from environment or config file
 */
function getSlackToken() {
  // First try environment variable
  if (process.env.SLACK_BOT_TOKEN) {
    return process.env.SLACK_BOT_TOKEN;
  }

  try {
    // Read openclaw.json (JSON5 format with unquoted keys)
    const configContent = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8');
    
    // Try parsing as regular JSON first (it might be valid JSON)
    try {
      const config = JSON.parse(configContent);
      const token = config.channels?.slack?.botToken;
      if (token) {
        return token;
      }
    } catch (e) {
      // Not valid JSON, try manual parsing
    }
    
    // Manual parsing for JSON5-style format
    const tokenMatch = configContent.match(/"botToken"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      return tokenMatch[1];
    }

    // Also try without quotes around key
    const tokenMatch2 = configContent.match(/botToken\s*:\s*"([^"]+)"/);
    if (tokenMatch2) {
      return tokenMatch2[1];
    }

    // Fallback: try with json5 if available
    try {
      const JSON5 = require('json5');
      const config = JSON5.parse(configContent);
      return config.channels?.slack?.botToken;
    } catch (e) {
      // json5 not available, continue
    }

    throw new Error('Bot token not found in config');
  } catch (error) {
    console.error('Error reading Slack bot token:', error.message);
    console.error('Make sure SLACK_BOT_TOKEN env var is set or bot token exists in ~/.openclaw/openclaw.json');
    process.exit(1);
  }
}

/**
 * Make HTTP request to Slack API
 */
function slackAPIRequest(endpoint, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'slack.com',
      path: `/api/${endpoint}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(`Slack API error: ${response.error}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Get user presence from Slack API
 */
async function getUserPresence(userId, token) {
  try {
    const response = await slackAPIRequest(`users.getPresence?user=${userId}`, token);
    return {
      userId,
      presence: response.presence, // 'active' or 'away'
      online: response.online || false,
      auto_away: response.auto_away || false,
      manual_away: response.manual_away || false,
      connection_count: response.connection_count || 0,
      last_activity: response.last_activity ? new Date(response.last_activity * 1000) : null,
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`Error getting presence for user ${userId}:`, error.message);
    return {
      userId,
      presence: 'unknown',
      online: false,
      error: error.message,
      timestamp: new Date()
    };
  }
}

/**
 * Load activity data from file
 */
function loadActivityData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        lastCheck: data.lastCheck ? new Date(data.lastCheck) : null,
        history: data.history || {},
        dailyStats: data.dailyStats || {}
      };
    }
  } catch (error) {
    console.error('Error loading activity data:', error.message);
  }

  return {
    lastCheck: null,
    history: {},
    dailyStats: {}
  };
}

/**
 * Save activity data to file
 */
function saveActivityData(data) {
  try {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving activity data:', error.message);
  }
}

/**
 * Get today's date key (YYYY-MM-DD)
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Clean up old data (keep only last 30 days)
 */
function cleanupOldData(data) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - HISTORY_DAYS);
  const cutoffKey = cutoffDate.toISOString().split('T')[0];

  // Clean history
  Object.keys(data.history).forEach(dateKey => {
    if (dateKey < cutoffKey) {
      delete data.history[dateKey];
    }
  });

  // Clean daily stats
  Object.keys(data.dailyStats).forEach(dateKey => {
    if (dateKey < cutoffKey) {
      delete data.dailyStats[dateKey];
    }
  });
}

/**
 * Update daily statistics
 */
function updateDailyStats(data, todayKey, presenceData) {
  if (!data.dailyStats[todayKey]) {
    data.dailyStats[todayKey] = {};
  }

  presenceData.forEach(userPresence => {
    const userId = userPresence.userId;
    if (!data.dailyStats[todayKey][userId]) {
      data.dailyStats[todayKey][userId] = {
        firstSeen: null,
        lastSeen: null,
        totalChecks: 0,
        activeChecks: 0,
        onlineTime: 0
      };
    }

    const userStats = data.dailyStats[todayKey][userId];
    userStats.totalChecks++;

    if (userPresence.presence === 'active') {
      userStats.activeChecks++;
      
      // Estimate online time (10 minutes per active check)
      userStats.onlineTime += 10;
      
      if (!userStats.firstSeen) {
        userStats.firstSeen = userPresence.timestamp;
      }
      userStats.lastSeen = userPresence.timestamp;
    }
  });
}

/**
 * Check all users' presence
 */
async function checkAllUsers() {
  // Check if activity tracker feature is enabled
  if (!isFeatureEnabled('activityTracker')) {
    console.log('Activity tracker feature is disabled');
    return;
  }
  
  console.log('🔍 Checking Slack activity for all tracked users...');
  
  const token = getSlackToken();
  const data = loadActivityData();
  const todayKey = getTodayKey();
  
  // Initialize today's history if needed
  if (!data.history[todayKey]) {
    data.history[todayKey] = [];
  }

  const presencePromises = Object.keys(TRACKED_USERS).map(userId => 
    getUserPresence(userId, token)
  );

  try {
    const presenceData = await Promise.all(presencePromises);
    
    // Store raw presence data
    data.history[todayKey].push({
      timestamp: new Date(),
      users: presenceData
    });

    // Update daily statistics
    updateDailyStats(data, todayKey, presenceData);

    // Update last check time
    data.lastCheck = new Date();

    // Clean up old data
    cleanupOldData(data);

    // Save to file
    saveActivityData(data);

    // Display results
    console.log('\n📊 Current Status:');
    console.log('─'.repeat(60));
    
    presenceData.forEach(user => {
      const name = TRACKED_USERS[user.userId];
      const status = user.presence === 'active' && user.online ? '🟢 Online' : '🔴 Away';
      const connections = user.connection_count ? ` (${user.connection_count} connections)` : '';
      console.log(`${status} ${name}${connections}`);
    });

    console.log(`\n✅ Check completed at ${new Date().toLocaleString()}`);
    console.log(`📁 Data saved to: ${DATA_FILE}`);

  } catch (error) {
    console.error('❌ Error during presence check:', error.message);
  }
}

/**
 * Generate daily report
 */
function generateDailyReport(dateKey = null) {
  const targetDate = dateKey || getTodayKey();
  const data = loadActivityData();
  
  console.log(`📈 Daily Activity Report for ${targetDate}`);
  console.log('═'.repeat(80));
  
  const dayStats = data.dailyStats[targetDate];
  if (!dayStats) {
    console.log('No activity data available for this date.');
    return;
  }

  Object.keys(TRACKED_USERS).forEach(userId => {
    const name = TRACKED_USERS[userId];
    const stats = dayStats[userId];
    
    console.log(`\n👤 ${name} (${userId})`);
    console.log('─'.repeat(50));
    
    if (!stats || stats.totalChecks === 0) {
      console.log('   No activity recorded');
      return;
    }

    const activePercentage = ((stats.activeChecks / stats.totalChecks) * 100).toFixed(1);
    const estimatedHours = (stats.onlineTime / 60).toFixed(1);
    
    console.log(`   📊 Total checks: ${stats.totalChecks}`);
    console.log(`   ✅ Active checks: ${stats.activeChecks} (${activePercentage}%)`);
    console.log(`   ⏰ Estimated online time: ${estimatedHours} hours`);
    
    if (stats.firstSeen) {
      console.log(`   🌅 First seen: ${new Date(stats.firstSeen).toLocaleTimeString()}`);
    }
    if (stats.lastSeen) {
      console.log(`   🌅 Last seen: ${new Date(stats.lastSeen).toLocaleTimeString()}`);
    }
  });

  if (data.lastCheck) {
    console.log(`\n🕒 Last updated: ${data.lastCheck.toLocaleString()}`);
  }
}

/**
 * List all tracked users
 */
function listTrackedUsers() {
  console.log('👥 Tracked Users');
  console.log('═'.repeat(50));
  
  Object.entries(TRACKED_USERS).forEach(([userId, name]) => {
    console.log(`${userId} - ${name}`);
  });
  
  console.log(`\n📊 Total: ${Object.keys(TRACKED_USERS).length} users`);
}

/**
 * Main function
 */
function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'check':
      checkAllUsers();
      break;
      
    case 'report':
      const date = process.argv[3]; // Optional date parameter
      generateDailyReport(date);
      break;
      
    case 'users':
      listTrackedUsers();
      break;
      
    default:
      console.log('Slack Activity Tracker for Helen AI');
      console.log('');
      console.log('Usage:');
      console.log('  node slack-activity-tracker.js check         # Poll all users now');
      console.log('  node slack-activity-tracker.js report [date] # Show daily summary');
      console.log('  node slack-activity-tracker.js users         # List tracked users');
      console.log('');
      console.log('Examples:');
      console.log('  node slack-activity-tracker.js check');
      console.log('  node slack-activity-tracker.js report');
      console.log('  node slack-activity-tracker.js report 2026-03-24');
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkAllUsers,
  generateDailyReport,
  listTrackedUsers,
  loadActivityData,
  saveActivityData
};