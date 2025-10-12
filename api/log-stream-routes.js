/**
 * 实时日志流路由 - SSE (Server-Sent Events)
 *
 * @author BaSui
 * @description 提供实时日志推送API，支持日志筛选和历史查询
 */

import { Router } from 'express';
import { logEmitter, getLogBuffer, clearLogBuffer } from '../middleware/log-collector.js';

const router = Router();

/**
 * SSE 日志流端点
 * GET /admin/logs/stream
 *
 * 查询参数：
 * - level: 日志级别筛选（info/warn/error/debug，多个用逗号分隔）
 * - keyword: 关键词筛选（模糊匹配URL、消息内容）
 */
router.get('/logs/stream', (req, res) => {
  // 🔒 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx兼容

  // 📋 获取筛选参数
  const levelFilter = req.query.level ? req.query.level.split(',') : null;
  const keywordFilter = req.query.keyword ? req.query.keyword.toLowerCase() : null;

  console.log(`[SSE] 新客户端连接 - IP: ${req.ip}, 筛选: level=${levelFilter}, keyword=${keywordFilter}`);

  /**
   * 日志筛选函数
   */
  function shouldSendLog(logEntry) {
    // 级别筛选
    if (levelFilter && !levelFilter.includes(logEntry.level)) {
      return false;
    }

    // 关键词筛选
    if (keywordFilter) {
      const searchableText = JSON.stringify(logEntry).toLowerCase();
      if (!searchableText.includes(keywordFilter)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 发送SSE事件
   */
  function sendSSE(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * 发送心跳包（每30秒）
   */
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  /**
   * 日志监听器
   */
  const logListener = (logEntry) => {
    if (shouldSendLog(logEntry)) {
      sendSSE(logEntry);
    }
  };

  // 🎯 注册日志监听器
  logEmitter.on('log', logListener);

  // 📦 发送历史日志（最近100条）
  const historyLogs = getLogBuffer(100).filter(shouldSendLog);
  if (historyLogs.length > 0) {
    sendSSE({
      type: 'history',
      timestamp: new Date().toISOString(),
      logs: historyLogs,
    });
  }

  // 🔌 客户端断开连接时清理
  req.on('close', () => {
    console.log(`[SSE] 客户端断开连接 - IP: ${req.ip}`);
    clearInterval(heartbeatInterval);
    logEmitter.removeListener('log', logListener);
  });
});

/**
 * 获取历史日志
 * GET /admin/logs/history?limit=100&level=error&keyword=test
 */
router.get('/logs/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const levelFilter = req.query.level ? req.query.level.split(',') : null;
    const keywordFilter = req.query.keyword ? req.query.keyword.toLowerCase() : null;

    let logs = getLogBuffer(Math.min(limit, 500)); // 最多返回500条

    // 应用筛选
    if (levelFilter || keywordFilter) {
      logs = logs.filter((log) => {
        // 级别筛选
        if (levelFilter && !levelFilter.includes(log.level)) {
          return false;
        }

        // 关键词筛选
        if (keywordFilter) {
          const searchableText = JSON.stringify(log).toLowerCase();
          if (!searchableText.includes(keywordFilter)) {
            return false;
          }
        }

        return true;
      });
    }

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取历史日志失败',
      error: error.message,
    });
  }
});

/**
 * 清空日志缓冲区
 * DELETE /admin/logs/clear
 */
router.delete('/logs/clear', (req, res) => {
  try {
    clearLogBuffer();
    res.json({
      success: true,
      message: '日志已清空',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清空日志失败',
      error: error.message,
    });
  }
});

/**
 * 获取日志统计信息
 * GET /admin/logs/stats
 */
router.get('/logs/stats', (req, res) => {
  try {
    const logs = getLogBuffer(500);

    const stats = {
      total: logs.length,
      byLevel: {
        info: logs.filter((log) => log.level === 'info').length,
        warn: logs.filter((log) => log.level === 'warn').length,
        error: logs.filter((log) => log.level === 'error').length,
        debug: logs.filter((log) => log.level === 'debug').length,
      },
      byType: {
        request: logs.filter((log) => log.type === 'request').length,
        response: logs.filter((log) => log.type === 'response').length,
        message: logs.filter((log) => log.type === 'message').length,
        error: logs.filter((log) => log.type === 'error').length,
      },
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取日志统计失败',
      error: error.message,
    });
  }
});

export default router;

console.log('✅ 实时日志流路由已加载 - BaSui');
