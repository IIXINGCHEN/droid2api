import https from 'https';
import { logInfo, logError } from './logger.js';
import { getConfig } from './config.js';

const VERSION_URL = 'https://downloads.factory.ai/factory-cli/LATEST';
const USER_AGENT_PREFIX = 'factory-cli';
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const RETRY_INTERVAL = 60 * 1000; // 1 minute
const MAX_RETRIES = 3;

let currentVersion = null;
let isUpdating = false;

function getDefaultVersion() {
  const cfg = getConfig();
  const userAgent = cfg.user_agent || 'factory-cli/0.19.3';
  const match = userAgent.match(/\/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '0.19.3';
}

function initializeVersion() {
  if (currentVersion === null) {
    currentVersion = getDefaultVersion();
  }
}

export function getCurrentUserAgent() {
  initializeVersion();
  return `${USER_AGENT_PREFIX}/${currentVersion}`;
}

function fetchLatestVersion() {
  return new Promise((resolve, reject) => {
    const request = https.get(VERSION_URL, (res) => {
      let data = '';

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const version = data.trim();
        if (version && /^\d+\.\d+\.\d+/.test(version)) {
          resolve(version);
        } else {
          reject(new Error(`Invalid version format: ${version}`));
        }
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function updateVersionWithRetry(retryCount = 0) {
  if (isUpdating) {
    return;
  }

  isUpdating = true;

  try {
    const version = await fetchLatestVersion();
    if (version !== currentVersion) {
      const oldVersion = currentVersion;
      currentVersion = version;
      logInfo(`User-Agent version updated: ${oldVersion} -> ${currentVersion}`);
    } else {
      logInfo(`User-Agent version is up to date: ${currentVersion}`);
    }
    isUpdating = false;
  } catch (error) {
    logError(`Failed to fetch latest version (attempt ${retryCount + 1}/${MAX_RETRIES})`, error);

    if (retryCount < MAX_RETRIES - 1) {
      logInfo(`Retrying in 1 minute...`);
      setTimeout(() => {
        updateVersionWithRetry(retryCount + 1);
      }, RETRY_INTERVAL);
    } else {
      logError(`Max retries reached. Will try again in next hourly check.`);
      isUpdating = false;
    }
  }
}

export function initializeUserAgentUpdater() {
  initializeVersion();
  logInfo('Initializing User-Agent version updater...');
  logInfo(`Default User-Agent from config: ${USER_AGENT_PREFIX}/${currentVersion}`);

  // Fetch immediately on startup
  updateVersionWithRetry();

  // Schedule hourly checks
  setInterval(() => {
    logInfo('Running scheduled User-Agent version check...');
    updateVersionWithRetry();
  }, CHECK_INTERVAL);

  logInfo(`User-Agent updater initialized. Will check every hour.`);
}
