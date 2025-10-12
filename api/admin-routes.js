import express from 'express';
import keyPoolManager from '../auth.js';
import { logInfo, logError } from '../logger.js';
import { getNotesMaxLength } from '../config.js';
import {
  sendSuccessResponse,
  sendErrorResponse,
  sendBadRequest,
  wrapAsync,
  wrapSync
} from './admin-error-handlers.js';

const router = express.Router();

/**
 * 管理后台鉴权中间件
 */
function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_ACCESS_KEY;

  if (!expectedKey || expectedKey === 'your-admin-key-here') {
    return res.status(500).json({
      error: 'Admin key not configured',
      message: 'Please set ADMIN_ACCESS_KEY in .env file'
    });
  }

  if (!adminKey || adminKey !== expectedKey) {
    logError('Unauthorized admin access attempt', {
      ip: req.ip,
      headers: req.headers
    });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid admin access key'
    });
  }

  next();
}

// 应用鉴权中间件到所有管理路由
router.use(adminAuth);

/**
 * GET /admin/stats
 * 获取密钥池统计信息
 */
router.get('/stats', wrapSync((req, res) => {
  const stats = keyPoolManager.getStats();
  sendSuccessResponse(res, stats);
}, 'get stats'));

/**
 * GET /admin/keys
 * 获取密钥列表 (支持分页和筛选，附带Token使用量信息)
 * Query参数:
 *   - page: 页码 (默认1)
 *   - limit: 每页数量 (默认10)
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 *   - includeTokenUsage: 是否包含Token使用量信息 (true/false, 默认false)
 */
router.get('/keys', wrapAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status || 'all';
  const includeTokenUsage = req.query.includeTokenUsage === 'true';

  const result = keyPoolManager.getKeys(page, limit, status);

  // 如果需要Token使用量信息，从token-usage数据中加载
  if (includeTokenUsage) {
    try {
      // 动态导入token-usage数据
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const tokenUsageFile = path.join(__dirname, '..', 'data', 'token_usage.json');

      if (fs.existsSync(tokenUsageFile)) {
        const tokenData = JSON.parse(fs.readFileSync(tokenUsageFile, 'utf-8'));

        // 合并Token使用量信息到密钥列表
        result.keys = result.keys.map(key => {
          const tokenInfo = tokenData.keys[key.id];
          if (tokenInfo && tokenInfo.success && tokenInfo.standard) {
            return {
              ...key,
              token_usage: {
                used: tokenInfo.standard.orgTotalTokensUsed || 0,
                limit: tokenInfo.standard.totalAllowance || 0,
                remaining: tokenInfo.standard.remaining || 0,
                percentage: tokenInfo.standard.totalAllowance > 0
                  ? ((tokenInfo.standard.orgTotalTokensUsed || 0) / tokenInfo.standard.totalAllowance * 100).toFixed(1)
                  : 0,
                last_sync: tokenInfo.last_sync || null
              }
            };
          }
          return key;
        });
      }
    } catch (error) {
      logError('Failed to load token usage data for keys', error);
    }
  }

  sendSuccessResponse(res, result);
}, 'get keys'));

/**
 * GET /admin/keys/:id
 * 获取单个密钥详情
 */
/**
 * GET /admin/keys/export
 * 导出密钥为txt文件（一个密钥一行）
 * Query参数:
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 * BaSui：这个路由必须放在 /keys/:id 之前，不然会被误匹配！
 */
router.get('/keys/export', wrapSync((req, res) => {
  const status = req.query.status || 'all';

  // 获取所有密钥（不分页）
  let keys = keyPoolManager.keys;

  // 按状态筛选
  if (status !== 'all') {
    keys = keys.filter(k => k.status === status);
  }

  // 生成txt内容，每行一个密钥
  const txtContent = keys.map(k => k.key).join('\n');

  // 设置响应头，触发浏览器下载
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `keys_${status}_${timestamp}.txt`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(txtContent);

  logInfo(`Admin exported ${keys.length} keys (status: ${status})`);
}, 'export keys'));

router.get('/keys/:id', wrapSync((req, res) => {
  const keyId = req.params.id;
  const key = keyPoolManager.getKey(keyId);
  sendSuccessResponse(res, key);
}, 'get key'));

