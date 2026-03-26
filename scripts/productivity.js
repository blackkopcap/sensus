#!/usr/bin/env node
/**
 * Productivity Tracker — Monitor Helen's optimal work periods
 * 
 * Tracks when Helen is most creative, analytical, focused
 * to optimize task timing and energy management.
 * 
 * Usage:
 *   node productivity.js log --type <creative|analytical|focused> --quality <1-10>
 *   node productivity.js report [--days 7]
 *   node productivity.js optimal --task-type <creative|analytical|focused>
 */

const fs = require('fs');
const path = require('path');

const PRODUCTIVITY_FILE = path.join(process.cwd(), 'sensus-data', 'productivity-log.json');

// Initialize empty log if file doesn't exist
function ensureProductivityLog() {
  if (!fs.existsSync(PRODUCTIVITY_FILE)) {
    const initialData = {
      sessions: [],
      stats: {
        creative_peak_hours: [],
        analytical_peak_hours: [],
        focus_peak_hours: []
      }
    };
    fs.writeFileSync(PRODUCTIVITY_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Log a productivity session
function logSession(type, quality, context = null) {
  ensureProductivityLog();
  const data = JSON.parse(fs.readFileSync(PRODUCTIVITY_FILE, 'utf8'));
  
  const session = {
    timestamp: new Date().toISOString(),
    hour: new Date().getHours(),
    type: type, // creative, analytical, focused
    quality: quality, // 1-10 scale
    context: context,
    mood: getCurrentMood(),
    energy: getCurrentEnergy()
  };
  
  data.sessions.push(session);
  
  // Keep only last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  data.sessions = data.sessions.filter(s => new Date(s.timestamp) > thirtyDaysAgo);
  
  fs.writeFileSync(PRODUCTIVITY_FILE, JSON.stringify(data, null, 2));
  console.log(`📊 Logged ${type} session: quality ${quality}/10`);
}

// Get current mood/energy from Sensus
function getCurrentMood() {
  try {
    const { execSync } = require('child_process');
    const result = execSync('node sensus.js read --format json', { cwd: __dirname, encoding: 'utf8' });
    const sensus = JSON.parse(result);
    return sensus.derived?.values?.mood || 0;
  } catch (e) {
    return 0;
  }
}

function getCurrentEnergy() {
  try {
    const { execSync } = require('child_process');
    const result = execSync('node sensus.js read --format json', { cwd: __dirname, encoding: 'utf8' });
    const sensus = JSON.parse(result);
    return sensus.derived?.values?.energy || 0;
  } catch (e) {
    return 0;
  }
}

// Generate productivity report
function generateReport(days = 7) {
  ensureProductivityLog();
  const data = JSON.parse(fs.readFileSync(PRODUCTIVITY_FILE, 'utf8'));
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const recentSessions = data.sessions.filter(s => new Date(s.timestamp) > cutoff);
  
  if (recentSessions.length === 0) {
    console.log(`📊 No productivity data for last ${days} days`);
    return;
  }
  
  // Analyze by type and hour
  const byType = {};
  const byHour = {};
  
  recentSessions.forEach(s => {
    if (!byType[s.type]) byType[s.type] = [];
    if (!byHour[s.hour]) byHour[s.hour] = [];
    
    byType[s.type].push(s);
    byHour[s.hour].push(s);
  });
  
  console.log(`📊 Productivity Report (last ${days} days)`);
  console.log(`Total sessions: ${recentSessions.length}\n`);
  
  // Best types
  Object.keys(byType).forEach(type => {
    const sessions = byType[type];
    const avgQuality = sessions.reduce((sum, s) => sum + s.quality, 0) / sessions.length;
    console.log(`${type.toUpperCase()}: ${sessions.length} sessions, avg quality: ${avgQuality.toFixed(1)}/10`);
  });
  
  console.log();
  
  // Best hours
  const hourQuality = {};
  Object.keys(byHour).forEach(hour => {
    const sessions = byHour[hour];
    hourQuality[hour] = sessions.reduce((sum, s) => sum + s.quality, 0) / sessions.length;
  });
  
  const sortedHours = Object.entries(hourQuality)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
    
  console.log('🌟 Top productive hours:');
  sortedHours.forEach(([hour, quality]) => {
    console.log(`  ${hour}:00 - ${quality.toFixed(1)}/10`);
  });
}

// Find optimal time for task type
function findOptimalTime(taskType) {
  ensureProductivityLog();
  const data = JSON.parse(fs.readFileSync(PRODUCTIVITY_FILE, 'utf8'));
  
  const typeSessions = data.sessions.filter(s => s.type === taskType);
  
  if (typeSessions.length === 0) {
    console.log(`📊 No data for ${taskType} tasks`);
    return;
  }
  
  const hourQuality = {};
  typeSessions.forEach(s => {
    if (!hourQuality[s.hour]) hourQuality[s.hour] = [];
    hourQuality[s.hour].push(s.quality);
  });
  
  const avgHourQuality = {};
  Object.keys(hourQuality).forEach(hour => {
    const qualities = hourQuality[hour];
    avgHourQuality[hour] = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
  });
  
  const bestHour = Object.entries(avgHourQuality)
    .sort(([,a], [,b]) => b - a)[0];
    
  if (bestHour) {
    console.log(`🌟 Optimal time for ${taskType}: ${bestHour[0]}:00 (quality: ${bestHour[1].toFixed(1)}/10)`);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (command === 'log') {
  const type = args[args.indexOf('--type') + 1];
  const quality = parseInt(args[args.indexOf('--quality') + 1]);
  const contextIndex = args.indexOf('--context');
  const context = contextIndex !== -1 ? args[contextIndex + 1] : null;
  
  if (!type || !quality) {
    console.error('Usage: node productivity.js log --type <creative|analytical|focused> --quality <1-10>');
    process.exit(1);
  }
  
  logSession(type, quality, context);
  
} else if (command === 'report') {
  const daysIndex = args.indexOf('--days');
  const days = daysIndex !== -1 ? parseInt(args[daysIndex + 1]) : 7;
  generateReport(days);
  
} else if (command === 'optimal') {
  const taskType = args[args.indexOf('--task-type') + 1];
  if (!taskType) {
    console.error('Usage: node productivity.js optimal --task-type <creative|analytical|focused>');
    process.exit(1);
  }
  findOptimalTime(taskType);
  
} else {
  console.log(`Usage:
  node productivity.js log --type <creative|analytical|focused> --quality <1-10>
  node productivity.js report [--days 7] 
  node productivity.js optimal --task-type <creative|analytical|focused>`);
}