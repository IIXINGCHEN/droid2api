# 🚀 droid2api 大模型缓存实施计划

> **文档版本**：v1.0.0
> **创建日期**：2025-10-13
> **作者**：BaSui AI Team
> **状态**：设计阶段

---

## 📋 目录

- [项目概述](#项目概述)
- [核心价值](#核心价值)
- [技术方案](#技术方案)
- [实施路线图](#实施路线图)
- [详细设计](#详细设计)
- [前端界面设计](#前端界面设计)
- [测试计划](#测试计划)
- [风险评估](#风险评估)
- [参考文档](#参考文档)

---

## 📖 项目概述

### 背景

droid2api 作为 OpenAI 兼容的 API 代理服务器，目前每个请求都需要调用上游 LLM API（Factory AI / OpenAI / Anthropic），存在以下问题：

1. **成本高昂**：大量重复请求消耗 Token
2. **响应慢**：每次请求需等待 2-5 秒
3. **资源浪费**：相同问题重复推理

### 目标

通过引入**智能缓存系统**，实现：

- ✅ **降低成本**：Token 费用节省 30-60%
- ✅ **提升性能**：缓存命中时响应速度提升 10-100 倍
- ✅ **优化体验**：常见问题秒回，用户满意度提升

### 适用场景

1. **FAQ 场景**：客服机器人、知识库问答
2. **重复查询**：代码补全、文档解释
3. **固定模板**：邮件生成、摘要提取
4. **多用户共享**：相同问题不同用户询问

---

## 💎 核心价值

### 1. 成本节省

| 指标 | 现状 | 缓存后 | 节省 |
|------|------|--------|------|
| 日均请求 | 10,000 | 10,000 | - |
| 缓存命中率 | 0% | 50% | - |
| 日均 Token | 50M | 25M | **50%** |
| 月成本（$0.003/1K） | $450 | $225 | **$225/月** |

### 2. 性能提升

| 指标 | 现状 | 缓存后 | 提升 |
|------|------|--------|------|
| 平均延迟 | 2,500ms | 800ms | **68% ↓** |
| P99 延迟 | 5,000ms | 1,200ms | **76% ↓** |
| 吞吐量 | 100 RPS | 500 RPS | **5倍 ↑** |

### 3. 用户体验

- ⚡ 常见问题秒回（50ms vs 2500ms）
- 🎯 响应更稳定（缓存不受上游 API 波动影响）
- 💰 用户成本更低（按量计费时节省费用）

---

## 🏗️ 技术方案

### 架构设计

```
客户端请求
  ↓
API 认证中间件
  ↓
日志收集中间件
  ↓
统计追踪中间件
  ↓
🆕 【缓存查询中间件】 ← 新增
  ├─ 缓存命中 → 模拟流式返回 → 客户端 ✅
  └─ 缓存未命中 ↓
路由层（routes.js）
  ↓
密钥池管理
  ↓
LLM API 调用
  ↓
格式转换层
  ↓
🆕 【缓存存储中间件】 ← 新增
  ↓
返回客户端
```

### 核心组件

#### 1. 缓存存储层

**方案选择：Redis（推荐）**

```javascript
// 优点
✅ 持久化（重启不丢失）
✅ 支持 TTL（自动过期）
✅ 支持集群（多机部署）
✅ 性能优秀（毫秒级）
✅ 已在项目中支持（utils/redis-cache.js）

// 配置参数
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
CACHE_TTL=86400        # 24小时
CACHE_MAX_SIZE=1000    # 1000MB
```

**备选方案：内存 LRU Cache**

```javascript
// 使用 lru-cache npm 包
// 优点：无需外部依赖、速度极快
// 缺点：重启丢失、内存限制
```

#### 2. 缓存键生成策略

**方案：混合匹配（精确 + 模糊）**

```javascript
function generateCacheKey(request, userId) {
  const {
    model,           // 必须匹配
    messages,        // 核心内容匹配
    // temperature,  // 可选：忽略采样参数
    // max_tokens,   // 可选：忽略长度限制
  } = request;

  // 提取 system prompt
  const systemPrompt = messages
    .find(m => m.role === 'system')?.content || '';

  // 提取 user messages（只取前 200 字符）
  const userMessage = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n')
    .substring(0, 200);

  // 生成 SHA256 哈希
  const data = {
    model,
    systemPrompt,
    userMessage,
    userId,  // 用户隔离
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}
```

**缓存键格式**：`llm:cache:{hash}`

**示例**：
```
llm:cache:a7f3c2b8e1d9f4a6...
```

#### 3. 流式响应缓存

**挑战**：大部分 LLM 请求都是流式的（SSE），如何缓存？

**解决方案**：完整缓存 + 模拟回放

```javascript
// 1. 首次请求：实时流式返回 + 后台记录
async function handleStreamingRequest(req, res) {
  const cacheKey = generateCacheKey(req.body, req.userId);

  // 检查缓存
  const cached = await redis.get(cacheKey);
  if (cached) {
    logInfo('[Cache] HIT', { cacheKey });
    return simulateStreamingResponse(res, JSON.parse(cached));
  }

  logInfo('[Cache] MISS', { cacheKey });

  // 缓存未命中，调用真实 API
  const chunks = [];
  const stream = await callUpstreamAPI(req.body);

  stream.on('data', chunk => {
    chunks.push(chunk);  // 记录完整响应
    res.write(chunk);     // 实时返回给客户端
  });

  stream.on('end', () => {
    // 保存到缓存
    const cacheData = {
      chunks,
      usage: extractUsage(chunks),
      timestamp: Date.now(),
      model: req.body.model,
    };
    redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cacheData));

    // 更新统计
    cacheStats.miss();

    res.end();
  });
}

// 2. 缓存命中：模拟流式返回
function simulateStreamingResponse(res, cachedData) {
  const { chunks } = cachedData;
  let i = 0;

  // 设置响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('X-Cache', 'HIT');  // 标记缓存命中
  res.setHeader('X-Cache-Age', Date.now() - cachedData.timestamp);

  // 每 50ms 发送一个 chunk，模拟真实流式输出
  const interval = setInterval(() => {
    if (i >= chunks.length) {
      clearInterval(interval);
      res.end();
      cacheStats.hit();  // 更新统计
      return;
    }
    res.write(chunks[i++]);
  }, 50);
}
```

#### 4. 缓存统计追踪

```javascript
class CacheStats {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.tokensSaved = 0;
  }

  hit() {
    this.hits++;
  }

  miss() {
    this.misses++;
  }

  addTokensSaved(count) {
    this.tokensSaved += count;
  }

  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      total,
      hitRate: `${hitRate}%`,
      tokensSaved: this.tokensSaved,
      costSaved: `$${(this.tokensSaved / 1000 * 0.003).toFixed(2)}`,
    };
  }
}
```

---

## 🗓️ 实施路线图

### Phase 1: MVP 最小可行产品（1-2 天）⭐

**目标**：快速验证缓存效果

**功能清单**：
- ✅ 基于内存的 LRU 缓存（使用 `lru-cache` npm 包）
- ✅ 精确匹配策略（完整请求哈希）
- ✅ 只缓存非流式响应（`stream=false`）
- ✅ 简单的命中率统计（内存计数）
- ✅ 环境变量配置（启用/禁用缓存）

**文件结构**：
```
utils/
  └── llm-cache.js          # 缓存核心逻辑（200行）

middleware/
  └── cache-middleware.js   # 缓存中间件（100行）

routes.js                   # 集成缓存中间件（+10行）
```

**配置项**（`.env`）：
```bash
# 缓存配置
CACHE_ENABLED=true            # 启用缓存
CACHE_TYPE=memory             # 内存缓存
CACHE_MAX_SIZE=1000           # 最大 1000 条
CACHE_TTL=86400               # 24 小时
```

**预期效果**：
- Token 费用立刻降低 10-20%
- 命中请求响应时间 < 100ms

---

### Phase 2: 生产级优化（3-5 天）🔥

**目标**：生产环境可用

**新增功能**：
- ✅ Redis 持久化存储
- ✅ 流式响应缓存 + 模拟回放
- ✅ 模糊匹配策略（忽略部分参数）
- ✅ 前端管理界面（独立 Tab 页）
- ✅ 缓存清理和管理 API
- ✅ 详细的统计报表

**新增文件**：
```
api/
  └── cache-routes.js         # 缓存管理 API（300行）

public/
  ├── cache-management.js     # 前端缓存管理逻辑（400行）
  └── cache-stats.js          # 前端统计图表（200行）

utils/
  ├── cache-stats.js          # 统计追踪（150行）
  └── cache-cleanup.js        # 自动清理任务（100行）
```

**配置项**（`.env`）：
```bash
# Redis 缓存配置
CACHE_ENABLED=true
CACHE_TYPE=redis              # 切换到 Redis
CACHE_TTL=86400
CACHE_MAX_SIZE=2048           # 2GB
CACHE_STRATEGY=fuzzy          # 模糊匹配
```

**前端界面**：

新增 **"缓存管理"** Tab 页，包含：

1. **统计卡片**
   ```
   📊 总缓存数: 1,234
   ✅ 命中次数: 5,678
   ❌ 未命中次数: 2,345
   📈 命中率: 70.8%
   💰 节省 Token: 12.5M (约 $25)
   ⚡ 平均响应时间: 80ms (vs 2.5s)
   ```

2. **缓存列表**
   ```
   | 请求摘要 | 模型 | 创建时间 | 命中次数 | 大小 | 操作 |
   | "如何使用..." | claude-sonnet-4 | 2小时前 | 15 | 2.3KB | 查看/删除 |
   ```

3. **缓存配置**
   ```
   ✅ 启用缓存
   TTL: [1h] [6h] [24h] [永久]
   策略: [精确匹配] [模糊匹配]
   最大容量: 2000 MB
   自动清理: 开启
   ```

4. **实时日志**
   ```
   [13:45:23] ✅ Cache HIT - "如何使用API" (80ms)
   [13:45:25] ❌ Cache MISS - "什么是AI" (2.5s)
   ```

**预期效果**：
- Token 费用降低 30-60%
- 命中请求响应时间 < 100ms
- 生产环境稳定运行

---

### Phase 3: 高级特性（可选，1-2 周）

**目标**：极致优化

**新增功能**：
- ✅ 语义匹配（基于 Embedding）
- ✅ 智能预热（预测常见问题）
- ✅ 缓存分级（热/温/冷）
- ✅ A/B 测试（对比缓存效果）
- ✅ 缓存预测分析（推荐常见问题）

**技术方案**：
```javascript
// 1. 语义匹配
async function semanticCacheQuery(message) {
  // 生成 Embedding（使用 OpenAI text-embedding-ada-002）
  const embedding = await generateEmbedding(message);

  // 向量相似度搜索（使用 Redis Vector Search）
  const similar = await redis.ft.search('cache:embeddings', {
    vector: embedding,
    k: 5,  // 返回前 5 个最相似的
  });

  // 如果相似度 > 0.95，认为命中缓存
  if (similar[0].score > 0.95) {
    return similar[0].data;
  }
  return null;
}
```

**预期效果**：
- Token 费用降低 60-80%
- 缓存命中率提升至 70-90%

---

## 📐 详细设计

### 文件结构

```
droid2api/
├── utils/
│   ├── llm-cache.js           # 缓存核心逻辑
│   ├── cache-stats.js         # 统计追踪
│   └── cache-cleanup.js       # 自动清理任务
│
├── middleware/
│   └── cache-middleware.js    # 缓存中间件
│
├── api/
│   └── cache-routes.js        # 缓存管理 API
│
├── public/
│   ├── cache-management.js    # 前端缓存管理逻辑
│   └── cache-stats.js         # 前端统计图表
│
├── docs/
│   ├── LLM_CACHE_PLAN.md      # 本文档
│   ├── LLM_CACHE_API.md       # API 接口文档
│   └── LLM_CACHE_UI.md        # 前端界面设计
│
└── .env.example
    └── # 新增缓存配置项
```

### 代码示例

#### 1. utils/llm-cache.js

```javascript
import crypto from 'crypto';
import LRU from 'lru-cache';
import { getRedisClient } from './redis-cache.js';
import { logInfo, logDebug } from '../logger.js';

const CACHE_PREFIX = 'llm:cache:';

class LLMCache {
  constructor(options = {}) {
    this.type = options.type || 'memory';  // 'memory' | 'redis'
    this.ttl = options.ttl || 86400;       // 默认 24 小时
    this.maxSize = options.maxSize || 1000;

    if (this.type === 'memory') {
      this.cache = new LRU({
        max: this.maxSize,
        ttl: this.ttl * 1000,
      });
    } else {
      this.redis = getRedisClient();
    }
  }

  // 生成缓存键
  generateKey(request, userId) {
    const { model, messages } = request;

    const systemPrompt = messages
      .find(m => m.role === 'system')?.content || '';

    const userMessage = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n')
      .substring(0, 200);

    const data = { model, systemPrompt, userMessage, userId };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // 查询缓存
  async get(cacheKey) {
    if (this.type === 'memory') {
      return this.cache.get(cacheKey);
    } else {
      const value = await this.redis.get(CACHE_PREFIX + cacheKey);
      return value ? JSON.parse(value) : null;
    }
  }

  // 存储缓存
  async set(cacheKey, data) {
    if (this.type === 'memory') {
      this.cache.set(cacheKey, data);
    } else {
      await this.redis.setex(
        CACHE_PREFIX + cacheKey,
        this.ttl,
        JSON.stringify(data)
      );
    }
  }

  // 删除缓存
  async delete(cacheKey) {
    if (this.type === 'memory') {
      this.cache.delete(cacheKey);
    } else {
      await this.redis.del(CACHE_PREFIX + cacheKey);
    }
  }

  // 清空所有缓存
  async clear() {
    if (this.type === 'memory') {
      this.cache.clear();
    } else {
      const keys = await this.redis.keys(CACHE_PREFIX + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  // 获取缓存统计
  async getStats() {
    if (this.type === 'memory') {
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        usage: (this.cache.size / this.maxSize * 100).toFixed(2) + '%',
      };
    } else {
      const keys = await this.redis.keys(CACHE_PREFIX + '*');
      return {
        size: keys.length,
        maxSize: this.maxSize,
        usage: 'N/A',
      };
    }
  }
}

export default LLMCache;
```

#### 2. middleware/cache-middleware.js

```javascript
import LLMCache from '../utils/llm-cache.js';
import CacheStats from '../utils/cache-stats.js';
import { logInfo, logDebug } from '../logger.js';

const cache = new LLMCache({
  type: process.env.CACHE_TYPE || 'memory',
  ttl: parseInt(process.env.CACHE_TTL || '86400'),
  maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
});

const stats = new CacheStats();

// 缓存查询中间件（在路由之前）
export async function cacheQueryMiddleware(req, res, next) {
  // 只缓存 POST /v1/chat/completions 和 /v1/messages
  if (!req.path.match(/\/(chat\/completions|messages)$/)) {
    return next();
  }

  // 如果缓存未启用，跳过
  if (process.env.CACHE_ENABLED !== 'true') {
    return next();
  }

  try {
    const cacheKey = cache.generateKey(req.body, req.userId);
    const cached = await cache.get(cacheKey);

    if (cached) {
      logInfo('[Cache] HIT', { cacheKey, age: Date.now() - cached.timestamp });
      stats.hit();

      // 设置缓存标记头
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Age', Date.now() - cached.timestamp);

      // 如果是流式请求，模拟流式返回
      if (req.body.stream) {
        return simulateStreamingResponse(res, cached);
      } else {
        return res.json(cached.response);
      }
    }

    // 缓存未命中，继续处理
    logDebug('[Cache] MISS', { cacheKey });
    stats.miss();
    res.setHeader('X-Cache', 'MISS');

    // 将 cacheKey 附加到请求对象，供后续存储使用
    req.cacheKey = cacheKey;

    next();
  } catch (err) {
    logError('[Cache] Query error', err);
    next();  // 缓存失败不影响正常流程
  }
}

// 缓存存储中间件（在响应之后）
export function cacheStoreMiddleware(req, res, responseData) {
  if (!req.cacheKey || process.env.CACHE_ENABLED !== 'true') {
    return;
  }

  try {
    const cacheData = {
      response: responseData,
      usage: responseData.usage,
      timestamp: Date.now(),
      model: req.body.model,
    };

    cache.set(req.cacheKey, cacheData);

    if (cacheData.usage) {
      stats.addTokensSaved(cacheData.usage.total_tokens);
    }

    logDebug('[Cache] Stored', { cacheKey: req.cacheKey });
  } catch (err) {
    logError('[Cache] Store error', err);
  }
}

// 模拟流式响应
function simulateStreamingResponse(res, cachedData) {
  const { chunks } = cachedData;
  let i = 0;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    if (i >= chunks.length) {
      clearInterval(interval);
      res.end();
      return;
    }
    res.write(chunks[i++]);
  }, 50);  // 每 50ms 发送一个 chunk
}

export { cache, stats };
```

---

## 🎨 前端界面设计

详见：[LLM_CACHE_UI.md](./LLM_CACHE_UI.md)

---

## 🧪 测试计划

### 单元测试

```javascript
// tests/llm-cache.test.js
describe('LLMCache', () => {
  test('生成缓存键', () => {
    const request = {
      model: 'claude-sonnet-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, world!' },
      ],
    };
    const key = cache.generateKey(request, 'user123');
    expect(key).toHaveLength(64);  // SHA256
  });

  test('缓存存取', async () => {
    await cache.set('test-key', { data: 'test' });
    const result = await cache.get('test-key');
    expect(result.data).toBe('test');
  });
});
```

### 集成测试

```javascript
// tests/cache-middleware.test.js
describe('Cache Middleware', () => {
  test('缓存命中', async () => {
    // 第一次请求
    const res1 = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'gpt-4', messages: [...], stream: false });
    expect(res1.headers['x-cache']).toBe('MISS');

    // 第二次请求（相同内容）
    const res2 = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'gpt-4', messages: [...], stream: false });
    expect(res2.headers['x-cache']).toBe('HIT');
  });
});
```

### 性能测试

```bash
# 使用 autocannon 进行压测
npx autocannon -c 100 -d 30 \
  -m POST \
  -H "Authorization: Bearer xxx" \
  -b '{"model":"gpt-4","messages":[...]}' \
  http://localhost:3000/v1/chat/completions

# 预期结果
# 缓存命中时：吞吐量 > 1000 RPS
# 缓存未命中时：吞吐量 < 100 RPS
```

---

## ⚠️ 风险评估

### 1. 缓存污染

**风险**：错误响应被缓存

**解决方案**：
- ✅ 只缓存 200 状态码的成功响应
- ✅ 异常响应不缓存
- ✅ 定期健康检查，清理异常缓存

### 2. 隐私泄露

**风险**：不同用户缓存命中相同内容

**解决方案**：
- ✅ 缓存键中包含 `userId`
- ✅ 敏感信息不缓存（正则匹配密码、密钥等）
- ✅ 用户可手动清除自己的缓存

### 3. 缓存一致性

**风险**：模型更新后，旧缓存仍然返回旧结果

**解决方案**：
- ✅ 缓存键中包含 `model` 版本
- ✅ 模型更新时自动清空相关缓存
- ✅ 合理设置 TTL（建议 24 小时）

### 4. 内存/存储溢出

**风险**：缓存无限增长

**解决方案**：
- ✅ 设置最大缓存大小（LRU 淘汰）
- ✅ 定期清理过期缓存（Cron Job）
- ✅ 监控缓存使用率（告警）

---

## 📚 参考文档

- [技术设计文档](./LLM_CACHE_DESIGN.md)
- [API 接口文档](./LLM_CACHE_API.md)
- [前端界面设计](./LLM_CACHE_UI.md)
- [Redis 官方文档](https://redis.io/docs/)
- [lru-cache npm 包](https://www.npmjs.com/package/lru-cache)

---

## 📝 变更记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0.0 | 2025-10-13 | BaSui AI Team | 初始版本，完成架构设计 |

---

**文档结束**
