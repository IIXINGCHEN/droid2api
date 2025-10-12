/**
 * 日志收集中间件 - 实时日志推送系统
 *
 * @author BaSui
 * @description 拦截所有请求和响应，收集日志并推送到SSE客户端
 */

import { EventEmitter } from 'events';

// 全局日志事件发射器（单例）
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50); // 支持最多50个并发SSE连接

// 日志缓冲区（最多保存最近500条日志）
const LOG_BUFFER = [];
const MAX_BUFFER_SIZE = 500;

/**
 * 添加日志到缓冲区
 */
function addLogToBuffer(logEntry) {
  LOG_BUFFER.push(logEntry);

  // 超过最大容量，删除最旧的日志
  if (LOG_BUFFER.length > MAX_BUFFER_SIZE) {
    LOG_BUFFER.shift();
  }

  // 发射日志事件（推送给所有SSE客户端）
  logEmitter.emit('log', logEntry);
}

/**
 * 获取缓冲区中的历史日志
 */
export function getLogBuffer(limit = 100) {
  return LOG_BUFFER.slice(-limit); // 返回最近的N条日志
}

/**
 * 清空日志缓冲区
 */
export function clearLogBuffer() {
  LOG_BUFFER.length = 0;
}

/**
 * 格式化时间戳
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 智能截断大对象（避免日志太长）
 */
function truncateData(data, maxLength = 500) {
  if (!data) return null;

  try {
    const jsonStr = JSON.stringify(data);
    if (jsonStr.length > maxLength) {
      return jsonStr.substring(0, maxLength) + '... (truncated)';
    }
    return jsonStr;
  } catch (error) {
    return '[JSON序列化失败]';
  }
}

/**
 * 日志收集中间件 - 记录请求信息
 */
export function logCollectorMiddleware(req, res, next) {
  const startTime = Date.now();
  const timestamp = getTimestamp();

  // 🔍 记录请求日志
  const requestLog = {
    type: 'request',
    level: 'info',
    timestamp,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined,
      'x-api-key': req.headers['x-api-key'] ? '[REDACTED]' : undefined,
    },
    body: req.method !== 'GET' ? truncateData(req.body, 300) : undefined,
  };

  addLogToBuffer(requestLog);

  // 🎯 拦截响应（记录响应日志）
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data) {
    const duration = Date.now() - startTime;

    // 📊 记录响应日志
    const responseLog = {
      type: 'response',
      level: res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info',
      timestamp: getTimestamp(),
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      body: truncateData(data, 300),
    };

    addLogToBuffer(responseLog);

    // 调用原始send方法
    return originalSend.call(this, data);
  };

  res.json = function(data) {
    const duration = Date.now() - startTime;

    // 📊 记录响应日志
    const responseLog = {
      type: 'response',
      level: res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info',
      timestamp: getTimestamp(),
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      body: truncateData(data, 300),
    };

    addLogToBuffer(responseLog);

    // 调用原始json方法
    return originalJson.call(this, data);
  };

  next();
}

/**
 * 手动记录日志（供其他模块调用）
 */
export function logMessage(level, message, data = null) {
  const logEntry = {
    type: 'message',
    level,
    timestamp: getTimestamp(),
    message,
    data: truncateData(data, 500),
  };

  addLogToBuffer(logEntry);
}

/**
 * 记录错误日志
 */
export function logError(message, error = null) {
  const logEntry = {
    type: 'error',
    level: 'error',
    timestamp: getTimestamp(),
    message,
    error: error ? {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // 只保留前3行堆栈
    } : null,
  };

  addLogToBuffer(logEntry);
}

console.log('✅ 日志收集中间件已加载 - BaSui');
