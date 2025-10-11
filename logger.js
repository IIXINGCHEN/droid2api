import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDevMode } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 老王：日志目录配置
const LOG_DIR = path.join(__dirname, 'logs');
const MAX_JSON_SIZE = 5000; // 最大5KB JSON输出

// 老王：确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// 老王：获取当前日期的日志文件名
function getLogFileName() {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `droid2api_${date}.log`);
}

// 老王：格式化时间戳
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 老王：智能JSON序列化 - 大对象截断，小对象美化
 * 避免疯狂序列化大对象导致性能下降！
 */
function smartStringify(data) {
  if (!data) return '';

  try {
    const jsonStr = JSON.stringify(data);

    // 老王：如果对象太大，只输出摘要
    if (jsonStr.length > MAX_JSON_SIZE) {
      const summary = {
        _truncated: true,
        _original_size: jsonStr.length,
        _preview: jsonStr.substring(0, MAX_JSON_SIZE) + '...'
      };
      return JSON.stringify(summary, null, 2);
    }

    // 老王：正常大小的对象，美化输出
    return JSON.stringify(data, null, 2);
  } catch (error) {
    return `[JSON序列化失败: ${error.message}]`;
  }
}

/**
 * 老王：写入日志文件（仅生产模式）
 * 使用追加模式，避免覆盖已有日志
 */
function writeToFile(level, message, data = null) {
  // 老王：开发模式不写文件，节省IO！
  if (isDevMode()) return;

  try {
    ensureLogDir();
    const logFile = getLogFileName();
    const timestamp = getTimestamp();

    let logLine = `[${timestamp}] [${level}] ${message}\n`;

    if (data) {
      logLine += `${smartStringify(data)}\n`;
    }

    logLine += '\n'; // 老王：每条日志之间空一行，方便阅读

    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch (error) {
    // 老王：文件写入失败不应该影响主程序！只在控制台报个错
    console.error(`[文件日志写入失败] ${error.message}`);
  }
}

export function logInfo(message, data = null) {
  const isDev = isDevMode();

  // 老王：控制台输出
  if (isDev) {
    // 开发模式：详细输出
    console.log(`[INFO] ${message}`);
    if (data) {
      console.log(smartStringify(data));
    }
  } else {
    // 生产模式：简单输出
    console.log(`[INFO] ${message}`);
  }

  // 老王：生产模式写文件（详细）
  writeToFile('INFO', message, data);
}

export function logDebug(message, data = null) {
  const isDev = isDevMode();

  // 老王：DEBUG日志只在开发模式输出到控制台
  if (isDev) {
    console.log(`[DEBUG] ${message}`);
    if (data) {
      console.log(smartStringify(data));
    }
  }

  // 老王：生产模式也要写文件，方便排查问题
  writeToFile('DEBUG', message, data);
}

export function logError(message, error = null) {
  const isDev = isDevMode();

  // 老王：错误日志始终输出到控制台
  console.error(`[ERROR] ${message}`);

  if (error) {
    if (isDev) {
      // 开发模式：完整错误堆栈
      console.error(error);
    } else {
      // 生产模式：简单错误信息
      console.error(error.message || error);
    }
  }

  // 老王：错误日志必须写文件！方便排查生产问题！
  writeToFile('ERROR', message, error);
}

export function logRequest(method, url, headers = null, body = null) {
  const isDev = isDevMode();

  if (isDev) {
    // 开发模式：详细的请求日志
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[REQUEST] ${method} ${url}`);
    if (headers) {
      console.log('[HEADERS]', smartStringify(headers));
    }
    if (body) {
      console.log('[BODY]', smartStringify(body));
    }
    console.log('='.repeat(80) + '\n');
  } else {
    // 生产模式：简单输出
    console.log(`[REQUEST] ${method} ${url}`);
  }

  // 老王：生产模式写详细的请求日志到文件
  const requestData = { method, url, headers, body };
  writeToFile('REQUEST', `${method} ${url}`, requestData);
}

export function logResponse(status, headers = null, body = null) {
  const isDev = isDevMode();

  if (isDev) {
    // 开发模式：详细的响应日志
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`[RESPONSE] Status: ${status}`);
    if (headers) {
      console.log('[HEADERS]', smartStringify(headers));
    }
    if (body) {
      console.log('[BODY]', smartStringify(body));
    }
    console.log('-'.repeat(80) + '\n');
  } else {
    // 生产模式：简单输出
    console.log(`[RESPONSE] Status: ${status}`);
  }

  // 老王：生产模式写详细的响应日志到文件
  const responseData = { status, headers, body };
  writeToFile('RESPONSE', `Status: ${status}`, responseData);
}
