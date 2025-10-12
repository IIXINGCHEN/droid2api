/**
 * Token 统计自动同步调度器
 * BaSui: 定期查询 Factory API，同步真实的 Token 使用量
 * 帮助发现本地统计与服务商的差异
 */

import { logInfo, logDebug, logError, logWarn } from '../logger.js';
import { fetchTokenUsage } from './factory-api-client.js';
import keyPoolManager from '../auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYNC_DATA_FILE = path.join(__dirname, '..', 'data', 'token_usage.json');
const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 分钟
const MIN_SYNC_INTERVAL = 1 * 60 * 1000; // 最小 1 分钟
const MAX_SYNC_INTERVAL = 60 * 60 * 1000; // 最大 1 小时

let syncIntervalId = null;
let syncInProgress = false;
let lastSyncTime = null;
let syncStats = {
  totalSyncs: 0,
  successfulSyncs: 0,
  failedSyncs: 0,
  lastError: null
};

/**
 * 加载缓存的 Token 使用量数据
 * @returns {Object}
 */
function loadSyncData() {
  try {
    if (!fs.existsSync(SYNC_DATA_FILE)) {
      return { keys: {} };
    }
    const data = fs.readFileSync(SYNC_DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logError('加载 Token 使用量缓存失败', error);
    return { keys: {} };
  }
}

/**
 * 保存 Token 使用量数据到缓存
 * @param {Object} data
 */
function saveSyncData(data) {
  try {
    const dataDir = path.dirname(SYNC_DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SYNC_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logDebug('Token 使用量缓存已保存');
  } catch (error) {
    logError('保存 Token 使用量缓存失败', error);
  }
}

/**
 * 执行一次 Token 同步（查询 Factory API）
 * @returns {Promise<Object>} 同步结果
 */
async function performSync() {
  if (syncInProgress) {
    logDebug('Token 同步已在进行中，跳过此次同步');
    return { skipped: true };
  }

  syncInProgress = true;
  syncStats.totalSyncs++;

  try {
    logInfo('🔄 开始同步 Factory API Token 使用量...');

    // 获取所有活跃密钥
    const allKeys = keyPoolManager.getKeys();
    const activeKeys = allKeys.filter(k => k.status === 'active');

    if (activeKeys.length === 0) {
      logWarn('⚠️ 没有活跃密钥，跳过同步');
      return { skipped: true, reason: 'no_active_keys' };
    }

    logDebug(`查询 ${activeKeys.length} 个活跃密钥的 Token 使用量`);

    // 加载现有缓存
    const syncData = loadSyncData();

    // 查询所有活跃密钥（限制并发数）
    let successCount = 0;
    let failCount = 0;

    for (const keyObj of activeKeys) {
      try {
        const usage = await fetchTokenUsage(keyObj.key, { timeout: 10000 });

        if (usage.success) {
          syncData.keys[keyObj.id] = {
            ...usage,
            last_sync: new Date().toISOString()
          };
          successCount++;
          logDebug(`✅ 密钥 ${keyObj.id.substring(0, 20)}... 同步成功`);
        } else {
          failCount++;
          logWarn(`⚠️ 密钥 ${keyObj.id.substring(0, 20)}... 查询失败: ${usage.message}`);

          // 保留失败信息
          syncData.keys[keyObj.id] = {
            ...usage,
            last_sync: new Date().toISOString()
          };
        }
      } catch (error) {
        failCount++;
        logError(`❌ 密钥 ${keyObj.id.substring(0, 20)}... 查询异常`, error);

        // 记录错误
        syncData.keys[keyObj.id] = {
          success: false,
          error: 'exception',
          message: error.message,
          last_sync: new Date().toISOString()
        };
      }

      // 避免触发速率限制，每个密钥间隔 200ms
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 保存到缓存
    saveSyncData(syncData);

    lastSyncTime = new Date();
    syncStats.successfulSyncs++;

    logInfo(`✅ Token 同步完成: ${successCount} 成功, ${failCount} 失败`);

    return {
      success: true,
      successCount,
      failCount,
      totalKeys: activeKeys.length,
      syncTime: lastSyncTime.toISOString()
    };

  } catch (error) {
    syncStats.failedSyncs++;
    syncStats.lastError = error.message;
    logError('❌ Token 同步失败', error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    syncInProgress = false;
  }
}

/**
 * 启动 Token 自动同步调度器
 * @param {Object} options
 * @param {number} options.intervalMs - 同步间隔（毫秒）
 * @param {boolean} options.immediate - 是否立即执行一次同步
 * @returns {boolean} 是否启动成功
 */
export function startTokenSyncScheduler(options = {}) {
  const {
    intervalMs = DEFAULT_SYNC_INTERVAL,
    immediate = true
  } = options;

  // 验证间隔时间
  if (intervalMs < MIN_SYNC_INTERVAL || intervalMs > MAX_SYNC_INTERVAL) {
    logWarn(`⚠️ Token 同步间隔必须在 ${MIN_SYNC_INTERVAL / 1000}s 到 ${MAX_SYNC_INTERVAL / 1000}s 之间，使用默认值 ${DEFAULT_SYNC_INTERVAL / 1000}s`);
    return startTokenSyncScheduler({ ...options, intervalMs: DEFAULT_SYNC_INTERVAL });
  }

  // 如果已经启动，先停止
  if (syncIntervalId) {
    logWarn('Token 同步调度器已在运行，先停止旧的调度器');
    stopTokenSyncScheduler();
  }

  logInfo(`🚀 启动 Token 自动同步调度器，间隔: ${intervalMs / 1000}s (${Math.floor(intervalMs / 60000)} 分钟)`);

  // 立即执行一次同步
  if (immediate) {
    performSync().catch(error => {
      logError('初始 Token 同步失败', error);
    });
  }

  // 设置定时器
  syncIntervalId = setInterval(() => {
    performSync().catch(error => {
      logError('定时 Token 同步失败', error);
    });
  }, intervalMs);

  return true;
}

/**
 * 停止 Token 自动同步调度器
 */
export function stopTokenSyncScheduler() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    logInfo('🛑 Token 自动同步调度器已停止');
    return true;
  }
  return false;
}

/**
 * 手动触发一次同步（无论调度器是否启动）
 * @returns {Promise<Object>} 同步结果
 */
export async function triggerManualSync() {
  logInfo('🔄 手动触发 Token 同步...');
  return await performSync();
}

/**
 * 获取同步状态信息
 * @returns {Object}
 */
export function getSyncStatus() {
  return {
    isRunning: syncIntervalId !== null,
    inProgress: syncInProgress,
    lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
    stats: { ...syncStats }
  };
}

/**
 * 获取缓存的 Token 使用量数据
 * @param {string} keyId - 密钥 ID（可选）
 * @returns {Object}
 */
export function getCachedTokenUsage(keyId = null) {
  const syncData = loadSyncData();

  if (keyId) {
    return syncData.keys[keyId] || null;
  }

  return syncData;
}

export default {
  startTokenSyncScheduler,
  stopTokenSyncScheduler,
  triggerManualSync,
  getSyncStatus,
  getCachedTokenUsage
};
