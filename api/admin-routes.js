import express from 'express';
import keyPoolManager from '../auth.js';
import { logInfo, logError } from '../logger.js';

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
router.get('/stats', (req, res) => {
  try {
    const stats = keyPoolManager.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logError('Failed to get stats', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /admin/keys
 * 获取密钥列表 (支持分页和筛选)
 * Query参数:
 *   - page: 页码 (默认1)
 *   - limit: 每页数量 (默认10)
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 */
router.get('/keys', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || 'all';

    const result = keyPoolManager.getKeys(page, limit, status);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logError('Failed to get keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /admin/keys/:id
 * 获取单个密钥详情
 */
/**
 * GET /admin/keys/export
 * 导出密钥为txt文件（一个密钥一行）
 * Query参数:
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 * 老王：这个路由必须放在 /keys/:id 之前，不然会被误匹配！
 */
router.get('/keys/export', (req, res) => {
  try {
    const status = req.query.status || 'all';

    // 老王：获取所有密钥（不分页）
    let keys = keyPoolManager.keys;

    // 按状态筛选
    if (status !== 'all') {
      keys = keys.filter(k => k.status === status);
    }

    // 老王：生成txt内容，每行一个密钥
    const txtContent = keys.map(k => k.key).join('\n');

    // 老王：设置响应头，触发浏览器下载
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `keys_${status}_${timestamp}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(txtContent);

    logInfo(`Admin exported ${keys.length} keys (status: ${status})`);
  } catch (error) {
    logError('Failed to export keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/keys/:id', (req, res) => {
  try {
    const keyId = req.params.id;
    const key = keyPoolManager.getKey(keyId);

    res.json({
      success: true,
      data: key
    });
  } catch (error) {
    if (error.message === 'Key not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      });
    }

    logError('Failed to get key', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /admin/keys
 * 添加单个密钥
 * Body: { key: "fk-xxx", notes: "备注" }
 */
router.post('/keys', (req, res) => {
  try {
    const { key, notes } = req.body;

    if (!key) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Key is required'
      });
    }

    if (!key.startsWith('fk-')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid key format (must start with "fk-")'
      });
    }

    // 老王：限制notes长度，1000字符足够了
    if (notes && notes.length > 1000) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Notes too long (max 1000 characters)'
      });
    }

    const newKey = keyPoolManager.addKey(key, notes || '');

    logInfo(`Admin added new key: ${newKey.id}`);

    res.json({
      success: true,
      message: 'Key added successfully',
      data: newKey
    });
  } catch (error) {
    if (error.message === 'Key already exists') {
      return res.status(409).json({
        error: 'Conflict',
        message: error.message
      });
    }

    logError('Failed to add key', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /admin/keys/batch
 * 批量导入密钥
 * Body: { keys: ["fk-xxx", "fk-yyy", ...] }
 */
router.post('/keys/batch', (req, res) => {
  try {
    const { keys } = req.body;

    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Keys array is required'
      });
    }

    const results = keyPoolManager.importKeys(keys);

    logInfo(`Admin batch imported keys: ${results.success} success, ${results.duplicate} duplicate, ${results.invalid} invalid`);

    res.json({
      success: true,
      message: 'Batch import completed',
      data: results
    });
  } catch (error) {
    logError('Failed to batch import keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /admin/keys/disabled
 * 删除所有禁用的密钥
 * 老王：这个路由必须放在 /keys/:id 之前，不然 Express 会把 disabled 当作 id 参数！
 */
router.delete('/keys/disabled', (req, res) => {
  try {
    const count = keyPoolManager.deleteDisabledKeys();

    logInfo(`Admin deleted ${count} disabled keys`);

    res.json({
      success: true,
      message: `Deleted ${count} disabled keys`,
      data: { count }
    });
  } catch (error) {
    logError('Failed to delete disabled keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /admin/keys/banned
 * 删除所有封禁的密钥
 * 老王：这个路由必须放在 /keys/:id 之前，不然 Express 会把 banned 当作 id 参数！
 */
router.delete('/keys/banned', (req, res) => {
  try {
    const count = keyPoolManager.deleteBannedKeys();

    logInfo(`Admin deleted ${count} banned keys`);

    res.json({
      success: true,
      message: `Deleted ${count} banned keys`,
      data: { count }
    });
  } catch (error) {
    logError('Failed to delete banned keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /admin/keys/:id
 * 删除单个密钥
 * 老王：这个参数化路由必须放在具体路径路由之后，遵循Express路由匹配规则！
 */
router.delete('/keys/:id', (req, res) => {
  try {
    const keyId = req.params.id;
    const deletedKey = keyPoolManager.deleteKey(keyId);

    logInfo(`Admin deleted key: ${keyId}`);

    res.json({
      success: true,
      message: 'Key deleted successfully',
      data: deletedKey
    });
  } catch (error) {
    if (error.message === 'Key not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      });
    }

    logError('Failed to delete key', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * PATCH /admin/keys/:id/toggle
 * 切换密钥状态 (active <-> disabled)
 * Body: { status: "active" | "disabled" }
 */
router.patch('/keys/:id/toggle', (req, res) => {
  try {
    const keyId = req.params.id;
    const { status } = req.body;

    // 老王：允许切换到active状态，这样可以从banned状态恢复
    if (!status || !['active', 'disabled'].includes(status)) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid status (must be "active" or "disabled")'
      });
    }

    const updatedKey = keyPoolManager.toggleKeyStatus(keyId, status);

    logInfo(`Admin toggled key status: ${keyId} -> ${status}`);

    res.json({
      success: true,
      message: 'Key status updated successfully',
      data: updatedKey
    });
  } catch (error) {
    if (error.message === 'Key not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      });
    }

    logError('Failed to toggle key status', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * PATCH /admin/keys/:id/notes
 * 更新密钥备注
 * Body: { notes: "新备注" }
 */
router.patch('/keys/:id/notes', (req, res) => {
  try {
    const keyId = req.params.id;
    const { notes } = req.body;

    if (notes === undefined) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Notes field is required'
      });
    }

    // 老王：限制notes长度，1000字符足够了
    if (notes.length > 1000) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Notes too long (max 1000 characters)'
      });
    }

    const updatedKey = keyPoolManager.updateNotes(keyId, notes);

    logInfo(`Admin updated key notes: ${keyId}`);

    res.json({
      success: true,
      message: 'Key notes updated successfully',
      data: updatedKey
    });
  } catch (error) {
    if (error.message === 'Key not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      });
    }

    logError('Failed to update key notes', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /admin/keys/:id/test
 * 测试单个密钥是否可用
 */
router.post('/keys/:id/test', async (req, res) => {
  try {
    const keyId = req.params.id;
    const result = await keyPoolManager.testKey(keyId);

    // 老王：日志里把详细信息都打出来，别tm藏着掖着
    if (result.success) {
      logInfo(`Admin tested key: ${keyId} - SUCCESS (Status: ${result.status})`);
    } else {
      logInfo(`Admin tested key: ${keyId} - FAILED (Status: ${result.status}, Message: ${result.message})`);
    }

    res.json({
      success: true,
      message: 'Key test completed',
      data: result
    });
  } catch (error) {
    if (error.message === 'Key not found') {
      return res.status(404).json({
        error: 'Not found',
        message: error.message
      });
    }

    logError('Failed to test key', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /admin/keys/test-all
 * 批量测试所有密钥
 */
router.post('/keys/test-all', async (req, res) => {
  try {
    logInfo('Admin started batch key test');

    const results = await keyPoolManager.testAllKeys();

    logInfo(`Admin batch key test completed: ${results.success} success, ${results.failed} failed`);

    res.json({
      success: true,
      message: 'Batch test completed',
      data: results
    });
  } catch (error) {
    logError('Failed to batch test keys', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /admin/config
 * 获取当前轮询配置
 * 返回: { algorithm, retry, autoBan, performance }
 */
router.get('/config', (req, res) => {
  try {
    const config = keyPoolManager.getConfig();

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logError('Failed to get config', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * PUT /admin/config
 * 更新轮询配置（支持部分更新）
 * Body: { algorithm?, retry?, autoBan?, performance? }
 */
router.put('/config', (req, res) => {
  try {
    const newConfig = req.body;

    if (!newConfig || Object.keys(newConfig).length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Config data is required'
      });
    }

    const updatedConfig = keyPoolManager.updateConfig(newConfig);

    logInfo('Admin updated config', { changes: newConfig });

    res.json({
      success: true,
      message: 'Config updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    logError('Failed to update config', error);
    res.status(400).json({
      error: 'Bad request',
      message: error.message
    });
  }
});

/**
 * POST /admin/config/reset
 * 重置轮询配置为默认值
 */
router.post('/config/reset', (req, res) => {
  try {
    const defaultConfig = keyPoolManager.resetConfig();

    logInfo('Admin reset config to defaults');

    res.json({
      success: true,
      message: 'Config reset to defaults',
      data: defaultConfig
    });
  } catch (error) {
    logError('Failed to reset config', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /admin/keys/export
 * 导出密钥为txt文件（一个密钥一行）
 * Query参数:
 *   - status: 状态筛选 (all | active | disabled | banned, 默认all)
 * 老王：这个路由必须放在 /keys/:id 之前，不然会被误匹配！
 */

export default router;