/**
 * POST /admin/keys
 * 添加单个密钥
 * Body: { key: "fk-xxx", notes: "备注", poolGroup: "freebies" }
 */
router.post('/keys', wrapSync((req, res) => {
  const { key, notes, poolGroup } = req.body;

  if (!key) {
    return sendBadRequest(res, 'Key is required');
  }

  if (!key.startsWith('fk-')) {
    return sendBadRequest(res, 'Invalid key format (must start with "fk-")');
  }

  // 限制notes长度
  const maxLength = getNotesMaxLength();
  if (notes && notes.length > maxLength) {
    return sendBadRequest(res, `Notes too long (max ${maxLength} characters)`);
  }

  const newKey = keyPoolManager.addKey(key, notes || '', poolGroup || null);

  logInfo(`Admin added new key: ${newKey.id} (pool: ${newKey.poolGroup})`);

  sendSuccessResponse(res, newKey, 'Key added successfully');
}, 'add key'));

/**
 * POST /admin/keys/batch
 * 批量导入密钥
 * Body: { keys: ["fk-xxx", "fk-yyy", ...] }
 */
router.post('/keys/batch', wrapSync((req, res) => {
  const { keys } = req.body;

  if (!keys || !Array.isArray(keys)) {
    return sendBadRequest(res, 'Keys array is required');
  }

  const results = keyPoolManager.importKeys(keys);

  logInfo(`Admin batch imported keys: ${results.success} success, ${results.duplicate} duplicate, ${results.invalid} invalid`);

  sendSuccessResponse(res, results, 'Batch import completed');
}, 'batch import keys'));

/**
 * DELETE /admin/keys/disabled
 * 删除所有禁用的密钥
 * BaSui：这个路由必须放在 /keys/:id 之前，不然 Express 会把 disabled 当作 id 参数！
 */
router.delete('/keys/disabled', wrapSync((req, res) => {
  const count = keyPoolManager.deleteDisabledKeys();

  logInfo(`Admin deleted ${count} disabled keys`);

  sendSuccessResponse(res, { count }, `Deleted ${count} disabled keys`);
}, 'delete disabled keys'));

/**
 * DELETE /admin/keys/banned
 * 删除所有封禁的密钥
 * BaSui：这个路由必须放在 /keys/:id 之前，不然 Express 会把 banned 当作 id 参数！
 */
router.delete('/keys/banned', wrapSync((req, res) => {
  const count = keyPoolManager.deleteBannedKeys();

  logInfo(`Admin deleted ${count} banned keys`);

  sendSuccessResponse(res, { count }, `Deleted ${count} banned keys`);
}, 'delete banned keys'));

/**
 * DELETE /admin/keys/:id
 * 删除单个密钥
 * BaSui：这个参数化路由必须放在具体路径路由之后，遵循Express路由匹配规则！
 */
router.delete('/keys/:id', wrapSync((req, res) => {
  const keyId = req.params.id;
  const deletedKey = keyPoolManager.deleteKey(keyId);

  logInfo(`Admin deleted key: ${keyId}`);

  sendSuccessResponse(res, deletedKey, 'Key deleted successfully');
}, 'delete key'));

/**
 * PATCH /admin/keys/:id/toggle
 * 切换密钥状态 (active <-> disabled)
 * Body: { status: "active" | "disabled" }
 */
router.patch('/keys/:id/toggle', wrapSync((req, res) => {
  const keyId = req.params.id;
  const { status } = req.body;

  // 允许切换到active状态，这样可以从banned状态恢复
  if (!status || !['active', 'disabled'].includes(status)) {
    return sendBadRequest(res, 'Invalid status (must be "active" or "disabled")');
  }

  const updatedKey = keyPoolManager.toggleKeyStatus(keyId, status);

  logInfo(`Admin toggled key status: ${keyId} -> ${status}`);

  sendSuccessResponse(res, updatedKey, 'Key status updated successfully');
}, 'toggle key status'));

/**
 * PATCH /admin/keys/:id/notes
 * 更新密钥备注
 * Body: { notes: "新备注" }
 */
