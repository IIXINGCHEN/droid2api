# 🚀 多级密钥池功能说明

> **BaSui 的超实用功能**：白嫖池用完自动切主力池！省钱又省心！💰

---

## 📖 功能简介

**多级密钥池（Multi-Tier Key Pool）** 是 droid2api v1.5 的全新功能，允许你将密钥分组管理，按优先级使用！

**核心优势**：
- 🆓 **白嫖密钥先用**：捡来的免费密钥优先消耗
- 💎 **主力密钥保护**：正经购买的密钥作为后备，延长使用寿命
- 🔄 **自动降级切换**：高优先级池用完，无缝切换到低优先级池
- 🎯 **灵活分组**：支持任意多个池子（白嫖池、主力池、测试池...）

---

## 🎮 使用场景

### 场景 1：白嫖党福音 😎
```
有 50 个白嫖的免费密钥（38M 额度/个）
有 10 个购买的正式密钥（付费的心疼啊！）

配置：
- 白嫖池（优先级 1）：50 个免费密钥
- 主力池（优先级 2）：10 个付费密钥

结果：先把白嫖池的 50 个用完，再切到主力池！省钱！🎉
```

### 场景 2：测试生产分离 🧪
```
有测试密钥：额度少，但是可以随便测
有生产密钥：额度多，只用于正式流量

配置：
- 测试池（优先级 1）：测试专用
- 生产池（优先级 2）：生产流量

结果：测试流量先走测试池，生产流量才用生产池！
```

### 场景 3：按来源分级 📊
```
有企业赞助密钥：免费但有限制
有个人购买密钥：付费但灵活

配置：
- 赞助池（优先级 1）：先用赞助的
- 个人池（优先级 2）：赞助用完再用自己的

结果：最大化利用免费资源！
```

---

## 🛠️ 配置方法

### 步骤 1：启用多级密钥池

编辑 `data/key_pool.json`，添加 `poolGroups` 和 `config.multiTier`：

```json
{
  "poolGroups": [
    {
      "id": "freebies",
      "name": "白嫖池",
      "priority": 1,
      "description": "捡来的免费密钥"
    },
    {
      "id": "main",
      "name": "主力池",
      "priority": 2,
      "description": "正式购买的密钥"
    }
  ],
  "config": {
    "multiTier": {
      "enabled": true,        // 启用多级密钥池
      "autoFallback": true,   // 自动降级（推荐）
      "strictMode": false     // 严格模式（只用当前优先级，不降级）
    }
  }
}
```

**配置说明**：
- `id`: 池子唯一标识（英文）
- `name`: 池子显示名称（中文）
- `priority`: 优先级（数字越小优先级越高，1 最高）
- `description`: 池子描述（可选）

**multiTier 配置**：
- `enabled: true` - 启用多级密钥池功能
- `autoFallback: true` - 高优先级池用完自动降级到低优先级（推荐）
- `strictMode: false` - 严格模式，只用当前优先级池，不降级（不推荐）

### 步骤 2：给密钥分配池子

**方式 1：手动编辑 key_pool.json**
```json
{
  "keys": [
    {
      "id": "key_xxx",
      "key": "fk-freebies123",
      "poolGroup": "freebies",  // 👈 指定所属池子
      "status": "active"
    },
    {
      "id": "key_yyy",
      "key": "fk-main456",
      "poolGroup": "main",      // 👈 指定所属池子
      "status": "active"
    }
  ]
}
```

**方式 2：通过管理 API 添加密钥时指定池子**
```bash
curl -X POST http://localhost:3000/admin/keys/add \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "fk-freebies123",
    "poolGroup": "freebies",
    "notes": "白嫖来的密钥"
  }'
```

**方式 3：批量导入后手动分配**
```bash
# 1. 先批量导入密钥
curl -X POST http://localhost:3000/admin/keys/import \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["fk-key1", "fk-key2", "fk-key3"]
  }'

# 2. 手动编辑 data/key_pool.json，给每个密钥添加 poolGroup 字段
```

### 步骤 3：测试密钥

```bash
# 测试所有密钥
curl -X POST http://localhost:3000/admin/keys/test-all \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

### 步骤 4：查看池子状态

```bash
# 查看各池子统计信息
curl http://localhost:3000/admin/pool-groups \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

