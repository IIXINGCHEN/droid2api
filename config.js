import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config = null;

export function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'data', 'config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configData);
    return config;
  } catch (error) {
    throw new Error(`Failed to load data/config.json: ${error.message}`);
  }
}

export function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

export function getModelById(modelId) {
  const cfg = getConfig();
  return cfg.models.find(m => m.id === modelId);
}

export function getEndpointByType(type) {
  const cfg = getConfig();
  return cfg.endpoint.find(e => e.name === type);
}

export function isDevMode() {
  return process.env.NODE_ENV === 'development';
}

export function getPort() {
  const cfg = getConfig();
  return cfg.port || 3000;
}

export function getSystemPrompt() {
  const cfg = getConfig();
  return cfg.system_prompt || '';
}

export function getModelReasoning(modelId) {
  const model = getModelById(modelId);
  if (!model || !model.reasoning) {
    return null;
  }
  const reasoningLevel = model.reasoning.toLowerCase();
  if (['low', 'medium', 'high', 'auto'].includes(reasoningLevel)) {
    return reasoningLevel;
  }
  return null;
}

export function getUserAgent() {
  const cfg = getConfig();
  return cfg.user_agent || 'factory-cli/0.19.3';
}

// 获取限制配置
export function getLimits() {
  const cfg = getConfig();
  return {
    notes_max_length: parseInt(process.env.NOTES_MAX_LENGTH) || cfg.limits?.notes_max_length || 1000,
    max_json_log_size: parseInt(process.env.MAX_JSON_LOG_SIZE) || cfg.limits?.max_json_log_size || 5000
  };
}

export function getNotesMaxLength() {
  return getLimits().notes_max_length;
}

export function getMaxJsonLogSize() {
  return getLimits().max_json_log_size;
}

// 获取密钥池配置（完整版，支持所有环境变量覆盖）
export function getKeyPoolConfig() {
  const cfg = getConfig();
  const keyPoolCfg = cfg.key_pool || {};

  // 辅助函数：解析布尔值环境变量
  const parseBool = (envVar, defaultValue) => {
    if (!envVar) return defaultValue;
    return envVar.toLowerCase() === 'true' || envVar === '1';
  };

  return {
    // 轮询算法（env > config.json > 默认值）
    algorithm: process.env.KEY_POOL_ALGORITHM || keyPoolCfg.algorithm || 'round-robin',

    // 重试配置
    retry: {
      enabled: parseBool(process.env.KEY_POOL_RETRY_ENABLED, keyPoolCfg.retry?.enabled ?? true),
      maxRetries: parseInt(process.env.KEY_POOL_RETRY_MAX) || keyPoolCfg.retry?.maxRetries || 3,
      retryDelay: parseInt(process.env.KEY_POOL_RETRY_DELAY_MS) || keyPoolCfg.retry?.retryDelay || 1000
    },

    // 自动封禁配置
    autoBan: {
      enabled: parseBool(process.env.KEY_POOL_AUTO_BAN_ENABLED, keyPoolCfg.autoBan?.enabled ?? true),
      errorThreshold: parseInt(process.env.KEY_POOL_ERROR_THRESHOLD) || keyPoolCfg.autoBan?.errorThreshold || 5,
      ban402: parseBool(process.env.KEY_POOL_BAN_402, keyPoolCfg.autoBan?.ban402 ?? true),
      ban401: parseBool(process.env.KEY_POOL_BAN_401, keyPoolCfg.autoBan?.ban401 ?? false)
    },

    // 性能配置
    performance: {
      concurrentLimit: parseInt(process.env.KEY_POOL_CONCURRENT_LIMIT) || keyPoolCfg.performance?.concurrentLimit || 100,
      requestTimeout: parseInt(process.env.KEY_POOL_REQUEST_TIMEOUT_MS) || keyPoolCfg.performance?.requestTimeout || 10000
    },

    // 🚀 BaSui：多级密钥池配置（Multi-Tier Pool）
    multiTier: {
      enabled: parseBool(process.env.KEY_POOL_MULTI_TIER_ENABLED, keyPoolCfg.multiTier?.enabled ?? false),
      autoFallback: parseBool(process.env.KEY_POOL_MULTI_TIER_AUTO_FALLBACK, keyPoolCfg.multiTier?.autoFallback ?? true)
    },

    // 向后兼容：保留旧字段
    retry_delay_ms: parseInt(process.env.KEY_POOL_RETRY_DELAY_MS) || keyPoolCfg.retry_delay_ms || 1000,
    request_timeout_ms: parseInt(process.env.KEY_POOL_REQUEST_TIMEOUT_MS) || keyPoolCfg.request_timeout_ms || 10000,
    batch_test_interval_ms: parseInt(process.env.KEY_POOL_BATCH_TEST_INTERVAL_MS) || keyPoolCfg.batch_test_interval_ms || 500,
    cache_ttl_ms: parseInt(process.env.KEY_POOL_CACHE_TTL_MS) || keyPoolCfg.cache_ttl_ms || 300000
  };
}

// 获取推理token配置
export function getReasoningTokens() {
  const cfg = getConfig();
  return {
    low: parseInt(process.env.REASONING_BUDGET_LOW) || cfg.reasoning_tokens?.low || 4096,
    medium: parseInt(process.env.REASONING_BUDGET_MEDIUM) || cfg.reasoning_tokens?.medium || 12288,
    high: parseInt(process.env.REASONING_BUDGET_HIGH) || cfg.reasoning_tokens?.high || 24576
  };
}

export function getReasoningBudget(level) {
  const tokens = getReasoningTokens();
  return tokens[level] || null;
}

// 获取余额同步配置
export function getBalanceSyncConfig() {
  const cfg = getConfig();
  return {
    sync_interval_minutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || cfg.balance_sync?.sync_interval_minutes || 30,
    save_interval_minutes: parseInt(process.env.BALANCE_SAVE_INTERVAL_MINUTES) || cfg.balance_sync?.save_interval_minutes || 5
  };
}
