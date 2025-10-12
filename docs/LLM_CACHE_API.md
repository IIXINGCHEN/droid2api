# 📡 LLM 缓存管理 API 文档

> **版本**：v1.0.0
> **基础路径**：`/admin/cache`
> **认证方式**：`x-admin-key` Header

---

## 📋 目录

- [API 概览](#api-概览)
- [缓存统计](#缓存统计)
- [缓存管理](#缓存管理)
- [缓存配置](#缓存配置)
- [错误码](#错误码)

---

## 🔍 API 概览

### 认证

所有 API 请求必须在 Header 中携带管理员密钥：

```http
x-admin-key: your-admin-key-here
```

### 响应格式

**成功响应**：
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**：
```json
{
  "success": false,
  "error": "错误信息"
}
```

---

## 📊 缓存统计

### 1. 获取缓存统计信息

**接口**：`GET /admin/cache/stats`

**描述**：获取缓存命中率、Token 节省等统计数据

**请求示例**：
```bash
curl -X GET http://localhost:3000/admin/cache/stats \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalRequests": 10000,
      "cacheHits": 5678,
      "cacheMisses": 4322,
      "hitRate": "56.78%"
    },
    "performance": {
      "avgResponseTime": {
        "cached": 80,      // ms
        "uncached": 2500   // ms
      },
      "speedup": "31.25x"
    },
    "savings": {
      "tokensSaved": 12500000,
      "costSaved": "$37.50",
      "percentage": "50%"
    },
    "storage": {
      "type": "redis",
      "totalCaches": 1234,
      "totalSize": "256MB",
      "maxSize": "2048MB",
      "usage": "12.5%"
    },
    "timeline": {
      "last24h": {
        "hits": 1234,
        "misses": 567,
        "hitRate": "68.5%"
      },
      "last7d": {
        "hits": 8901,
        "misses": 4567,
        "hitRate": "66.1%"
      }
    }
  }
}
```

---

### 2. 获取缓存趋势数据

**接口**：`GET /admin/cache/stats/trend`

**描述**：获取最近 7 天的缓存命中率趋势

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 天数（默认 7，最大 30） |

**请求示例**：
```bash
curl -X GET "http://localhost:3000/admin/cache/stats/trend?days=7" \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "trend": [
      { "date": "2025-10-07", "hits": 1234, "misses": 567, "hitRate": 68.5 },
      { "date": "2025-10-08", "hits": 1345, "misses": 678, "hitRate": 66.5 },
      { "date": "2025-10-09", "hits": 1456, "misses": 789, "hitRate": 64.9 },
      ...
    ]
  }
}
```

---

## 🗂️ 缓存管理

### 3. 获取缓存列表

**接口**：`GET /admin/cache/list`

**描述**：获取所有缓存条目列表

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 50，最大 200） |
| model | string | 否 | 筛选模型（如 `gpt-4`） |
| sort | string | 否 | 排序方式（`hits`/`created`/`size`） |

**请求示例**：
```bash
curl -X GET "http://localhost:3000/admin/cache/list?page=1&limit=20&sort=hits" \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "total": 1234,
    "page": 1,
    "limit": 20,
    "caches": [
      {
        "cacheKey": "a7f3c2b8e1d9f4a6...",
        "model": "claude-sonnet-4",
        "requestSummary": "如何使用 API...",
        "createdAt": "2025-10-13T12:34:56.789Z",
        "hits": 15,
        "size": 2345,  // bytes
        "ttl": 86400,  // seconds
        "age": 7200    // seconds
      },
      ...
    ]
  }
}
```

---

### 4. 查看缓存详情

**接口**：`GET /admin/cache/:cacheKey`

**描述**：查看单个缓存的详细信息

**请求示例**：
```bash
curl -X GET "http://localhost:3000/admin/cache/a7f3c2b8e1d9f4a6..." \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "cacheKey": "a7f3c2b8e1d9f4a6...",
    "model": "claude-sonnet-4",
    "request": {
      "messages": [
        { "role": "system", "content": "You are a helpful assistant." },
        { "role": "user", "content": "如何使用 API？" }
      ],
      "temperature": 0.7,
      "max_tokens": 2000
    },
    "response": {
      "content": "使用 API 的步骤如下：\n1. 获取 API Key...",
      "usage": {
        "prompt_tokens": 25,
        "completion_tokens": 150,
        "total_tokens": 175
      }
    },
    "metadata": {
      "createdAt": "2025-10-13T12:34:56.789Z",
      "hits": 15,
      "lastHitAt": "2025-10-13T14:56:23.456Z",
      "size": 2345,
      "ttl": 86400,
      "age": 7200
    }
  }
}
```

---

### 5. 删除缓存

**接口**：`DELETE /admin/cache/:cacheKey`

**描述**：删除指定的缓存条目

**请求示例**：
```bash
curl -X DELETE "http://localhost:3000/admin/cache/a7f3c2b8e1d9f4a6..." \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "message": "缓存已删除"
}
```

---

### 6. 清空所有缓存

**接口**：`POST /admin/cache/clear`

**描述**：清空所有缓存数据（谨慎操作！）

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 否 | 只清空指定模型的缓存 |
| confirm | boolean | 是 | 必须为 `true` |

**请求示例**：
```bash
curl -X POST http://localhost:3000/admin/cache/clear \
  -H "x-admin-key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "cleared": 1234,
    "message": "已清空 1234 条缓存"
  }
}
```

---

### 7. 批量删除缓存

**接口**：`POST /admin/cache/batch-delete`

**描述**：批量删除指定的缓存条目

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cacheKeys | string[] | 是 | 缓存键数组 |

**请求示例**：
```bash
curl -X POST http://localhost:3000/admin/cache/batch-delete \
  -H "x-admin-key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "cacheKeys": [
      "a7f3c2b8e1d9f4a6...",
      "b8g4d3c9f2e0g5b7..."
    ]
  }'
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "deleted": 2,
    "failed": 0
  }
}
```

---

## ⚙️ 缓存配置

### 8. 获取缓存配置

**接口**：`GET /admin/cache/config`

**描述**：获取当前的缓存配置

**请求示例**：
```bash
curl -X GET http://localhost:3000/admin/cache/config \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "type": "redis",
    "ttl": 86400,
    "maxSize": 2048,
    "strategy": "fuzzy",
    "autoCleanup": true,
    "cleanupInterval": 3600
  }
}
```

---

### 9. 更新缓存配置

**接口**：`PUT /admin/cache/config`

**描述**：更新缓存配置（需要重启生效）

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| enabled | boolean | 否 | 是否启用缓存 |
| ttl | number | 否 | 缓存过期时间（秒） |
| maxSize | number | 否 | 最大缓存大小（MB） |
| strategy | string | 否 | 匹配策略（`exact`/`fuzzy`） |

**请求示例**：
```bash
curl -X PUT http://localhost:3000/admin/cache/config \
  -H "x-admin-key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "ttl": 43200,
    "strategy": "fuzzy"
  }'
```

**响应示例**：
```json
{
  "success": true,
  "message": "配置已更新，部分配置需要重启生效"
}
```

---

### 10. 缓存健康检查

**接口**：`GET /admin/cache/health`

**描述**：检查缓存系统健康状态

**请求示例**：
```bash
curl -X GET http://localhost:3000/admin/cache/health \
  -H "x-admin-key: your-admin-key"
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "storage": {
      "type": "redis",
      "connected": true,
      "ping": "PONG",
      "latency": 2  // ms
    },
    "performance": {
      "avgQueryTime": 15,  // ms
      "avgStoreTime": 8    // ms
    },
    "issues": []
  }
}
```

---

## ❌ 错误码

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | INVALID_PARAMS | 请求参数无效 |
| 401 | UNAUTHORIZED | 未授权（缺少或错误的 x-admin-key） |
| 404 | CACHE_NOT_FOUND | 缓存不存在 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |
| 503 | CACHE_UNAVAILABLE | 缓存服务不可用 |

**错误响应示例**：
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid admin key"
}
```

---

## 📝 使用示例

### Node.js (axios)

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'x-admin-key': 'your-admin-key'
  }
});

// 获取缓存统计
async function getCacheStats() {
  const res = await client.get('/admin/cache/stats');
  console.log(res.data);
}

// 清空所有缓存
async function clearAllCaches() {
  const res = await client.post('/admin/cache/clear', {
    confirm: true
  });
  console.log(res.data);
}
```

### Python (requests)

```python
import requests

BASE_URL = 'http://localhost:3000'
ADMIN_KEY = 'your-admin-key'

headers = {
    'x-admin-key': ADMIN_KEY
}

# 获取缓存列表
def get_cache_list():
    res = requests.get(f'{BASE_URL}/admin/cache/list', headers=headers)
    return res.json()

# 删除指定缓存
def delete_cache(cache_key):
    res = requests.delete(f'{BASE_URL}/admin/cache/{cache_key}', headers=headers)
    return res.json()
```

---

## 📚 相关文档

- [实施计划](./LLM_CACHE_PLAN.md)
- [技术设计](./LLM_CACHE_DESIGN.md)
- [前端界面设计](./LLM_CACHE_UI.md)

---

**文档版本**：v1.0.0
**最后更新**：2025-10-13