**返回示例**：
```json
[
  {
    "id": "freebies",
    "name": "白嫖池",
    "priority": 1,
    "description": "捡来的免费密钥",
    "total": 50,
    "active": 40,
    "disabled": 5,
    "banned": 5,
    "usage_rate": 0.8
  },
  {
    "id": "main",
    "name": "主力池",
    "priority": 2,
    "description": "正式购买的密钥",
    "total": 100,
    "active": 95,
    "disabled": 3,
    "banned": 2,
    "usage_rate": 0.95
  }
]
```

---

## 🔧 高级用法

### 三级池子配置

```json
{
  "poolGroups": [
    {
      "id": "freebies",
      "name": "白嫖池",
      "priority": 1,
      "description": "捡来的免费密钥，先薅完这些！"
    },
    {
      "id": "backup",
      "name": "备用池",
      "priority": 2,
      "description": "备用密钥，白嫖池用完用这些"
    },
    {
      "id": "main",
      "name": "主力池",
      "priority": 3,
      "description": "核心密钥，最后才用"
    }
  ]
}
```

**工作流程**：
```
白嫖池（50 个）→ 备用池（30 个）→ 主力池（20 个）
```

### 按密钥来源分组

```json
{
  "poolGroups": [
    {
      "id": "github-promo",
      "name": "GitHub 促销池",
      "priority": 1,
      "description": "GitHub 促销活动获得的密钥"
    },
    {
      "id": "referral",
      "name": "推荐奖励池",
      "priority": 2,
      "description": "邀请好友获得的密钥"
    },
    {
      "id": "purchased",
      "name": "购买池",
      "priority": 3,
      "description": "正式购买的密钥"
    }
  ]
}
```

### 动态调整优先级

如果你想临时改变优先级（比如某个池子的密钥快过期了，想先用完），直接修改 `priority` 数字即可：

```json
{
  "poolGroups": [
    {
      "id": "expiring-soon",
      "name": "即将过期池",
      "priority": 1,  // 👈 改为最高优先级
      "description": "这些密钥快过期了，赶紧用！"
    },
    {
      "id": "freebies",
      "name": "白嫖池",
      "priority": 2,  // 👈 降低优先级
      "description": "捡来的免费密钥"
    }
  ]
}
```

---

## 📊 工作原理

### 密钥选择流程

```
1. 用户请求到达
   ↓
2. 筛选所有 active 且测试通过的密钥
   ↓
3. 如果启用了 multiTier，按 priority 排序池子
   ↓
4. 从最高优先级池子（priority=1）开始
   ↓
5. 这个池子有可用密钥吗？
   ├─ 有 → 用这个池子的密钥（结束）
   └─ 没有 → 尝试下一个优先级的池子
   ↓
6. 如果所有池子都没密钥
   ↓
7. 尝试使用"未分组"的密钥（poolGroup 为空或 "default"）
   ↓
8. 如果还是没有，返回错误
```

### 日志示例

启用多级密钥池后，你会在日志中看到：

```
[INFO] 📊 Multi-tier pool enabled: 2 pool groups
[INFO] 🎯 多级密钥池：使用 "白嫖池" (优先级 1)，可用密钥 40 个
[INFO] Using round-robin key: key_xxx [1/40]
```

当白嫖池用完后：

```
[DEBUG] Pool "白嫖池" (priority 1) has no available keys, trying next...
[INFO] 🎯 多级密钥池：使用 "主力池" (优先级 2)，可用密钥 95 个
[INFO] Using round-robin key: key_yyy [1/95]
```

---

## ⚠️ 注意事项

### 1. 向后兼容性

**不影响现有配置**：
- 如果你不配置 `poolGroups`，系统自动降级为单池模式
- 如果你的密钥没有 `poolGroup` 字段，它们会被视为"未分组"密钥，在所有配置的池子用完后才使用

### 2. 密钥测试

**务必测试密钥**：
- 多级密钥池只选择 `status='active'` 且 `last_test_result='success'` 的密钥
- 如果某个池子的密钥都没测试通过，会自动跳过该池子

### 3. 算法兼容性