router.patch('/keys/:id/notes', wrapSync((req, res) => {
  const keyId = req.params.id;
  const { notes } = req.body;

  if (notes === undefined) {
    return sendBadRequest(res, 'Notes field is required');
  }

  // 限制notes长度
  const maxLength = getNotesMaxLength();
  if (notes.length > maxLength) {
    return sendBadRequest(res, `Notes too long (max ${maxLength} characters)`);
  }

  const updatedKey = keyPoolManager.updateNotes(keyId, notes);

  logInfo(`Admin updated key notes: ${keyId}`);

  sendSuccessResponse(res, updatedKey, 'Key notes updated successfully');
}, 'update key notes'));

/**
 * PUT /admin/keys/:id
 * 完整更新密钥信息（支持修改key本身和notes）
 * Body: { key: "fk-xxx", notes: "新备注" }
 * BaSui: 这个端点支持修改密钥本身，但要小心使用！
 */
router.put('/keys/:id', wrapSync((req, res) => {
  const keyId = req.params.id;
  const { key, notes } = req.body;

  // 验证新密钥格式
  if (key && !key.startsWith('fk-')) {
    return sendBadRequest(res, 'Invalid key format (must start with "fk-")');
  }

  // 限制notes长度
  const maxLength = getNotesMaxLength();
  if (notes && notes.length > maxLength) {
    return sendBadRequest(res, `Notes too long (max ${maxLength} characters)`);
  }

  // 获取现有密钥
  const existingKey = keyPoolManager.getKey(keyId);

  // 更新密钥数据
  const updates = {};
  if (key && key !== existingKey.key) {
    // 检查新密钥是否已存在
    const duplicate = keyPoolManager.keys.find(k => k.key === key && k.id !== keyId);
    if (duplicate) {
      return sendBadRequest(res, 'Key already exists in the pool');
    }
    updates.key = key;
  }
  if (notes !== undefined) {
    updates.notes = notes;
  }

  // 应用更新
  Object.assign(existingKey, updates);
  keyPoolManager.saveKeyPool();

  logInfo(`Admin updated key: ${keyId}`, updates);

  sendSuccessResponse(res, existingKey, 'Key updated successfully');
}, 'update key'));

/**
 * POST /admin/keys/:id/test
 * 测试单个密钥是否可用
 */
router.post('/keys/:id/test', wrapAsync(async (req, res) => {
  const keyId = req.params.id;
  const result = await keyPoolManager.testKey(keyId);

  // 日志里把详细信息都打出来
  if (result.success) {
    logInfo(`Admin tested key: ${keyId} - SUCCESS (Status: ${result.status})`);
  } else {
    logInfo(`Admin tested key: ${keyId} - FAILED (Status: ${result.status}, Message: ${result.message})`);
  }

  sendSuccessResponse(res, result, 'Key test completed');
}, 'test key'));

/**
 * POST /admin/keys/test-all
 * 批量测试所有密钥
 */
router.post('/keys/test-all', wrapAsync(async (req, res) => {
  logInfo('Admin started batch key test');

  const results = await keyPoolManager.testAllKeys();

  logInfo(`Admin batch key test completed: ${results.success} success, ${results.failed} failed`);

  sendSuccessResponse(res, results, 'Batch test completed');
}, 'batch test keys'));

/**
 * GET /admin/config
 * 获取当前轮询配置
 * 返回: { algorithm, retry, autoBan, performance }
 */
router.get('/config', wrapSync((req, res) => {
  const config = keyPoolManager.getConfig();
  sendSuccessResponse(res, config);
}, 'get config'));

/**
 * PUT /admin/config
 * 更新轮询配置（支持部分更新）
 * Body: { algorithm?, retry?, autoBan?, performance? }
 */
router.put('/config', wrapSync((req, res) => {
  const newConfig = req.body;

  if (!newConfig || Object.keys(newConfig).length === 0) {
    return sendBadRequest(res, 'Config data is required');
  }

  const updatedConfig = keyPoolManager.updateConfig(newConfig);

  logInfo('Admin updated config', { changes: newConfig });

  sendSuccessResponse(res, updatedConfig, 'Config updated successfully');
}, 'update config'));

