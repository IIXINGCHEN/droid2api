import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { logDebug, logError, logInfo } from './logger.js';
import { transformToAnthropic, getAnthropicHeaders } from './transformers/request-anthropic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 密钥池管理系统
 * 支持大规模FACTORY_API_KEY轮询使用（无数量限制）
 * 自动封禁402错误的密钥
 */
class KeyPoolManager {
  constructor() {
    this.keyPoolPath = path.join(__dirname, 'key_pool.json');
    this.keys = [];
    this.stats = {
      total: 0,
      active: 0,
      disabled: 0,
      banned: 0,
      last_rotation_index: 0
    };
    // 老王：添加轮询配置，支持多种算法和重试机制
    this.config = {
      algorithm: 'round-robin',  // 轮询算法: round-robin, random, least-used
      retry: {
        enabled: true,           // 启用重试
        maxRetries: 3,          // 最大重试次数
        retryDelay: 1000        // 重试延迟(毫秒)
      },
      autoBan: {
        enabled: true,           // 启用自动封禁
        errorThreshold: 5,      // 错误阈值（连续失败次数）
        ban402: true,           // 402错误自动封禁
        ban401: false           // 401错误是否封禁
      },
      performance: {
        concurrentLimit: 100,   // 并发限制
        requestTimeout: 10000   // 请求超时(毫秒)
      }
    };
    this.currentKeyId = null;
    this.loadKeyPool();
  }

  generateId() {
    return 'key_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  loadKeyPool() {
    try {
      if (fs.existsSync(this.keyPoolPath)) {
        const data = fs.readFileSync(this.keyPoolPath, 'utf-8');
        const pool = JSON.parse(data);
        this.keys = pool.keys || [];
        this.stats = pool.stats || this.stats;
        // 老王：加载配置，如果没有则使用默认值
    // 老王：深度合并配置，防止旧版本config覆盖新字段导致undefined！
    if (pool.config) {
      // 合并algorithm
      this.config.algorithm = pool.config.algorithm || this.config.algorithm;

      // 深度合并retry、autoBan、performance（保留默认值）
      this.config.retry = { ...this.config.retry, ...(pool.config.retry || {}) };
      this.config.autoBan = { ...this.config.autoBan, ...(pool.config.autoBan || {}) };
      this.config.performance = { ...this.config.performance, ...(pool.config.performance || {}) };

      // 老王：保留旧版本的weights字段（向后兼容weighted-score算法）
      if (pool.config.weights) {
        this.config.weights = pool.config.weights;
      }
    }
        logInfo(`Loaded ${this.keys.length} keys from key pool`);
        logInfo(`Polling algorithm: ${this.config.algorithm}`);
      } else {
        logInfo('Key pool file not found, starting with empty pool');
        this.saveKeyPool();
      }
    } catch (error) {
      logError('Failed to load key pool', error);
      this.keys = [];
    }
  }

