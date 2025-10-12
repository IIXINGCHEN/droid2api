import http from 'http';
import https from 'https';
import fetch from 'node-fetch';

/**
 * HTTP客户端连接池管理器 🚀
 *
 * 性能优化核心：
 * - Keep-Alive 复用 TCP 连接（减少握手开销）
 * - 连接池管理（避免连接泄漏）
 * - 自动超时处理（防止连接挂死）
 */

// BaSui：HTTP连接池配置 - 根据你的实际并发量调整！
const HTTP_AGENT_OPTIONS = {
  keepAlive: true,               // 开启 Keep-Alive
  keepAliveMsecs: 1000,         // Keep-Alive 探测间隔
  maxSockets: 100,              // 每个 host 最大并发连接数（单进程）
  maxFreeSockets: 10,           // 空闲连接池大小
  timeout: 60000,               // Socket 超时时间（60秒）
  freeSocketTimeout: 30000      // 空闲连接超时（30秒后释放）
};

// BaSui：全局连接池实例（单例模式）
const httpAgent = new http.Agent(HTTP_AGENT_OPTIONS);
const httpsAgent = new https.Agent(HTTP_AGENT_OPTIONS);

/**
 * 使用连接池的 fetch 封装
 * @param {string} url - 请求 URL
 * @param {object} options - fetch 选项
 * @returns {Promise<Response>}
 */
export async function fetchWithPool(url, options = {}) {
  // BaSui：根据协议自动选择 agent
  const agent = url.startsWith('https') ? httpsAgent : httpAgent;

  return fetch(url, {
    ...options,
    agent  // 使用连接池
  });
}

/**
 * 获取连接池状态（用于监控）
 */
export function getPoolStats() {
  return {
    http: {
      sockets: Object.keys(httpAgent.sockets).length,
      freeSockets: Object.keys(httpAgent.freeSockets).length,
      requests: Object.keys(httpAgent.requests).length
    },
    https: {
      sockets: Object.keys(httpsAgent.sockets).length,
      freeSockets: Object.keys(httpsAgent.freeSockets).length,
      requests: Object.keys(httpsAgent.requests).length
    }
  };
}

/**
 * 优雅关闭连接池（应用退出时调用）
 */
export function destroyPool() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

export default fetchWithPool;
