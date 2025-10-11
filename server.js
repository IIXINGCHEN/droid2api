import 'dotenv/config';
import express from 'express';
import { loadConfig, isDevMode, getPort } from './config.js';
import { logInfo, logError } from './logger.js';
import router from './routes.js';
import { initializeAuth } from './auth.js';
import adminRouter from './api/admin-routes.js';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 老王：覆盖res.json方法，强制所有JSON响应使用UTF-8编码，不然中文显示成SB乱码
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});
// API访问控制中间件
function apiKeyAuth(req, res, next) {
  // 跳过管理API、根路径和静态文件
  const skipPaths = [
    '/admin',           // 管理API
    '/',                // 根路径
    '/index.html',      // HTML文件
    '/style.css',       // CSS文件
    '/app.js',          // JS文件
    '/favicon.ico'      // 网站图标
  ];

  // 检查是否是需要跳过的路径
  if (skipPaths.some(path => req.path === path || req.path.startsWith('/admin'))) {
    return next();
  }

  const clientApiKey = req.headers['x-api-key'] || req.headers['authorization'];
  const validApiKey = process.env.API_ACCESS_KEY;

  // 如果未配置访问密钥,跳过验证
  if (!validApiKey || validApiKey === 'your-secure-access-key-here') {
    return next();
  }

  // 验证密钥格式: Bearer xxx 或直接 xxx
  const cleanClientKey = clientApiKey?.replace('Bearer ', '').trim();
  const cleanValidKey = validApiKey.trim();

  if (!cleanClientKey || cleanClientKey !== cleanValidKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API access key'
    });
  }

  next();
}
  // 应用API访问控制
app.use(apiKeyAuth);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Admin-Key, anthropic-version');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(router);
 // 管理API路由
 app.use('/admin', adminRouter);

 // 静态文件服务 (前端管理界面)
 app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    name: 'droid2api',
    version: '1.0.0',
    description: 'OpenAI Compatible API Proxy',
    endpoints: [
      'GET /v1/models',
      'POST /v1/chat/completions',
      'POST /v1/responses',
      'POST /v1/messages'

    ]
  });
});

// 处理favicon.ico请求，避免404日志刷屏（这个SB浏览器总是自动请求）
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // 204 No Content，不返回任何内容
});

// 404 处理 - 捕获所有未匹配的路由
app.use((req, res, next) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'origin': req.headers['origin'],
      'referer': req.headers['referer']
    },
    ip: req.ip || req.connection.remoteAddress
  };

  console.error('\n' + '='.repeat(80));
  console.error('❌ 非法请求地址');
  console.error('='.repeat(80));
  console.error(`时间: ${errorInfo.timestamp}`);
  console.error(`方法: ${errorInfo.method}`);
  console.error(`地址: ${errorInfo.url}`);
  console.error(`路径: ${errorInfo.path}`);
  
  if (Object.keys(errorInfo.query).length > 0) {
    console.error(`查询参数: ${JSON.stringify(errorInfo.query, null, 2)}`);
  }
  
  if (errorInfo.body && Object.keys(errorInfo.body).length > 0) {
    console.error(`请求体: ${JSON.stringify(errorInfo.body, null, 2)}`);
  }
  
  console.error(`客户端IP: ${errorInfo.ip}`);
  console.error(`User-Agent: ${errorInfo.headers['user-agent'] || 'N/A'}`);
  
  if (errorInfo.headers.referer) {
    console.error(`来源: ${errorInfo.headers.referer}`);
  }
  
  console.error('='.repeat(80) + '\n');

  logError('Invalid request path', errorInfo);

  res.status(404).json({
    error: 'Not Found',
    message: `路径 ${req.method} ${req.path} 不存在`,
    timestamp: errorInfo.timestamp,
    availableEndpoints: [
      'GET /v1/models',
      'POST /v1/chat/completions',
      'POST /v1/responses',
      'POST /v1/messages'
    ]
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logError('Unhandled error', err);
  res.status(500).json({
    error: 'Internal server error',
    message: isDevMode() ? err.message : undefined
  });
});

(async () => {
  try {
    loadConfig();
    logInfo('Configuration loaded successfully');
    logInfo(`Dev mode: ${isDevMode()}`);
    
    // Initialize auth system (load and setup API key if needed)
    // This won't throw error if no auth config is found - will use client auth
    await initializeAuth();
    
    const PORT = getPort();
  logInfo(`Starting server on port ${PORT}...`);
  
  const server = app.listen(PORT)
    .on('listening', () => {
      logInfo(`Server running on http://localhost:${PORT}`);
      logInfo('Available endpoints:');
      logInfo('  GET  /v1/models');
      logInfo('  POST /v1/chat/completions');
      logInfo('  POST /v1/responses');
      logInfo('  POST /v1/messages');
      logInfo('  GET  /admin/* (Key Pool Management)');
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n${'='.repeat(80)}`);
        console.error(`ERROR: Port ${PORT} is already in use!`);
        console.error('');
        console.error('Please choose one of the following options:');
        console.error(`  1. Stop the process using port ${PORT}:`);
        console.error(`     lsof -ti:${PORT} | xargs kill`);
        console.error('');
        console.error('  2. Change the port in config.json:');
        console.error('     Edit config.json and modify the "port" field');
        console.error(`${'='.repeat(80)}\n`);
        process.exit(1);
      } else {
        logError('Failed to start server', err);
        process.exit(1);
      }
    });
  } catch (error) {
    logError('Failed to start server', error);
    process.exit(1);
  }
})();