  saveKeyPool() {
    // 老王：文件保存重试机制 - 防止数据丢失！
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 500; // 毫秒

    this.stats.total = this.keys.length;
    this.stats.active = this.keys.filter(k => k.status === 'active').length;
    this.stats.disabled = this.keys.filter(k => k.status === 'disabled').length;
    this.stats.banned = this.keys.filter(k => k.status === 'banned').length;

    const data = {
      keys: this.keys,
      stats: this.stats,
      config: this.config
    };

    const jsonData = JSON.stringify(data, null, 2);
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // 老王：先保存到临时文件，成功后再重命名（原子操作）
        const tempPath = this.keyPoolPath + '.tmp';
        fs.writeFileSync(tempPath, jsonData, 'utf-8');

        // 老王：验证写入的数据是否正确（防止数据损坏）
        const written = fs.readFileSync(tempPath, 'utf-8');
        if (written !== jsonData) {
          throw new Error('写入验证失败：文件内容不匹配');
        }

        // 老王：备份旧文件（如果存在）
        if (fs.existsSync(this.keyPoolPath)) {
          const backupPath = this.keyPoolPath + '.bak';
          fs.copyFileSync(this.keyPoolPath, backupPath);
        }

        // 老王：重命名临时文件为正式文件（原子操作，防止保存到一半进程崩溃）
        fs.renameSync(tempPath, this.keyPoolPath);

        logDebug('Key pool saved successfully' + (attempt > 0 ? ` (after ${attempt + 1} attempts)` : ''));
        return; // 保存成功，退出
      } catch (error) {
        lastError = error;
        logError(`Failed to save key pool (attempt ${attempt + 1}/${MAX_RETRIES})`, error);

        // 如果不是最后一次尝试，等待后重试
        if (attempt < MAX_RETRIES - 1) {
          // 老王：同步睡眠（简单粗暴但有效）
          const now = Date.now();
          while (Date.now() - now < RETRY_DELAY) {
            // 忙等待
          }
        }
      }
    }

    // 老王：艹！所有重试都失败了，必须抛出异常！
    throw new Error(`密钥池文件保存失败（尝试${MAX_RETRIES}次）: ${lastError.message}`);
  }

  async getNextKey() {
    // 老王：只选用测试通过成功的key，没有就直接报错，简单粗暴！
    const activeKeys = this.keys.filter(k =>
      k.status === 'active' && k.last_test_result === 'success'
    );

    if (activeKeys.length === 0) {
      // 艹，一个测试通过的key都没有，直接报错！
      const totalKeys = this.keys.length;
      const activeButUntestedKeys = this.keys.filter(k => k.status === 'active' && k.last_test_result !== 'success').length;

      throw new Error(
        `密钥池中没有测试通过的可用密钥。` +
        `总密钥数：${totalKeys}，未测试或测试失败的激活密钥：${activeButUntestedKeys}。` +
        `请先在管理面板中测试您的密钥。`
      );
    }

    let keyObj;

    // 老王：根据配置的算法选择密钥
    switch (this.config.algorithm) {
      case 'weighted-score':
        // 加权评分算法：基于多个因素的综合评分选择最优密钥
        keyObj = await this.selectKeyByWeight(activeKeys);
        break;

      case 'random':
        // 随机算法：从可用密钥中随机选择
        const randomIndex = Math.floor(Math.random() * activeKeys.length);
        keyObj = activeKeys[randomIndex];
        logDebug(`Using random key: ${keyObj.id} [${randomIndex + 1}/${activeKeys.length}]`);
        break;

      case 'least-used':
        // 最少使用算法：选择使用次数最少的密钥
        keyObj = activeKeys.reduce((min, key) =>
          (key.usage_count || 0) < (min.usage_count || 0) ? key : min
        );
        logDebug(`Using least-used key: ${keyObj.id} (usage: ${keyObj.usage_count || 0})`);
        break;

      case 'round-robin':
      default:
        // 轮询算法（默认）：按顺序轮流使用
        const index = this.stats.last_rotation_index % activeKeys.length;
        keyObj = activeKeys[index];
        this.stats.last_rotation_index = (this.stats.last_rotation_index + 1) % activeKeys.length;
        logDebug(`Using round-robin key: ${keyObj.id} [${index + 1}/${activeKeys.length}]`);
        break;
    }

    // 老王：加权评分算法已经在selectKeyByWeight中处理了统计更新，不需要重复处理
    if (this.config.algorithm !== 'weighted-score') {
      keyObj.usage_count = (keyObj.usage_count || 0) + 1;
      keyObj.last_used_at = new Date().toISOString();
      this.saveKeyPool();
    }

    this.currentKeyId = keyObj.id;

    return {
      keyId: keyObj.id,
      key: keyObj.key
    };
  }

  banKey(keyId, reason = 'Payment Required - No Credits') {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      logError(`Key not found for banning: ${keyId}`);
      return false;
    }

    key.status = 'banned';
    key.banned_at = new Date().toISOString();
    key.banned_reason = reason;

    this.saveKeyPool();
    logInfo(`🚫 Key banned: ${keyId} - ${reason}`);
    return true;
  }

  getCurrentKeyId() {
    return this.currentKeyId;
  }

  addKey(key, notes = '') {
    if (this.keys.find(k => k.key === key)) {
      throw new Error('Key already exists');
    }

    const keyObj = {
      id: this.generateId(),
      key: key.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
      last_used_at: null,
      usage_count: 0,
      error_count: 0,
      last_error: null,
      last_test_at: null,
      last_test_result: 'untested',
      banned_at: null,
      banned_reason: null,
      notes: notes || ''
    };

    this.keys.push(keyObj);
    this.saveKeyPool();
    logInfo(`Added new key: ${keyObj.id}`);
    return keyObj;
  }

  importKeys(keys) {
    const results = {
      success: 0,
      duplicate: 0,
      invalid: 0,
      errors: []
    };

    keys.forEach((key, index) => {
      const trimmedKey = key.trim();

      if (!trimmedKey) {
        results.invalid++;
        return;
      }

      if (!trimmedKey.startsWith('fk-')) {
        results.invalid++;
        results.errors.push(`Line ${index + 1}: Invalid key format (must start with 'fk-')`);
        return;
      }

      if (this.keys.find(k => k.key === trimmedKey)) {
        results.duplicate++;
        return;
      }

      try {
        this.addKey(trimmedKey, `Imported at ${new Date().toISOString()}`);
        results.success++;
      } catch (error) {
        results.errors.push(`Line ${index + 1}: ${error.message}`);
      }
    });

    logInfo(`Batch import completed: ${results.success} success, ${results.duplicate} duplicate, ${results.invalid} invalid`);
    return results;
  }

  deleteKey(keyId) {
    const index = this.keys.findIndex(k => k.id === keyId);
    if (index === -1) {
      throw new Error('Key not found');
    }

    const key = this.keys[index];
    this.keys.splice(index, 1);
    this.saveKeyPool();
    logInfo(`Deleted key: ${keyId}`);
    return key;
  }

  toggleKeyStatus(keyId, newStatus) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      throw new Error('Key not found');
    }

    if (key.status === 'banned' && newStatus === 'active') {
      key.status = 'active';
      key.banned_at = null;
      key.banned_reason = null;
      logInfo(`Key unbanned and activated: ${keyId}`);
    } else {
      key.status = newStatus;
      logInfo(`Key status changed: ${keyId} -> ${newStatus}`);
    }

    this.saveKeyPool();
    return key;
  }

  updateNotes(keyId, notes) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      throw new Error('Key not found');
    }

    key.notes = notes;
    this.saveKeyPool();
    return key;
  }

  async testKey(keyId) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      throw new Error('Key not found');
    }

    logInfo(`Testing key: ${keyId}`);

    // 老王：实现重试机制，网络问题别一次就放弃！
    const retryConfig = this.config.retry;
    const maxRetries = retryConfig.enabled ? (retryConfig.maxRetries || 0) : 0;
    const retryDelay = retryConfig.retryDelay || 1000;

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logInfo(`Retrying key test: ${keyId} (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        const testUrl = 'https://app.factory.ai/api/llm/a/v1/messages';

        // 老王：复用转换层，别tm重复造轮子！这才是DRY原则
        // 构建OpenAI格式的测试请求
        const openaiRequest = {
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 10,
          messages: [
            { role: 'user', content: 'test' }
          ],
          stream: false
        };

        // 使用转换层转换请求格式
        const transformedRequest = transformToAnthropic(openaiRequest);

        // 使用转换层生成完整的headers（包含所有必需的x-*字段）
        const headers = getAnthropicHeaders(
          `Bearer ${key.key}`,  // authHeader
          {},                    // clientHeaders (空对象)
          false,                 // isStreaming
          'claude-sonnet-4-5-20250929'  // modelId
        );

        // 老王：使用AbortController实现超时控制，node-fetch v3不支持timeout选项！
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
          response = await fetch(testUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(transformedRequest),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Request timeout after 10 seconds');
          }
          throw fetchError;
        }

          key.last_test_at = new Date().toISOString();

        // 读取响应体获取详细错误信息
        let responseBody = null;
        let responseText = '';
        try {
          responseText = await response.text();
          responseBody = JSON.parse(responseText);
        } catch (e) {
          // 响应不是JSON格式，使用原始文本
          responseBody = { raw: responseText };
        }

        // 老王：402错误是确定性错误，不需要重试，直接封禁并返回
        if (response.status === 402) {
          const errorMsg = responseBody?.error?.message || 'Payment Required - No Credits';
          key.status = 'banned';
          key.banned_at = new Date().toISOString();
          key.banned_reason = errorMsg;
          key.last_test_result = 'failed';
          key.error_count = (key.error_count || 0) + 1;
          key.last_error = `402: ${errorMsg}`;
          this.saveKeyPool();

          logError(`Key test failed (402): ${keyId}`, {
            message: errorMsg,
            fullResponse: responseBody,
            statusCode: response.status,
            statusText: response.statusText
          });

          return {
            success: false,
            status: 402,
            message: `Key banned: ${errorMsg}`,
            key_status: 'banned',
            details: responseBody
          };
        }

        // 老王：401认证失败，标记为禁用！可能是密钥无效或被撤销了！
        if (response.status === 401) {
          const errorMsg = responseBody?.error?.message || 'Unauthorized - Invalid API Key';
          key.status = 'disabled';
          key.last_test_result = 'failed';
          key.error_count = (key.error_count || 0) + 1;
          key.last_error = `401: ${errorMsg}`;
          this.saveKeyPool();

          logError(`Key test failed (401): ${keyId}`, {
            message: errorMsg,
            fullResponse: responseBody,
            statusCode: response.status,
            statusText: response.statusText
          });

          return {
            success: false,
            status: 401,
            message: `Key disabled: ${errorMsg}`,
            key_status: 'disabled',
            details: responseBody
          };
        }

        // 老王：测试成功，不需要重试
        if (response.status === 200) {
          key.last_test_result = 'success';
          this.saveKeyPool();

          logInfo(`Key test success: ${keyId} - Status ${response.status}`);
          return {
            success: true,
            status: response.status,
            message: 'Key is valid',
            key_status: key.status
          };
        }

        // 老王：其他HTTP错误状态，如果是5xx可能是临时问题，可以重试
        const errorMsg = responseBody?.error?.message || response.statusText || 'Unknown error';

        // 4xx错误（除了429）是确定性错误，不重试
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          key.status = 'disabled';  // 老王：非200状态自动禁用密钥！
          key.last_test_result = 'failed';
          key.error_count = (key.error_count || 0) + 1;
          key.last_error = `${response.status}: ${errorMsg}`;
          this.saveKeyPool();

          logError(`Key test failed (${response.status}): ${keyId}`, {
            message: errorMsg,
            fullResponse: responseBody,
            statusCode: response.status,
            statusText: response.statusText
          });

          return {
            success: false,
            status: response.status,
            message: `Test failed: ${errorMsg}`,
            key_status: key.status,
            details: responseBody
          };
        }

        // 5xx错误可以重试，抛出异常进入重试逻辑
        throw new Error(`Server error ${response.status}: ${errorMsg}`);

      } catch (error) {
        lastError = error;

        // 老王：如果还有重试机会，继续；否则退出循环
        if (attempt < maxRetries) {
          logInfo(`Key test attempt ${attempt + 1} failed: ${error.message}, will retry...`);
          continue;
        }

        // 所有重试都失败了
        break;
      }
    }

    // 老王：所有重试都失败，记录最后的错误
    key.status = 'disabled';  // 老王：所有重试都失败，禁用密钥！
    key.last_test_result = 'failed';
    key.error_count = (key.error_count || 0) + 1;
    key.last_error = lastError.message;
    this.saveKeyPool();

    logError(`Key test error after ${maxRetries + 1} attempts: ${keyId}`, lastError);
    return {
      success: false,
      status: 0,
      message: `Test error after ${maxRetries + 1} attempts: ${lastError.message}`,
      key_status: key.status
    };
  }

  async testAllKeys() {
    const results = {
      total: this.keys.length,
      tested: 0,
      success: 0,
      failed: 0,
      banned: 0
    };

    // 老王：只测试非封禁状态的密钥
    const keysToTest = this.keys.filter(k => k.status !== 'banned');

    // 老王：并发数从配置读取，支持动态调整！默认10个
    const concurrentLimit = Math.max(1, Math.min(this.config.performance.concurrentLimit || 10, 50));

    logInfo(`Starting batch test for ${keysToTest.length} keys (${concurrentLimit} concurrent)...`);

    for (let i = 0; i < keysToTest.length; i += concurrentLimit) {
      const batch = keysToTest.slice(i, i + concurrentLimit);

      // 并发执行当前批次
      const batchResults = await Promise.allSettled(
        batch.map(key => this.testKey(key.id))
      );

      // 统计结果
      batchResults.forEach(promiseResult => {
        results.tested++;

        if (promiseResult.status === 'fulfilled') {
          const result = promiseResult.value;
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            if (result.key_status === 'banned') {
              results.banned++;
            }
          }
        } else {
          // Promise rejected，计为失败
          results.failed++;
          logError('Test key failed with exception', promiseResult.reason);
        }
      });

      // 老王：批次之间短暂延迟，避免速率限制（1秒）
      if (i + concurrentLimit < keysToTest.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logInfo(`Batch test completed: ${results.success} success, ${results.failed} failed, ${results.banned} banned`);
    return results;
  }

  getKeys(page = 1, limit = 10, status = 'all') {
    let filteredKeys = this.keys;

    if (status !== 'all') {
      filteredKeys = filteredKeys.filter(k => k.status === status);
    }

    const total = filteredKeys.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedKeys = filteredKeys.slice(start, end);

    return {
      keys: paginatedKeys,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages
      }
    };
  }

  getKey(keyId) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      throw new Error('Key not found');
    }
    return key;
  }

  getStats() {
    this.stats.total = this.keys.length;
    this.stats.active = this.keys.filter(k => k.status === 'active').length;
    this.stats.disabled = this.keys.filter(k => k.status === 'disabled').length;
    this.stats.banned = this.keys.filter(k => k.status === 'banned').length;

    return this.stats;
  }

  deleteDisabledKeys() {
    const disabledKeys = this.keys.filter(k => k.status === 'disabled');
    const count = disabledKeys.length;

    this.keys = this.keys.filter(k => k.status !== 'disabled');
    this.saveKeyPool();

    logInfo(`Deleted ${count} disabled keys`);
    return count;
  }

  deleteBannedKeys() {
    const bannedKeys = this.keys.filter(k => k.status === 'banned');
    const count = bannedKeys.length;

    this.keys = this.keys.filter(k => k.status !== 'banned');
    this.saveKeyPool();

    logInfo(`Deleted ${count} banned keys`);
    return count;
  }

  // 老王：配置管理方法
  getConfig() {
    return this.config;
  }

  updateConfig(newConfig) {
    // 老王：验证配置的合法性
    if (newConfig.algorithm && !['round-robin', 'random', 'least-used', 'weighted-score'].includes(newConfig.algorithm)) {
      throw new Error('Invalid algorithm. Must be: round-robin, random, least-used, or weighted-score');
    }

    if (newConfig.retry) {
      if (typeof newConfig.retry.maxRetries !== 'undefined' && newConfig.retry.maxRetries < 0) {
        throw new Error('maxRetries must be >= 0');
      }
      if (typeof newConfig.retry.retryDelay !== 'undefined' && newConfig.retry.retryDelay < 0) {
        throw new Error('retryDelay must be >= 0');
      }
    }

    // 老王：合并配置（深度合并）
    if (newConfig.algorithm) {
      this.config.algorithm = newConfig.algorithm;
    }

    if (newConfig.retry) {
      this.config.retry = { ...this.config.retry, ...newConfig.retry };
    }

    if (newConfig.autoBan) {
      this.config.autoBan = { ...this.config.autoBan, ...newConfig.autoBan };
    }

    if (newConfig.performance) {
      this.config.performance = { ...this.config.performance, ...newConfig.performance };
    }

    this.saveKeyPool();
    logInfo(`Config updated: algorithm=${this.config.algorithm}`);
    return this.config;
  }

  resetConfig() {
    // 老王：重置为默认配置
    this.config = {
      algorithm: 'round-robin',
      retry: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 1000
      },
      autoBan: {
        enabled: true,
        errorThreshold: 5,
        ban402: true,
        ban401: false
      },
      performance: {
        concurrentLimit: 100,
        requestTimeout: 10000
      }
    };
    this.saveKeyPool();
    logInfo('Config reset to defaults');
    return this.config;
  }

  // ========== 老王：加权轮询和Token统计新功能 ==========

  calculateKeyScore(keyInfo, useCache = true) {
    // 老王：评分缓存优化 - 5分钟内不重复计算，大幅提升性能！
    const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
    const now = Date.now();

    // 检查缓存是否有效
    if (useCache && keyInfo.score_cache !== undefined && keyInfo.score_cache_time) {
      const cacheAge = now - keyInfo.score_cache_time;
      if (cacheAge < CACHE_TTL) {
        // 缓存仍然有效，直接返回
        return keyInfo.score_cache;
      }
    }

    // 缓存失效或不存在，重新计算
    const lastUsed = keyInfo.last_used_at ? new Date(keyInfo.last_used_at).getTime() : now - (24 * 60 * 60 * 1000);
    const hoursSinceLastUse = (now - lastUsed) / (1000 * 60 * 60);

    const weights = { success_rate: 0.6, freshness: 0.3, experience: 0.1 };

    const totalRequests = keyInfo.total_requests || keyInfo.usage_count || 0;
    const successRequests = keyInfo.success_requests || (totalRequests - (keyInfo.error_count || 0));
    const successRate = totalRequests > 0 ? successRequests / totalRequests : 0;
    const successScore = successRate * 100;

    const freshnessScore = Math.max(0, 100 - hoursSinceLastUse * 4);
    const experienceScore = Math.min(100, totalRequests / 10);

    const totalScore = successScore * weights.success_rate + freshnessScore * weights.freshness + experienceScore * weights.experience;
    const roundedScore = Math.round(totalScore * 100) / 100;

    // 老王：更新缓存
    keyInfo.score_cache = roundedScore;
    keyInfo.score_cache_time = now;

    return roundedScore;
  }

  migrateKeyPoolData() {
    let migrated = false;

    this.keys.forEach(key => {
      if (typeof key.total_requests === 'undefined') {
        key.total_requests = key.usage_count || 0;
        migrated = true;
      }

      if (typeof key.success_requests === 'undefined') {
        key.success_requests = key.total_requests - (key.error_count || 0);
        migrated = true;
      }

      if (typeof key.success_rate === 'undefined' || migrated) {
        key.success_rate = key.total_requests > 0 ? key.success_requests / key.total_requests : 0;
      }

      // 老王：初始化缓存字段（如果不存在）
      if (typeof key.score_cache === 'undefined') {
        key.score_cache = undefined;
        key.score_cache_time = undefined;
        migrated = true;
      }

      // 老王：迁移时强制重新计算评分（不使用缓存）
      key.weight_score = this.calculateKeyScore(key, false);
    });

    if (migrated) {
      this.saveKeyPool();
      logInfo('密钥池数据结构升级完成，共 ' + this.keys.length + ' 个密钥');
    }

    return migrated;
  }

  async selectKeyByWeight(activeKeys = null) {
    // 老王：优先使用传入的activeKeys，如果没有则内部过滤
    const availableKeys = activeKeys || this.keys.filter(k => k.status === 'active' && k.last_test_result === 'success');

    if (availableKeys.length === 0) {
      throw new Error('密钥池中没有可用的密钥。总密钥数：' + this.keys.length + '。请先在管理面板中测试您的密钥。');
    }

    if (availableKeys.length === 1) {
      const key = availableKeys[0];
      // 老王：单个密钥也使用缓存计算评分
      key.weight_score = this.calculateKeyScore(key, true);
      logInfo('唯一可用密钥 ' + key.id.substring(0, 15) + '...（评分：' + key.weight_score + '）');
      return key;
    }

    // 老王：使用缓存计算评分，大幅提升性能！
    availableKeys.forEach(key => { key.weight_score = this.calculateKeyScore(key, true); });

    const totalScore = availableKeys.reduce((sum, k) => sum + (k.weight_score || 1), 0);
    const probabilities = availableKeys.map(k => (k.weight_score || 1) / totalScore);

    const random = Math.random();
    let cumulativeProbability = 0;
    let selectedKey = null;

    for (let i = 0; i < availableKeys.length; i++) {
      cumulativeProbability += probabilities[i];
      if (random <= cumulativeProbability) {
        selectedKey = availableKeys[i];
        break;
      }
    }

    if (!selectedKey) {
      selectedKey = availableKeys[availableKeys.length - 1];
    }

    selectedKey.last_used_at = new Date().toISOString();
    selectedKey.total_requests = (selectedKey.total_requests || 0) + 1;
    selectedKey.usage_count = (selectedKey.usage_count || 0) + 1;

    // 老王：使用后状态变化，清除缓存（下次会重新计算）
    selectedKey.score_cache = undefined;
    selectedKey.score_cache_time = undefined;

    this.saveKeyPool();

    logInfo('选中密钥 ' + selectedKey.id.substring(0, 15) + '...（评分：' + selectedKey.weight_score + '，成功率：' + (selectedKey.success_rate * 100).toFixed(2) + '%）');

    return selectedKey;
  }

  async updateKeyStats(keyId, success) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) {
      logError('密钥 ' + keyId + ' 未找到，无法更新统计');
      return;
    }

    if (success) {
      key.success_requests = (key.success_requests || 0) + 1;
    } else {
      key.error_count = (key.error_count || 0) + 1;
    }

    key.success_rate = key.total_requests > 0 ? key.success_requests / key.total_requests : 0;

    // 老王：状态变化了，强制重新计算评分（不使用缓存）
    key.weight_score = this.calculateKeyScore(key, false);

    this.saveKeyPool();

    logDebug('密钥 ' + keyId.substring(0, 15) + '... 统计更新：成功率 ' + (key.success_rate * 100).toFixed(2) + '%，评分 ' + key.weight_score);
  }
}

const keyPoolManager = new KeyPoolManager();

export { KeyPoolManager };
export default keyPoolManager;

export async function initializeAuth() {
  logInfo('Key pool manager initialized');
  keyPoolManager.migrateKeyPoolData();
  const stats = keyPoolManager.getStats();
  logInfo('Key pool status: ' + stats.active + ' active, ' + stats.disabled + ' disabled, ' + stats.banned + ' banned');
}

export async function getApiKey() {
  try {
    const result = await keyPoolManager.getNextKey();
    return 'Bearer ' + result.key;
  } catch (error) {
    logError('Failed to get API key from pool', error);
    throw error;
  }
}