**所有轮询算法都支持多级密钥池**：
- `round-robin` - 在当前池子内轮询
- `random` - 在当前池子内随机选择
- `least-used` - 在当前池子内选择使用次数最少的
- `weighted-score` - 在当前池子内加权选择
- `least-token-used` - 在当前池子内选择 Token 使用量最少的
- `max-remaining` - 在当前池子内选择剩余 Token 最多的

### 4. 性能影响

**几乎没有性能影响**：
- 筛选逻辑只是简单的数组 filter，O(n) 复杂度
- 对于几百个密钥，筛选耗时 < 1ms

---

## 🐛 故障排查

### 问题 1：密钥选择没有按优先级来

**可能原因**：
1. `config.multiTier.enabled` 没有设置为 `true`
2. 密钥没有 `poolGroup` 字段
3. `poolGroups` 配置格式错误

**解决方法**：
```bash
# 1. 检查配置
cat data/key_pool.json | grep -A 3 multiTier

# 2. 检查密钥是否有 poolGroup
cat data/key_pool.json | grep poolGroup

# 3. 查看日志
tail -f logs/app.log | grep "多级密钥池"
```

### 问题 2：白嫖池用完了但没切换到主力池

**可能原因**：
1. 主力池的密钥没有测试通过
2. 主力池的密钥 status 不是 'active'
3. `autoFallback` 设置为 `false`

**解决方法**：
```bash
# 1. 测试所有密钥
curl -X POST http://localhost:3000/admin/keys/test-all \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"

# 2. 查看池子状态
curl http://localhost:3000/admin/pool-groups \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"

# 3. 确保 autoFallback=true
# 编辑 data/key_pool.json，检查 config.multiTier.autoFallback
```

### 问题 3：想临时禁用多级密钥池

**方法 1：修改配置文件**
```json
{
  "config": {
    "multiTier": {
      "enabled": false  // 👈 改为 false
    }
  }
}
```

**方法 2：通过 API**
```bash
curl -X PUT http://localhost:3000/admin/config \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "multiTier": {
      "enabled": false
    }
  }'
```

---

## 💡 最佳实践

### 1. 白嫖池优先

```json
{
  "poolGroups": [
    {
      "id": "freebies",
      "name": "白嫖池",
      "priority": 1,
      "description": "免费密钥，优先消耗"
    },
    {
      "id": "main",
      "name": "主力池",
      "priority": 2,
      "description": "付费密钥，备用"
    }
  ]
}
```

**理由**：先把免费的用完，保护付费密钥！

### 2. 定期检查池子状态

```bash
# 每天检查一次
curl http://localhost:3000/admin/pool-groups \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  | jq '.[] | {name: .name, active: .active, banned: .banned}'
```

**理由**：及时发现密钥被封禁或耗尽！

### 3. 自动化管理

**脚本示例**：
```bash
#!/bin/bash
# auto-check-pools.sh

ADMIN_KEY="your-admin-key"
API_URL="http://localhost:3000"

# 检查各池子状态
STATS=$(curl -s "$API_URL/admin/pool-groups" -H "Authorization: Bearer $ADMIN_KEY")

# 如果白嫖池可用密钥 < 10，发送告警
FREEBIES_ACTIVE=$(echo "$STATS" | jq '.[] | select(.id=="freebies") | .active')

if [ "$FREEBIES_ACTIVE" -lt 10 ]; then
  echo "⚠️ 警告：白嫖池只剩 $FREEBIES_ACTIVE 个可用密钥了！"
  # 发送通知（钉钉/邮件/Telegram）
fi
```

---

## 🎉 总结

**多级密钥池**是 droid2api 的杀手级功能！它让你可以：
- ✅ 最大化利用白嫖密钥
- ✅ 保护正经购买的密钥
- ✅ 自动化管理密钥优先级
- ✅ 零停机切换密钥池

**开始使用**：
1. 复制 `data/key_pool.example.json` 到 `data/key_pool.json`
2. 修改 `poolGroups` 和 `multiTier.enabled`
3. 给密钥分配 `poolGroup`
4. 测试密钥
5. 开始薅羊毛！🎉

**有问题？**
- 查看日志：`tail -f logs/app.log | grep "多级密钥池"`
- 查看池子状态：`GET /admin/pool-groups`
- 查看文档：`docs/MULTI_TIER_POOL.md`（就是本文档！）

---

**祝你薅羊毛愉快！💰 —— BaSui 敬上**
