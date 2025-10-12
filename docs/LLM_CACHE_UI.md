# 🎨 LLM 缓存管理前端界面设计

> **版本**：v1.0.0
> **最后更新**：2025-10-13
> **配套文档**：[实施计划](./LLM_CACHE_PLAN.md) | [API 文档](./LLM_CACHE_API.md)

---

## 📋 目录

- [设计原则](#设计原则)
- [整体布局](#整体布局)
- [功能模块](#功能模块)
- [交互流程](#交互流程)
- [实现细节](#实现细节)
- [响应式设计](#响应式设计)

---

## 🎯 设计原则

### 1. 用户体验优先

- **直观可视化**：数据图表化展示（饼图、折线图、表格）
- **实时反馈**：操作后立即更新数据，避免手动刷新
- **渐进式披露**：高级功能隐藏在"展开"按钮后，不干扰主流程
- **错误提示友好**：明确告知用户错误原因和解决方法

### 2. 保持项目风格一致

- **复用现有 UI 组件**：与密钥池管理界面保持一致
- **配色方案**：沿用 `style.css` 的蓝色主题 (`#3498db`)
- **图标风格**：Emoji + 文字组合（如 "📊 缓存统计"）
- **动画效果**：平滑过渡 (300ms transition)

### 3. 性能优化

- **懒加载数据**：只在切换到 "缓存管理" Tab 时加载数据
- **分页显示**：缓存列表默认 50 条/页，支持调整
- **防抖处理**：搜索框输入 500ms 后才触发请求

---

## 🖼️ 整体布局

### 界面结构

```
┌────────────────────────────────────────────┐
│  🏠 首页  |  🔑 密钥池  |  📊 缓存管理  │ ← Tab 导航栏
└────────────────────────────────────────────┘
┌────────────────────────────────────────────┐
│  📈 缓存统计卡片（4 个核心指标）            │
│  ┌─────┬─────┬─────┬─────┐                │
│  │命中率│节省│延迟│存储│                    │
│  └─────┴─────┴─────┴─────┘                │
├────────────────────────────────────────────┤
│  📊 趋势图（7天缓存命中率）                │
│  [Chart.js 折线图]                         │
├────────────────────────────────────────────┤
│  🗂️ 缓存列表                               │
│  ┌──────────────────────────────────────┐ │
│  │ [搜索框] [筛选器]  [批量删除] [清空] │ │
│  ├──────────────────────────────────────┤ │
│  │ Model | 请求摘要 | 命中次数 | 操作   │ │
│  │ claude-sonnet-4 | "如何..." | 15 | 🗑️│ │
│  │ gpt-4 | "写一个..." | 8  | 🗑️       │ │
│  └──────────────────────────────────────┘ │
│  [分页器] 1 2 3 ... 10                    │
├────────────────────────────────────────────┤
│  ⚙️ 缓存配置                               │
│  [启用缓存] [TTL] [策略] [自动清理]       │
└────────────────────────────────────────────┘
```

---

## 🧩 功能模块

### 1. 缓存统计卡片

**显示内容**：
- **命中率**：`56.78%` (绿色 > 50%, 黄色 30-50%, 红色 < 30%)
- **Token 节省**：`12,500,000 tokens (~$37.50)`
- **平均延迟**：`80ms (缓存) vs 2500ms (未缓存)`
- **存储使用**：`256MB / 2GB (12.5%)`

**HTML 结构**：
```html
<div class="stats-grid">
    <div class="stat-card hit-rate">
        <div class="stat-icon">🎯</div>
        <div class="stat-content">
            <div class="stat-label">缓存命中率</div>
            <div class="stat-value" data-rate="56.78">56.78%</div>
            <div class="stat-trend">↑ 比昨天提升 5%</div>
        </div>
    </div>

    <div class="stat-card tokens-saved">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
            <div class="stat-label">Token 节省</div>
            <div class="stat-value">12,500,000</div>
            <div class="stat-detail">约节省 $37.50</div>
        </div>
    </div>

    <div class="stat-card latency">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
            <div class="stat-label">平均延迟</div>
            <div class="stat-value">80ms</div>
            <div class="stat-comparison">未缓存: 2500ms (快 31x)</div>
        </div>
    </div>

    <div class="stat-card storage">
        <div class="stat-icon">💾</div>
        <div class="stat-content">
            <div class="stat-label">存储使用</div>
            <div class="stat-value">256MB / 2GB</div>
            <div class="stat-progress">
                <div class="progress-bar" style="width: 12.5%"></div>
            </div>
        </div>
    </div>
</div>
```

**CSS 样式**：
```css
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    display: flex;
    align-items: center;
    padding: 25px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    color: white;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
    transition: transform 0.3s ease;
}

.stat-card:hover {
    transform: translateY(-5px);
}

.stat-icon {
    font-size: 3em;
    margin-right: 20px;
}

.stat-value {
    font-size: 2em;
    font-weight: bold;
    margin: 5px 0;
}

/* 命中率颜色动态变化 */
.stat-card.hit-rate .stat-value[data-rate] {
    color: var(--hit-rate-color);
}
```

**JavaScript 逻辑**：
```javascript
async function refreshCacheStats() {
    try {
        const response = await apiRequest('/admin/cache/stats');
        const { overview, performance, savings, storage } = response.data;

        // 更新命中率卡片
        const hitRateCard = document.querySelector('.stat-card.hit-rate');
        const hitRateValue = hitRateCard.querySelector('.stat-value');
        const hitRate = parseFloat(overview.hitRate);

        hitRateValue.textContent = overview.hitRate;
        hitRateValue.setAttribute('data-rate', hitRate);

        // 动态设置颜色
        if (hitRate >= 50) {
            hitRateCard.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
        } else if (hitRate >= 30) {
            hitRateCard.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        } else {
            hitRateCard.style.background = 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
        }

        // 更新 Token 节省卡片
        const tokensSavedCard = document.querySelector('.stat-card.tokens-saved');
        tokensSavedCard.querySelector('.stat-value').textContent = savings.tokensSaved.toLocaleString();
        tokensSavedCard.querySelector('.stat-detail').textContent = `约节省 ${savings.costSaved}`;

        // 更新延迟卡片
        const latencyCard = document.querySelector('.stat-card.latency');
        latencyCard.querySelector('.stat-value').textContent = `${performance.avgResponseTime.cached}ms`;
        latencyCard.querySelector('.stat-comparison').textContent =
            `未缓存: ${performance.avgResponseTime.uncached}ms (快 ${performance.speedup})`;

        // 更新存储卡片
        const storageCard = document.querySelector('.stat-card.storage');
        storageCard.querySelector('.stat-value').textContent = `${storage.totalSize} / ${storage.maxSize}`;
        storageCard.querySelector('.progress-bar').style.width = storage.usage;

    } catch (error) {
        console.error('❌ 加载缓存统计失败:', error);
        showToast('加载统计数据失败', 'error');
    }
}
```

---

### 2. 趋势图

**技术选型**：使用 [Chart.js](https://www.chartjs.org/) 绘制折线图

**HTML 结构**：
```html
<div class="chart-container">
    <h3>📈 缓存命中率趋势（最近 7 天）</h3>
    <canvas id="cacheTrendChart" width="800" height="300"></canvas>
</div>
```

**JavaScript 实现**：
```javascript
let cacheTrendChart = null;

async function renderCacheTrendChart() {
    try {
        const response = await apiRequest('/admin/cache/stats/trend?days=7');
        const trendData = response.data.trend;

        const labels = trendData.map(d => d.date);
        const hitRates = trendData.map(d => d.hitRate);

        const ctx = document.getElementById('cacheTrendChart').getContext('2d');

        if (cacheTrendChart) {
            cacheTrendChart.destroy();  // 销毁旧图表
        }

        cacheTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '缓存命中率 (%)',
                    data: hitRates,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `命中率: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ 加载趋势图失败:', error);
    }
}
```

**依赖引入**：
```html
<!-- 在 index.html 的 <head> 中添加 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

---

### 3. 缓存列表

**功能需求**：
- 分页显示（默认 50 条/页）
- 模型筛选（下拉框选择）
- 排序（按命中次数/创建时间/大小）
- 批量删除（勾选多个后统一删除）
- 单条删除
- 查看详情（点击行展开）

**HTML 结构**：
```html
<div class="cache-list-container">
    <div class="list-toolbar">
        <input type="text" id="cacheSearchInput" placeholder="🔍 搜索请求内容..." />

        <select id="cacheModelFilter">
            <option value="">所有模型</option>
            <option value="claude-sonnet-4">Claude Sonnet 4</option>
            <option value="gpt-4">GPT-4</option>
        </select>

        <select id="cacheSortBy">
            <option value="hits">按命中次数</option>
            <option value="created">按创建时间</option>
            <option value="size">按大小</option>
        </select>

        <button onclick="batchDeleteCaches()" class="btn btn-danger">🗑️ 批量删除</button>
        <button onclick="clearAllCaches()" class="btn btn-warning">⚠️ 清空所有</button>
    </div>

    <table class="cache-table">
        <thead>
            <tr>
                <th><input type="checkbox" id="selectAllCaches" /></th>
                <th>模型</th>
                <th>请求摘要</th>
                <th>命中次数</th>
                <th>大小</th>
                <th>创建时间</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody id="cacheListBody">
            <!-- 动态填充 -->
        </tbody>
    </table>

    <div class="pagination" id="cachePagination">
        <!-- 动态填充 -->
    </div>
</div>
```

**JavaScript 实现**：
```javascript
let currentCachePage = 1;
let cacheListData = [];
const CACHE_PAGE_SIZE = 50;

async function loadCacheList(page = 1) {
    try {
        const model = document.getElementById('cacheModelFilter').value;
        const sort = document.getElementById('cacheSortBy').value;

        const response = await apiRequest(
            `/admin/cache/list?page=${page}&limit=${CACHE_PAGE_SIZE}&model=${model}&sort=${sort}`
        );

        cacheListData = response.data.caches;
        currentCachePage = page;

        renderCacheList();
        renderCachePagination(response.data.total, page);

    } catch (error) {
        console.error('❌ 加载缓存列表失败:', error);
        showToast('加载缓存列表失败', 'error');
    }
}

function renderCacheList() {
    const tbody = document.getElementById('cacheListBody');

    if (cacheListData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <div style="font-size: 3em;">📭</div>
                    <p style="color: #999;">暂无缓存数据</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = cacheListData.map(cache => `
        <tr data-cache-key="${cache.cacheKey}">
            <td><input type="checkbox" class="cache-checkbox" value="${cache.cacheKey}" /></td>
            <td><span class="model-badge">${cache.model}</span></td>
            <td>
                <div class="request-summary" title="${escapeHtml(cache.requestSummary)}">
                    ${escapeHtml(cache.requestSummary.substring(0, 50))}${cache.requestSummary.length > 50 ? '...' : ''}
                </div>
            </td>
            <td><span class="badge badge-info">${cache.hits} 次</span></td>
            <td>${formatBytes(cache.size)}</td>
            <td>${formatDateTime(cache.createdAt)}</td>
            <td>
                <button onclick="viewCacheDetail('${cache.cacheKey}')" class="btn-icon" title="查看详情">👁️</button>
                <button onclick="deleteSingleCache('${cache.cacheKey}')" class="btn-icon btn-danger" title="删除">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function renderCachePagination(total, currentPage) {
    const pagination = document.getElementById('cachePagination');
    const totalPages = Math.ceil(total / CACHE_PAGE_SIZE);

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '<div class="pagination-buttons">';

    // 上一页
    html += `<button onclick="loadCacheList(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← 上一页</button>`;

    // 页码（显示前3页、当前页附近3页、后3页）
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button onclick="loadCacheList(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
        } else if (i === 2 || i === totalPages - 1) {
            html += '<span>...</span>';
        }
    }

    // 下一页
    html += `<button onclick="loadCacheList(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页 →</button>`;

    html += '</div>';
    pagination.innerHTML = html;
}

// 批量删除
async function batchDeleteCaches() {
    const checkboxes = document.querySelectorAll('.cache-checkbox:checked');
    const cacheKeys = Array.from(checkboxes).map(cb => cb.value);

    if (cacheKeys.length === 0) {
        showToast('请至少选择一条缓存', 'warning');
        return;
    }

    if (!confirm(`确定要删除选中的 ${cacheKeys.length} 条缓存吗？`)) {
        return;
    }

    try {
        await apiRequest('/admin/cache/batch-delete', 'POST', { cacheKeys });
        showToast(`✅ 成功删除 ${cacheKeys.length} 条缓存`, 'success');
        loadCacheList(currentCachePage);  // 刷新列表
    } catch (error) {
        showToast('批量删除失败: ' + error.message, 'error');
    }
}

// 单条删除
async function deleteSingleCache(cacheKey) {
    if (!confirm('确定要删除这条缓存吗？')) {
        return;
    }

    try {
        await apiRequest(`/admin/cache/${cacheKey}`, 'DELETE');
        showToast('✅ 删除成功', 'success');
        loadCacheList(currentCachePage);
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 清空所有缓存
async function clearAllCaches() {
    const model = document.getElementById('cacheModelFilter').value;
    const confirmText = model
        ? `确定要清空模型 ${model} 的所有缓存吗？此操作不可恢复！`
        : '确定要清空所有缓存吗？此操作不可恢复！';

    if (!confirm(confirmText)) {
        return;
    }

    try {
        const payload = { confirm: true };
        if (model) payload.model = model;

        const response = await apiRequest('/admin/cache/clear', 'POST', payload);
        showToast(`✅ 成功清空 ${response.data.cleared} 条缓存`, 'success');
        loadCacheList(1);  // 重新加载第一页
        refreshCacheStats();  // 刷新统计数据
    } catch (error) {
        showToast('清空失败: ' + error.message, 'error');
    }
}

// 查看缓存详情（打开模态框）
async function viewCacheDetail(cacheKey) {
    try {
        const response = await apiRequest(`/admin/cache/${cacheKey}`);
        const cacheDetail = response.data;

        // 构建模态框内容
        const modalContent = `
            <div class="cache-detail-modal">
                <h3>🔍 缓存详情</h3>

                <div class="detail-section">
                    <h4>基本信息</h4>
                    <table class="detail-table">
                        <tr><td>缓存键:</td><td><code>${cacheDetail.cacheKey}</code></td></tr>
                        <tr><td>模型:</td><td>${cacheDetail.model}</td></tr>
                        <tr><td>创建时间:</td><td>${formatDateTime(cacheDetail.metadata.createdAt)}</td></tr>
                        <tr><td>命中次数:</td><td>${cacheDetail.metadata.hits}</td></tr>
                        <tr><td>最后命中:</td><td>${formatDateTime(cacheDetail.metadata.lastHitAt)}</td></tr>
                        <tr><td>大小:</td><td>${formatBytes(cacheDetail.metadata.size)}</td></tr>
                        <tr><td>TTL:</td><td>${cacheDetail.metadata.ttl}s</td></tr>
                        <tr><td>已存活:</td><td>${cacheDetail.metadata.age}s</td></tr>
                    </table>
                </div>

                <div class="detail-section">
                    <h4>请求内容</h4>
                    <pre>${JSON.stringify(cacheDetail.request, null, 2)}</pre>
                </div>

                <div class="detail-section">
                    <h4>响应内容</h4>
                    <pre>${JSON.stringify(cacheDetail.response, null, 2)}</pre>
                </div>
            </div>
        `;

        showModal('cacheDetailModal', modalContent);
    } catch (error) {
        showToast('加载详情失败: ' + error.message, 'error');
    }
}

// 工具函数
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
```

---

### 4. 缓存配置

**功能需求**：
- 启用/禁用缓存开关
- 调整 TTL（过期时间）
- 选择匹配策略（精确/模糊）
- 自动清理开关

**HTML 结构**：
```html
<div class="cache-config-panel">
    <h3>⚙️ 缓存配置</h3>

    <div class="config-grid">
        <div class="config-item">
            <label>
                <input type="checkbox" id="cacheEnabled" />
                启用缓存
            </label>
            <p class="hint">关闭后将不再缓存新的响应，但已有缓存仍可使用</p>
        </div>

        <div class="config-item">
            <label for="cacheTTL">缓存过期时间 (秒)</label>
            <input type="number" id="cacheTTL" value="86400" min="60" max="604800" />
            <p class="hint">默认 86400 秒 (24 小时)，范围 60 ~ 604800 (7天)</p>
        </div>

        <div class="config-item">
            <label for="cacheStrategy">匹配策略</label>
            <select id="cacheStrategy">
                <option value="exact">精确匹配 (参数完全相同才命中)</option>
                <option value="fuzzy" selected>模糊匹配 (忽略 temperature 等参数)</option>
            </select>
            <p class="hint">推荐使用模糊匹配以提高命中率</p>
        </div>

        <div class="config-item">
            <label>
                <input type="checkbox" id="cacheAutoCleanup" checked />
                自动清理过期缓存
            </label>
            <p class="hint">每小时自动清理过期缓存，减少存储占用</p>
        </div>
    </div>

    <div class="config-actions">
        <button onclick="saveCacheConfig()" class="btn btn-primary">💾 保存配置</button>
        <button onclick="testCacheHealth()" class="btn btn-secondary">🏥 健康检查</button>
    </div>
</div>
```

**JavaScript 实现**：
```javascript
async function loadCacheConfig() {
    try {
        const response = await apiRequest('/admin/cache/config');
        const config = response.data;

        document.getElementById('cacheEnabled').checked = config.enabled;
        document.getElementById('cacheTTL').value = config.ttl;
        document.getElementById('cacheStrategy').value = config.strategy;
        document.getElementById('cacheAutoCleanup').checked = config.autoCleanup;
    } catch (error) {
        console.error('❌ 加载缓存配置失败:', error);
    }
}

async function saveCacheConfig() {
    try {
        const config = {
            enabled: document.getElementById('cacheEnabled').checked,
            ttl: parseInt(document.getElementById('cacheTTL').value),
            strategy: document.getElementById('cacheStrategy').value,
            autoCleanup: document.getElementById('cacheAutoCleanup').checked
        };

        await apiRequest('/admin/cache/config', 'PUT', config);
        showToast('✅ 配置已保存，部分配置需要重启生效', 'success');
    } catch (error) {
        showToast('保存配置失败: ' + error.message, 'error');
    }
}

async function testCacheHealth() {
    try {
        const response = await apiRequest('/admin/cache/health');
        const health = response.data;

        let message = `<h3>🏥 缓存健康检查</h3>`;
        message += `<p>状态: <strong>${health.status === 'healthy' ? '✅ 健康' : '⚠️ 异常'}</strong></p>`;
        message += `<p>存储类型: ${health.storage.type}</p>`;
        message += `<p>连接状态: ${health.storage.connected ? '✅ 已连接' : '❌ 断开'}</p>`;
        message += `<p>延迟: ${health.storage.latency}ms</p>`;
        message += `<p>平均查询时间: ${health.performance.avgQueryTime}ms</p>`;

        if (health.issues.length > 0) {
            message += `<p>⚠️ 发现问题:</p><ul>`;
            health.issues.forEach(issue => {
                message += `<li>${issue}</li>`;
            });
            message += '</ul>';
        }

        showModal('healthCheckModal', message);
    } catch (error) {
        showToast('健康检查失败: ' + error.message, 'error');
    }
}
```

---

## 🔄 交互流程

### 用户进入缓存管理页面

```mermaid
graph TD
    A[用户点击"缓存管理" Tab] --> B[检查是否已加载数据]
    B -->|未加载| C[并行加载所有数据]
    B -->|已加载| D[直接显示]

    C --> E[GET /admin/cache/stats]
    C --> F[GET /admin/cache/stats/trend]
    C --> G[GET /admin/cache/list]
    C --> H[GET /admin/cache/config]

    E --> I[渲染统计卡片]
    F --> J[渲染趋势图]
    G --> K[渲染缓存列表]
    H --> L[渲染配置面板]

    I --> D
    J --> D
    K --> D
    L --> D
```

### 用户删除缓存

```mermaid
graph TD
    A[用户点击"删除"按钮] --> B{删除类型?}

    B -->|单条删除| C[弹出确认对话框]
    B -->|批量删除| D[检查是否有勾选]
    B -->|清空所有| E[弹出二次确认]

    D -->|未勾选| F[提示"请至少选择一条"]
    D -->|已勾选| C

    C --> G{用户确认?}
    G -->|取消| H[中止操作]
    G -->|确认| I[发送 DELETE 请求]

    E --> J{用户确认?}
    J -->|取消| H
    J -->|确认| K[发送 POST /admin/cache/clear]

    I --> L[请求成功?]
    K --> L

    L -->|成功| M[显示成功提示]
    L -->|失败| N[显示错误提示]

    M --> O[刷新缓存列表]
    M --> P[刷新统计数据]
```

---

## 🎨 响应式设计

### 断点定义

```css
/* 桌面端 (>= 1024px) */
@media (min-width: 1024px) {
    .stats-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}

/* 平板端 (768px ~ 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .cache-table {
        font-size: 14px;
    }
}

/* 移动端 (<= 767px) */
@media (max-width: 767px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }

    .cache-table {
        display: block;
        overflow-x: auto;
    }

    .list-toolbar {
        flex-direction: column;
        gap: 10px;
    }

    .list-toolbar input,
    .list-toolbar select,
    .list-toolbar button {
        width: 100%;
    }
}
```

---

## 📦 完整 CSS 样式

```css
/* ==================== 缓存管理页面样式 ==================== */

/* 统计卡片网格 */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    display: flex;
    align-items: center;
    padding: 25px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    color: white;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 30px rgba(0,0,0,0.25);
}

.stat-icon {
    font-size: 3em;
    margin-right: 20px;
}

.stat-content {
    flex: 1;
}

.stat-label {
    font-size: 0.9em;
    opacity: 0.9;
    margin-bottom: 5px;
}

.stat-value {
    font-size: 2em;
    font-weight: bold;
    margin: 5px 0;
}

.stat-trend,
.stat-detail,
.stat-comparison {
    font-size: 0.85em;
    opacity: 0.8;
    margin-top: 5px;
}

.stat-progress {
    width: 100%;
    height: 8px;
    background: rgba(255,255,255,0.3);
    border-radius: 4px;
    margin-top: 10px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: white;
    border-radius: 4px;
    transition: width 0.5s ease;
}

/* 趋势图容器 */
.chart-container {
    background: white;
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    margin-bottom: 30px;
}

.chart-container h3 {
    margin-bottom: 20px;
    color: #333;
}

#cacheTrendChart {
    max-height: 300px;
}

/* 缓存列表 */
.cache-list-container {
    background: white;
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    margin-bottom: 30px;
}

.list-toolbar {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.list-toolbar input[type="text"] {
    flex: 1;
    min-width: 200px;
    padding: 10px 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
}

.list-toolbar select {
    padding: 10px 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    background: white;
}

.cache-table {
    width: 100%;
    border-collapse: collapse;
}

.cache-table thead {
    background: #f8f9fa;
}

.cache-table th,
.cache-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
}

.cache-table th {
    font-weight: 600;
    color: #333;
}

.cache-table tbody tr {
    transition: background 0.2s ease;
}

.cache-table tbody tr:hover {
    background: #f8f9fa;
}

.model-badge {
    display: inline-block;
    padding: 4px 10px;
    background: #e3f2fd;
    color: #1976d2;
    border-radius: 6px;
    font-size: 0.85em;
    font-weight: 500;
}

.request-summary {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

.request-summary:hover {
    text-decoration: underline;
}

.badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.85em;
    font-weight: 500;
}

.badge-info {
    background: #e8f5e9;
    color: #2e7d32;
}

.btn-icon {
    background: none;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    padding: 5px;
    transition: transform 0.2s ease;
}

.btn-icon:hover {
    transform: scale(1.2);
}

.btn-icon.btn-danger:hover {
    color: #f44336;
}

/* 分页器 */
.pagination {
    margin-top: 20px;
    display: flex;
    justify-content: center;
}

.pagination-buttons {
    display: flex;
    gap: 10px;
}

.pagination-buttons button {
    padding: 8px 15px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    transition: all 0.2s ease;
}

.pagination-buttons button:hover:not(:disabled) {
    background: #3498db;
    color: white;
    border-color: #3498db;
}

.pagination-buttons button.active {
    background: #3498db;
    color: white;
    border-color: #3498db;
}

.pagination-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 缓存配置面板 */
.cache-config-panel {
    background: white;
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.cache-config-panel h3 {
    margin-bottom: 20px;
    color: #333;
}

.config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-bottom: 25px;
}

.config-item {
    padding: 15px;
    border: 1px solid #eee;
    border-radius: 8px;
    background: #f8f9fa;
}

.config-item label {
    display: block;
    font-weight: 600;
    margin-bottom: 10px;
    color: #333;
}

.config-item input[type="checkbox"] {
    margin-right: 8px;
}

.config-item input[type="number"],
.config-item select {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
}

.config-item .hint {
    font-size: 0.85em;
    color: #666;
    margin-top: 5px;
}

.config-actions {
    display: flex;
    gap: 15px;
}

/* 缓存详情模态框 */
.cache-detail-modal {
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
}

.cache-detail-modal h3 {
    margin-bottom: 20px;
    color: #333;
}

.detail-section {
    margin-bottom: 25px;
}

.detail-section h4 {
    margin-bottom: 10px;
    color: #555;
    border-bottom: 2px solid #eee;
    padding-bottom: 5px;
}

.detail-table {
    width: 100%;
    border-collapse: collapse;
}

.detail-table td {
    padding: 8px;
    border-bottom: 1px solid #eee;
}

.detail-table td:first-child {
    font-weight: 600;
    color: #555;
    width: 30%;
}

.detail-section pre {
    background: #f5f5f5;
    padding: 15px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.9em;
    line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 767px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }

    .list-toolbar {
        flex-direction: column;
    }

    .list-toolbar input[type="text"],
    .list-toolbar select,
    .list-toolbar button {
        width: 100%;
    }

    .cache-table {
        font-size: 12px;
    }

    .cache-table th,
    .cache-table td {
        padding: 8px;
    }

    .config-grid {
        grid-template-columns: 1fr;
    }

    .config-actions {
        flex-direction: column;
    }

    .config-actions button {
        width: 100%;
    }
}
```

---

## 🚀 集成到现有项目

### 1. 修改 index.html

在现有的 Tab 导航中添加"缓存管理" Tab：

```html
<!-- 在 <nav class="tabs"> 中添加 -->
<button class="tab-btn" data-tab="cache-management">📊 缓存管理</button>

<!-- 在 <main> 中添加对应的 Tab 内容 -->
<div id="cache-management" class="tab-content">
    <!-- 统计卡片 -->
    <div class="stats-grid">
        <!-- 卡片内容见前文 -->
    </div>

    <!-- 趋势图 -->
    <div class="chart-container">
        <h3>📈 缓存命中率趋势（最近 7 天）</h3>
        <canvas id="cacheTrendChart" width="800" height="300"></canvas>
    </div>

    <!-- 缓存列表 -->
    <div class="cache-list-container">
        <!-- 列表内容见前文 -->
    </div>

    <!-- 缓存配置 -->
    <div class="cache-config-panel">
        <!-- 配置面板见前文 -->
    </div>
</div>
```

### 2. 创建 cache-management.js

将所有缓存管理相关的 JavaScript 函数放到独立文件中：

```javascript
// public/cache-management.js

console.log('🎨 LLM 缓存管理 UI 模块加载完成！');

// 页面加载时初始化
window.addEventListener('load', () => {
    // 监听 Tab 切换事件
    document.querySelector('[data-tab="cache-management"]')?.addEventListener('click', () => {
        initCacheManagement();
    });
});

let cacheManagementInitialized = false;

async function initCacheManagement() {
    if (cacheManagementInitialized) {
        return;  // 避免重复初始化
    }

    console.log('🚀 初始化缓存管理界面...');

    try {
        // 并行加载所有数据
        await Promise.all([
            refreshCacheStats(),
            renderCacheTrendChart(),
            loadCacheList(1),
            loadCacheConfig()
        ]);

        cacheManagementInitialized = true;
        console.log('✅ 缓存管理界面初始化完成！');
    } catch (error) {
        console.error('❌ 缓存管理界面初始化失败:', error);
        showToast('加载缓存管理界面失败', 'error');
    }
}

// 后续函数见前文...
```

### 3. 引入到 index.html

```html
<!-- 在 </body> 前添加 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="cache-management.js"></script>
```

### 4. 添加 CSS 样式

将上述完整 CSS 样式添加到 `style.css` 末尾。

---

## 📝 开发清单

### 第一阶段：基础展示（2 小时）

- [x] 统计卡片组件（4 个核心指标）
- [x] 趋势图组件（Chart.js 集成）
- [x] 缓存列表基础渲染
- [x] 分页功能
- [x] 响应式布局适配

### 第二阶段：交互功能（3 小时）

- [x] 单条删除功能
- [x] 批量删除功能
- [x] 清空所有缓存功能
- [x] 缓存详情查看（模态框）
- [x] 筛选和排序功能

### 第三阶段：配置管理（1 小时）

- [x] 缓存配置加载和保存
- [x] 健康检查功能
- [x] 实时数据刷新（每 30 秒）

### 第四阶段：优化和测试（2 小时）

- [ ] 性能优化（虚拟滚动、懒加载）
- [ ] 错误处理完善
- [ ] 多浏览器测试
- [ ] 移动端适配测试

---

## 🎉 总结

本文档详细设计了 **LLM 缓存管理前端界面**，涵盖了从布局到交互的所有细节。遵循以下原则：

1. **用户体验优先** - 直观的可视化展示，友好的错误提示
2. **保持项目风格** - 复用现有 UI 组件和配色方案
3. **性能优化** - 懒加载、防抖、虚拟滚动
4. **响应式设计** - 适配桌面端、平板端、移动端

**预估工作量**：8 小时（1 个工作日）

**技术栈**：原生 JavaScript + Chart.js + 现有项目 CSS 框架

---

**文档版本**：v1.0.0
**作者**：BaSui
**最后更新**：2025-10-13