/**
 * POST /admin/config/reset
 * 重置轮询配置为默认值
 */
router.post('/config/reset', wrapSync((req, res) => {
  const defaultConfig = keyPoolManager.resetConfig();

  logInfo('Admin reset config to defaults');

  sendSuccessResponse(res, defaultConfig, 'Config reset to defaults');
}, 'reset config'));

/**
 * GET /admin/keys/export
 * 导出密钥为txt文件（一个密钥一行）
 * Query参数:
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 * BaSui：这个路由必须放在 /keys/:id 之前，不然会被误匹配！
 */

// ========== 🚀 BaSui：多级密钥池管理 API ==========

/**
 * GET /admin/pool-groups
 * 获取所有池子的统计信息
 * 返回示例：
 * [
 *   {
 *     id: "freebies",
 *     name: "白嫖池",
 *     priority: 1,
 *     description: "捡来的免费密钥",
 *     total: 50,
 *     active: 40,
 *     disabled: 5,
 *     banned: 5,
 *     usage_rate: 0.8
 *   }
 * ]
 */
router.get('/pool-groups', wrapSync((req, res) => {
  const stats = keyPoolManager.getPoolGroupStats();
  sendSuccessResponse(res, stats);
}, 'get pool groups stats'));

/**
 * POST /admin/pool-groups
 * 创建新的密钥池组
 * Body: { id: "test-pool", name: "测试池", priority: 3, description: "描述" }
 */
router.post('/pool-groups', wrapSync((req, res) => {
  const { id, name, priority, description } = req.body;

  if (!id || !name || priority === undefined) {
    return sendBadRequest(res, 'id, name, and priority are required');
  }

  // 检查ID是否已存在
  if (keyPoolManager.poolGroups.find(g => g.id === id)) {
    return sendBadRequest(res, `Pool group with id "${id}" already exists`);
  }

  // 创建新池子
  const newGroup = {
    id: id.trim(),
    name: name.trim(),
    priority: parseInt(priority),
    description: description || ''
  };

  keyPoolManager.poolGroups.push(newGroup);
  keyPoolManager.saveKeyPool();

  logInfo(`Admin created pool group: ${id} (priority ${priority})`);

  sendSuccessResponse(res, newGroup, 'Pool group created successfully');
}, 'create pool group'));

/**
 * DELETE /admin/pool-groups/:id
 * 删除密钥池组（不会删除密钥，只是移除分组）
 */
router.delete('/pool-groups/:id', wrapSync((req, res) => {
  const groupId = req.params.id;

  const index = keyPoolManager.poolGroups.findIndex(g => g.id === groupId);
  if (index === -1) {
    return sendBadRequest(res, `Pool group "${groupId}" not found`);
  }

  // 移除池子
  const deleted = keyPoolManager.poolGroups.splice(index, 1)[0];

  // 检查有多少密钥属于这个池子
  const affectedKeys = keyPoolManager.keys.filter(k => k.poolGroup === groupId);

  // 将这些密钥移到 "default" 池
  affectedKeys.forEach(k => k.poolGroup = 'default');

  keyPoolManager.saveKeyPool();

  logInfo(`Admin deleted pool group: ${groupId} (${affectedKeys.length} keys moved to default)`);

  sendSuccessResponse(res, {
    deleted,
    affected_keys: affectedKeys.length
  }, 'Pool group deleted successfully');
}, 'delete pool group'));

/**
 * PATCH /admin/keys/:id/pool
 * 修改密钥所属池子
 * Body: { poolGroup: "main" }
 */
router.patch('/keys/:id/pool', wrapSync((req, res) => {
  const keyId = req.params.id;
  const { poolGroup } = req.body;

  if (!poolGroup) {
    return sendBadRequest(res, 'poolGroup is required');
  }

  const key = keyPoolManager.getKey(keyId);
  const oldPool = key.poolGroup;

  key.poolGroup = poolGroup;
  keyPoolManager.saveKeyPool();

  logInfo(`Admin moved key ${keyId} from "${oldPool}" to "${poolGroup}"`);

  sendSuccessResponse(res, key, 'Key pool changed successfully');
}, 'change key pool'));

export default router;
