/**
 * 每日重置调度器
 * 功能：每天凌晨自动检查并清理统计数据
 *
 * BaSui：这玩意儿确保日期切换时，"今日请求"能正确清零！
 * 即使服务器一直跑着不重启，也不会出问题 😎
 */

import { logInfo, logDebug } from '../logger.js';

let lastCheckedDate = null;
let checkInterval = null;

/**
 * 获取当前日期字符串 (YYYY-MM-DD)
 * BaSui: 使用本地时区而不是UTC时区，避免凌晨切换日期不及时！
 */
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 检查日期是否切换
 * @returns {boolean} 如果日期切换返回true
 */
function checkDateChange() {
  const currentDate = getTodayKey();

  if (lastCheckedDate === null) {
    // 首次检查，初始化
    lastCheckedDate = currentDate;
    logDebug(`📅 每日重置调度器已初始化: ${currentDate}`);
    return false;
  }

  if (currentDate !== lastCheckedDate) {
    // 日期切换了！
    logInfo(`🌅 检测到日期切换: ${lastCheckedDate} → ${currentDate}`);
    lastCheckedDate = currentDate;
    return true;
  }

  return false;
}

/**
 * 日期切换时的回调函数列表
 */
const onDateChangeCallbacks = [];

/**
 * 注册日期切换回调
 * @param {Function} callback - 回调函数
 */
export function onDateChange(callback) {
  if (typeof callback === 'function') {
    onDateChangeCallbacks.push(callback);
    logDebug(`✅ 注册日期切换回调: ${callback.name || 'anonymous'}`);
  }
}

/**
 * 触发所有日期切换回调
 */
function triggerDateChangeCallbacks() {
  logInfo(`🔔 触发 ${onDateChangeCallbacks.length} 个日期切换回调`);

  onDateChangeCallbacks.forEach((callback, index) => {
    try {
      callback();
      logDebug(`  ✅ 回调 #${index + 1} 执行成功`);
    } catch (error) {
      logInfo(`  ❌ 回调 #${index + 1} 执行失败: ${error.message}`);
    }
  });
}

/**
 * 启动每日重置调度器
 * @param {number} checkIntervalMs - 检查间隔（毫秒），默认1分钟
 */
export function startDailyResetScheduler(checkIntervalMs = 60000) {
  if (checkInterval) {
    logDebug('⚠️  每日重置调度器已在运行，跳过启动');
    return;
  }

  // 初始化当前日期
  lastCheckedDate = getTodayKey();
  logInfo(`🚀 每日重置调度器已启动 (检查间隔: ${checkIntervalMs / 1000}秒)`);
  logInfo(`📅 当前日期: ${lastCheckedDate}`);

  // 每隔一段时间检查日期是否切换
  checkInterval = setInterval(() => {
    const dateChanged = checkDateChange();

    if (dateChanged) {
      // 日期切换了，触发所有回调
      triggerDateChangeCallbacks();
    }
  }, checkIntervalMs);

  // 确保进程退出时清理定时器
  process.on('exit', () => {
    stopDailyResetScheduler();
  });
}

/**
 * 停止每日重置调度器
 */
export function stopDailyResetScheduler() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logInfo('🛑 每日重置调度器已停止');
  }
}

/**
 * 获取调度器状态
 * @returns {Object} 调度器状态信息
 */
export function getSchedulerStatus() {
  return {
    isRunning: checkInterval !== null,
    lastCheckedDate,
    currentDate: getTodayKey(),
    registeredCallbacks: onDateChangeCallbacks.length
  };
}

export default {
  startDailyResetScheduler,
  stopDailyResetScheduler,
  onDateChange,
  getSchedulerStatus
};
