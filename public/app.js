// 全局变量
let adminKey = '';
let currentPage = 1;
let currentStatus = 'all';
let currentEditKeyId = null;

// 老王：localStorage的key名称
const STORAGE_KEY_ADMIN = 'droid2api_admin_key';
const STORAGE_KEY_LOGIN_TIME = 'droid2api_login_time';
const LOGIN_EXPIRE_HOURS = 1; // 1小时过期

// 老王：HTTP状态码中文映射，让用户看懂这些SB代码是啥意思
const HTTP_STATUS_MAP = {
    200: '请求成功',
    201: '创建成功',
    400: '请求参数错误',
    401: '认证失败 - 密钥无效',
    402: '余额不足 - 没有可用额度',
    403: '权限不足 - 禁止访问',
    404: '资源不存在',
    429: '请求过于频繁 - 触发限流',
    500: '服务器内部错误',
    502: '网关错误',
    503: '服务不可用',
    504: '网关超时',
    0: '网络错误或请求超时'
};

// 老王：根据状态码获取中文说明
function getStatusMessage(statusCode) {
    return HTTP_STATUS_MAP[statusCode] || `未知错误 (${statusCode})`;
}

// 认证
function authenticate() {
    const key = document.getElementById('adminKeyInput').value.trim();
    if (!key) {
        alert('请输入管理员密钥');
        return;
    }

    adminKey = key;

    // 测试认证
    fetchStats()
        .then(() => {
            // 老王：认证成功后保存到localStorage，包含密钥和登录时间
            localStorage.setItem(STORAGE_KEY_ADMIN, key);
            localStorage.setItem(STORAGE_KEY_LOGIN_TIME, Date.now().toString());

            document.getElementById('authSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            refreshData();
        })
        .catch(err => {
            alert('认证失败: ' + err.message);
            adminKey = '';
        });
}

// 老王：退出登录功能
function logout() {
    if (!confirm('确认退出登录？')) return;

    // 清除localStorage和内存中的密钥和登录时间
    localStorage.removeItem(STORAGE_KEY_ADMIN);
    localStorage.removeItem(STORAGE_KEY_LOGIN_TIME);
    adminKey = '';

    // 切换显示
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';

    // 清空密码输入框
    document.getElementById('adminKeyInput').value = '';
}

// 老王：检查登录是否过期
function isLoginExpired() {
    const loginTime = localStorage.getItem(STORAGE_KEY_LOGIN_TIME);
    if (!loginTime) return true; // 没有登录时间，认为过期

    const loginTimestamp = parseInt(loginTime);
    const now = Date.now();
    const expireTime = LOGIN_EXPIRE_HOURS * 60 * 60 * 1000; // 转换为毫秒

    return (now - loginTimestamp) > expireTime;
}

// 老王：清除过期的登录信息
function clearExpiredLogin() {
    localStorage.removeItem(STORAGE_KEY_ADMIN);
    localStorage.removeItem(STORAGE_KEY_LOGIN_TIME);
    adminKey = '';
}

// 老王：页面加载时自动认证
function autoAuthenticate() {
    const savedKey = localStorage.getItem(STORAGE_KEY_ADMIN);

    if (!savedKey) {
        // 没有保存的密钥，显示登录界面
        return;
    }

    // 老王：检查登录是否过期
    if (isLoginExpired()) {
        console.log('登录已过期，清除登录信息');
        clearExpiredLogin();
        alert(`登录已过期（超过${LOGIN_EXPIRE_HOURS}小时），请重新输入管理员密钥`);
        return;
    }

    adminKey = savedKey;

    // 测试保存的密钥是否有效
    fetchStats()
        .then(() => {
            // 密钥有效，直接进入主界面
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            refreshData();
        })
        .catch(err => {
            // 密钥无效，清除保存的密钥，显示登录界面
            console.error('自动认证失败:', err);
            clearExpiredLogin();
            alert('登录已过期，请重新输入管理员密钥');
        });
}

// 老王：页面加载时执行自动认证
window.addEventListener('DOMContentLoaded', autoAuthenticate);

// API 请求封装
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'x-admin-key': adminKey,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`/admin${endpoint}`, options);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// 获取统计信息
async function fetchStats() {
    const response = await apiRequest('/stats');
    const data = response.data;  // 解包后端的 {success, data} 结构
    document.getElementById('statTotal').textContent = data.total;
    document.getElementById('statActive').textContent = data.active;
    document.getElementById('statDisabled').textContent = data.disabled;
    document.getElementById('statBanned').textContent = data.banned;

    // 老王：同时获取当前轮询算法配置并显示
    try {
        const configResponse = await apiRequest('/config');
        const config = configResponse.data;
        const algorithmElement = document.getElementById('statAlgorithm');
        if (algorithmElement) {
            algorithmElement.textContent = getAlgorithmText(config.algorithm);
        }
    } catch (err) {
        console.error('Failed to fetch config:', err);
    }
}

// 获取密钥列表
async function fetchKeys() {
    const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        status: currentStatus
    });

    const response = await apiRequest(`/keys?${params}`);
    const data = response.data;  // 解包后端的 {success, data} 结构
    renderKeysTable(data.keys);
    renderPagination(data.pagination);
    // 老王：新增图表渲染
    renderCharts(data.keys);
}

// 渲染密钥表格
function renderKeysTable(keys) {
    const tbody = document.getElementById('keysTableBody');

    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">暂无数据</td></tr>';
        return;
    }

    tbody.innerHTML = keys.map(key => {
        // 老王：生成测试结果的详细显示（包含状态码和中文说明）
        let testResultHtml = '';
        if (key.last_test_result === 'success') {
            testResultHtml = '<span class="test-success">✅ 测试通过</span>';
        } else if (key.last_test_result === 'failed') {
            // 从last_error中提取状态码（格式：402: xxx）
            let statusCode = '';
            let errorMsg = key.last_error || '未知错误';
            if (key.last_error && key.last_error.includes(':')) {
                const parts = key.last_error.split(':');
                statusCode = parts[0].trim();
                errorMsg = parts.slice(1).join(':').trim();
            }

            const statusText = statusCode ? getStatusMessage(parseInt(statusCode)) : '测试失败';
            testResultHtml = `<span class="test-failed" title="${escapeHtml(errorMsg)}">❌ ${statusText}${statusCode ? ` (${statusCode})` : ''}</span>`;
        } else {
            testResultHtml = '<span class="test-untested">⏸️ 未测试</span>';
        }

        // 计算成功率和评分
        const totalRequests = key.total_requests || key.usage_count || 0;
        const successRequests = key.success_requests || (totalRequests - (key.error_count || 0));
        const successRate = totalRequests > 0 ? (successRequests / totalRequests) : 0;
        const successRateText = totalRequests > 0 ? (successRate * 100).toFixed(1) + '%' : 'N/A';
        const successRateClass = successRate >= 0.9 ? 'success-rate-high' :
                               successRate >= 0.7 ? 'success-rate-medium' :
                               successRate > 0 ? 'success-rate-low' : 'success-rate-none';

        return `
        <tr>
            <td><code>${key.id}</code></td>
            <td><code>${maskKey(key.key)}</code></td>
            <td><span class="status-badge status-${key.status}">${getStatusText(key.status)}</span></td>
            <td>${key.usage_count || 0}</td>
            <td>${key.error_count || 0}</td>
            <td><span class="${successRateClass}">${successRateText}</span></td>
            <td><span class="score-badge">${(key.weight_score || 0).toFixed(1)}</span></td>
            <td>${formatDate(key.last_used_at)}</td>
            <td>${testResultHtml}</td>
            <td>${key.notes || '-'}</td>
            <td>
                <button onclick="testKey('${key.id}')" class="btn btn-info btn-sm">测试</button>
                <button onclick="toggleKeyStatus('${key.id}', '${key.status}')" class="btn ${getToggleButtonClass(key.status)} btn-sm">
                    ${getToggleButtonText(key.status)}
                </button>
                <button onclick="showEditNotesModal('${key.id}', '${escapeHtml(key.notes || '')}')" class="btn btn-secondary btn-sm">备注</button>
                <button onclick="deleteKey('${key.id}')" class="btn btn-danger btn-sm">删除</button>
            </td>
        </tr>
        `;
    }).join('');
}

// 渲染分页
function renderPagination(pagination) {
    const container = document.getElementById('pagination');
    const { page, total_pages, total } = pagination;

    container.innerHTML = `
        <button ${page <= 1 ? 'disabled' : ''} onclick="changePage(${page - 1})">上一页</button>
        <span class="page-info">第 ${page} / ${total_pages} 页 (共 ${total} 条)</span>
        <button ${page >= total_pages ? 'disabled' : ''} onclick="changePage(${page + 1})">下一页</button>
    `;
}

// 工具函数
function maskKey(key) {
    if (key.length <= 10) return key;
    return key.substring(0, 6) + '...' + key.substring(key.length - 4);
}

function getStatusText(status) {
    const map = {
        'active': '可用',
        'disabled': '已禁用',
        'banned': '已封禁'
    };
    return map[status] || status;
}

// 老王：已经不需要这个简陋的函数了，被更强大的状态码映射替代

function getToggleButtonClass(status) {
    switch (status) {
        case 'active':
            return 'btn-warning';  // 禁用按钮
        case 'disabled':
            return 'btn-success';  // 启用按钮
        case 'banned':
            return 'btn-info';     // 解除封禁按钮
        default:
            return 'btn-secondary';
    }
}

function getToggleButtonText(status) {
    switch (status) {
        case 'active':
            return '禁用';
        case 'disabled':
            return '启用';
        case 'banned':
            return '解封';
        default:
            return '操作';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}

function escapeHtml(text) {
    return text.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// 页面操作
function changePage(page) {
    currentPage = page;
    fetchKeys();
}

function filterChanged() {
    currentStatus = document.getElementById('statusFilter').value;
    currentPage = 1;
    fetchKeys();
}

async function refreshData() {
    try {
        await fetchStats();
        await fetchKeys();
    } catch (err) {
        alert('刷新失败: ' + err.message);
    }
}

// 模态框操作
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showAddKeyModal() {
    document.getElementById('newKeyInput').value = '';
    document.getElementById('newKeyNotes').value = '';
    showModal('addKeyModal');
}

function showBatchImportModal() {
    document.getElementById('batchKeysInput').value = '';
    document.getElementById('importResult').innerHTML = '';
    showModal('batchImportModal');
}

function showEditNotesModal(keyId, notes) {
    currentEditKeyId = keyId;
    document.getElementById('editNotesInput').value = notes.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    showModal('editNotesModal');
}

// 密钥操作
async function addKey() {
    const key = document.getElementById('newKeyInput').value.trim();
    const notes = document.getElementById('newKeyNotes').value.trim();

    if (!key) {
        alert('请输入密钥');
        return;
    }

    if (!key.startsWith('fk-')) {
        alert('密钥格式错误，必须以 fk- 开头');
        return;
    }

    try {
        await apiRequest('/keys', 'POST', { key, notes });
        alert('添加成功');
        closeModal('addKeyModal');
        refreshData();
    } catch (err) {
        alert('添加失败: ' + err.message);
    }
}

async function batchImport() {
    const keysText = document.getElementById('batchKeysInput').value.trim();

    if (!keysText) {
        alert('请输入密钥');
        return;
    }

    const keys = keysText.split('\n').map(k => k.trim()).filter(k => k);

    try {
        const result = await apiRequest('/keys/batch', 'POST', { keys });

        const resultDiv = document.getElementById('importResult');

        // 根据导入结果智能判断状态（老王我可不喜欢SB的提示）
        let statusClass = 'success';
        let statusEmoji = '✅';
        let summaryText = '';

        if (result.success > 0) {
            // 有成功导入的密钥
            statusClass = 'success';
            statusEmoji = '✅';
            summaryText = `成功导入 ${result.success} 个密钥！`;
        } else if (result.duplicate > 0 && result.invalid === 0) {
            // 全部重复，没有无效
            statusClass = 'warning';
            statusEmoji = '🔄';
            summaryText = `所有密钥都已存在（${result.duplicate} 个重复）`;
        } else if (result.invalid > 0 && result.duplicate === 0) {
            // 全部无效
            statusClass = 'error';
            statusEmoji = '❌';
            summaryText = `所有密钥都无效（${result.invalid} 个）`;
        } else {
            // 混合情况
            statusClass = 'warning';
            statusEmoji = '⚠️';
            summaryText = '导入完成，但部分密钥有问题';
        }

        resultDiv.className = `import-result ${statusClass}`;
        resultDiv.innerHTML = `
            <h3>${statusEmoji} ${summaryText}</h3>
            <div class="result-details">
                <p>✅ 成功导入: ${result.success} 个</p>
                <p>🔄 已存在(跳过): ${result.duplicate} 个</p>
                <p>❌ 格式错误: ${result.invalid} 个</p>
            </div>
            ${result.errors.length > 0 ? `<p class="error-info">错误详情: ${result.errors.join(', ')}</p>` : ''}
        `;

        refreshData();
    } catch (err) {
        const resultDiv = document.getElementById('importResult');
        resultDiv.className = 'import-result error';
        resultDiv.innerHTML = `<p>❌ 请求失败: ${err.message}</p>`;
    }
}

// 老王：导出密钥功能 - 下载txt文件（一个密钥一行）
async function exportKeys() {
    try {
        // 获取当前筛选状态（用户可以先筛选状态，然后导出对应的密钥）
        const status = document.getElementById('statusFilter').value;

        // 构造导出URL
        const url = `/admin/keys/export?status=${status}`;

        // 发送请求（必须带x-admin-key认证头）
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-admin-key': adminKey
            }
        });

        // 老王：处理错误响应
        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            try {
                const error = await response.json();
                errorMsg = error.message || errorMsg;
            } catch (e) {
                // 响应不是JSON格式，使用状态码
            }
            throw new Error(errorMsg);
        }

        // 老王：获取文件内容（Blob对象）
        const blob = await response.blob();

        // 老王：从响应头提取文件名（后端设置的Content-Disposition）
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `keys_${status}_${new Date().toISOString().split('T')[0]}.txt`;

        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        // 老王：创建下载链接并触发下载（这招屡试不爽！）
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // 老王：清理临时对象，避免内存泄漏
        setTimeout(() => {
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
        }, 100);

        // 老王：显示成功提示
        alert(`✅ 导出成功！\n文件名：${filename}\n状态筛选：${status === 'all' ? '全部' : status}`);

    } catch (err) {
        alert('❌ 导出失败: ' + err.message);
        console.error('Export keys error:', err);
    }
}

async function testKey(keyId) {
    if (!confirm('确认测试此密钥？')) return;

    try {
        const result = await apiRequest(`/keys/${keyId}/test`, 'POST');
        const data = result.data;

        // 老王：显示完整的中文测试结果
        let message = '━━━━━━━━━━━━━━━━━━━━\n';
        message += '📊 密钥测试结果\n';
        message += '━━━━━━━━━━━━━━━━━━━━\n\n';

        if (data.success) {
            message += '✅ 测试通过\n\n';
            message += `状态码: ${data.status}\n`;
            message += `说明: ${getStatusMessage(data.status)}\n`;
            message += `密钥状态: ${getStatusText(data.key_status)}`;
        } else {
            message += '❌ 测试失败\n\n';
            message += `状态码: ${data.status}\n`;
            message += `错误类型: ${getStatusMessage(data.status)}\n`;
            message += `错误详情: ${data.message}\n`;
            message += `密钥状态: ${getStatusText(data.key_status)}`;
        }

        alert(message);
        refreshData();
    } catch (err) {
        alert('❌ 测试请求失败\n\n' + err.message);
    }
}

async function testAllKeys() {
    if (!confirm('确认批量测试所有密钥？这可能需要较长时间')) return;

    try {
        const result = await apiRequest('/keys/test-all', 'POST');
        const data = result.data;

        // 老王：批量测试结果也要中文化
        let message = '━━━━━━━━━━━━━━━━━━━━\n';
        message += '🧪 批量测试完成\n';
        message += '━━━━━━━━━━━━━━━━━━━━\n\n';
        message += `📊 总密钥数: ${data.total} 个\n`;
        message += `🔍 已测试: ${data.tested} 个\n`;
        message += `✅ 测试通过: ${data.success} 个\n`;
        message += `❌ 测试失败: ${data.failed} 个\n`;
        message += `🚫 自动封禁: ${data.banned} 个\n\n`;

        if (data.banned > 0) {
            message += '💡 提示: 已自动封禁余额不足的密钥\n';
            message += '可点击「删除封禁密钥」批量清理';
        }

        alert(message);
        refreshData();
    } catch (err) {
        alert('❌ 批量测试失败\n\n' + err.message);
    }
}

async function deleteBannedKeys() {
    // 老王：先拿统计信息，看看有多少个封禁密钥
    try {
        const statsResponse = await apiRequest('/stats');
        const bannedCount = statsResponse.data.banned;

        if (bannedCount === 0) {
            alert('没有封禁的密钥需要删除');
            return;
        }

        if (!confirm(`确认删除所有 ${bannedCount} 个封禁密钥？\n删除后无法恢复！`)) return;

        // 老王：调用删除封禁密钥API
        const result = await apiRequest('/keys/banned', 'DELETE');

        // 老王：检查返回数据结构，防止空指针错误
        const deletedCount = result && result.data && result.data.count ? result.data.count : 0;
        alert(`删除成功！\n已删除 ${deletedCount} 个封禁密钥`);
        refreshData();
    } catch (err) {
        console.error('删除封禁密钥失败:', err);
        alert('删除封禁密钥失败: ' + err.message);
    }
}

async function deleteDisabledKeys() {
    // 老王：先拿统计信息，看看有多少个禁用密钥
    try {
        const statsResponse = await apiRequest('/stats');
        const disabledCount = statsResponse.data.disabled;

        if (disabledCount === 0) {
            alert('没有禁用的密钥需要删除');
            return;
        }

        if (!confirm(`确认删除所有 ${disabledCount} 个禁用密钥？\n删除后无法恢复！`)) return;

        // 老王：调用删除禁用密钥API
        const result = await apiRequest('/keys/disabled', 'DELETE');

        // 老王：检查返回数据结构，防止空指针错误
        const deletedCount = result && result.data && result.data.count ? result.data.count : 0;
        alert(`删除成功！\n已删除 ${deletedCount} 个禁用密钥`);
        refreshData();
    } catch (err) {
        console.error('删除禁用密钥失败:', err);
        alert('删除禁用密钥失败: ' + err.message);
    }
}

async function toggleKeyStatus(keyId, currentStatus) {
    let newStatus, action, confirmMessage;

    // 老王：根据当前状态确定操作
    switch (currentStatus) {
        case 'active':
            newStatus = 'disabled';
            action = '禁用';
            confirmMessage = `确认禁用此密钥？\n禁用后不会参与轮询，但可以重新启用。`;
            break;
        case 'disabled':
            newStatus = 'active';
            action = '启用';
            confirmMessage = `确认启用此密钥？`;
            break;
        case 'banned':
            newStatus = 'active';
            action = '解除封禁';
            confirmMessage = `确认解除封禁此密钥？\n解除封禁后密钥将重新参与轮询。`;
            break;
        default:
            // 老王：未知状态，默认设为禁用
            newStatus = 'disabled';
            action = '禁用';
            confirmMessage = `确认禁用此密钥？`;
    }

    if (!confirm(confirmMessage)) return;

    try {
        // 老王：对于封禁状态的密钥，直接调用toggle API（后端会清除封禁标记）
        await apiRequest(`/keys/${keyId}/toggle`, 'PATCH', { status: newStatus });
        alert(`${action}成功`);
        refreshData();
    } catch (err) {
        console.error(`${action}失败:`, err);
        alert(`${action}失败: ` + err.message);
    }
}

async function deleteKey(keyId) {
    if (!confirm('确认删除此密钥？删除后无法恢复！')) return;

    try {
        await apiRequest(`/keys/${keyId}`, 'DELETE');
        alert('删除成功');
        refreshData();
    } catch (err) {
        alert('删除失败: ' + err.message);
    }
}

async function saveNotes() {
    const notes = document.getElementById('editNotesInput').value.trim();

    try {
        // 老王：后端用的是PATCH不是PUT
        await apiRequest(`/keys/${currentEditKeyId}/notes`, 'PATCH', { notes });
        alert('保存成功');
        closeModal('editNotesModal');
        refreshData();
    } catch (err) {
        alert('保存失败: ' + err.message);
    }
}

// 老王：点击模态框外部关闭，使用addEventListener避免覆盖其他事件
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

// ============================================
// 老王：配置管理功能（轮询算法、重试机制等）
// ============================================

/**
 * 显示配置模态框
 */
async function showConfigModal() {
    try {
        // 加载当前配置
        const response = await apiRequest('/config');
        const config = response.data;

        // 填充表单
        document.getElementById('configAlgorithm').value = config.algorithm;

        document.getElementById('configRetryEnabled').checked = config.retry.enabled;
        document.getElementById('configRetryMaxRetries').value = config.retry.maxRetries;
        document.getElementById('configRetryDelay').value = config.retry.retryDelay;

        document.getElementById('configAutoBanEnabled').checked = config.autoBan.enabled;
        document.getElementById('configAutoBanThreshold').value = config.autoBan.errorThreshold;
        document.getElementById('configAutoBan402').checked = config.autoBan.ban402;
        document.getElementById('configAutoBan401').checked = config.autoBan.ban401;

        document.getElementById('configConcurrentLimit').value = config.performance.concurrentLimit;
        document.getElementById('configRequestTimeout').value = config.performance.requestTimeout;

        showModal('configModal');
    } catch (err) {
        alert('❌ 加载配置失败\n\n' + err.message);
    }
}

/**
 * 保存配置
 */
async function saveConfig() {
    try {
        const config = {
            algorithm: document.getElementById('configAlgorithm').value,
            retry: {
                enabled: document.getElementById('configRetryEnabled').checked,
                maxRetries: parseInt(document.getElementById('configRetryMaxRetries').value),
                retryDelay: parseInt(document.getElementById('configRetryDelay').value)
            },
            autoBan: {
                enabled: document.getElementById('configAutoBanEnabled').checked,
                errorThreshold: parseInt(document.getElementById('configAutoBanThreshold').value),
                ban402: document.getElementById('configAutoBan402').checked,
                ban401: document.getElementById('configAutoBan401').checked
            },
            performance: {
                concurrentLimit: parseInt(document.getElementById('configConcurrentLimit').value),
                requestTimeout: parseInt(document.getElementById('configRequestTimeout').value)
            }
        };

        // 老王：验证输入合法性，别tm给老王传SB数据
        if (config.retry.maxRetries < 0 || config.retry.maxRetries > 10) {
            alert('❌ 最大重试次数必须在 0-10 之间');
            return;
        }
        if (config.retry.retryDelay < 0 || config.retry.retryDelay > 10000) {
            alert('❌ 重试延迟必须在 0-10000ms 之间');
            return;
        }
        if (config.autoBan.errorThreshold < 1 || config.autoBan.errorThreshold > 100) {
            alert('❌ 错误阈值必须在 1-100 之间');
            return;
        }
        if (config.performance.concurrentLimit < 1 || config.performance.concurrentLimit > 1000) {
            alert('❌ 并发限制必须在 1-1000 之间');
            return;
        }
        if (config.performance.requestTimeout < 1000 || config.performance.requestTimeout > 60000) {
            alert('❌ 请求超时必须在 1000-60000ms 之间');
            return;
        }

        await apiRequest('/config', 'PUT', config);
        alert('✅ 配置保存成功！');
        closeModal('configModal');
        refreshData(); // 刷新统计信息以显示新算法
    } catch (err) {
        alert('❌ 保存配置失败\n\n' + err.message);
    }
}

/**
 * 重置配置为默认值
 */
async function resetConfigToDefault() {
    if (!confirm('确认重置所有配置为默认值？')) return;

    try {
        await apiRequest('/config/reset', 'POST');
        alert('✅ 配置已重置为默认值！');
        closeModal('configModal');
        refreshData();
    } catch (err) {
        alert('❌ 重置配置失败\n\n' + err.message);
    }
}

/**
 * 获取轮询算法的中文名称
 */
function getAlgorithmText(algorithm) {
    const map = {
        'round-robin': '轮询',
        'random': '随机',
        'least-used': '最少使用',
        'weighted-score': '加权评分'
    };
    return map[algorithm] || algorithm;
}

// 老王：新增图表渲染功能
/**
 * 渲染所有统计图表
 */
function renderCharts(keys) {
    renderStatusChart(keys);
    renderSuccessRateChart(keys);
    renderUsageChart(keys);
}

/**
 * 渲染密钥状态分布饼图
 */
function renderStatusChart(keys) {
    const statusCount = {
        active: 0,
        disabled: 0,
        banned: 0
    };

    keys.forEach(key => {
        statusCount[key.status] = (statusCount[key.status] || 0) + 1;
    });

    const total = keys.length;
    if (total === 0) {
        document.getElementById('statusChart').innerHTML = '<p style="color: #999;">暂无数据</p>';
        return;
    }

    // 计算角度
    const activeAngle = (statusCount.active / total) * 360;
    const disabledAngle = (statusCount.disabled / total) * 360;
    const bannedAngle = (statusCount.banned / total) * 360;

    // 生成饼图背景
    const pieBackground = `conic-gradient(
        #28a745 0deg ${activeAngle}deg,
        #ffc107 ${activeAngle}deg ${activeAngle + disabledAngle}deg,
        #dc3545 ${activeAngle + disabledAngle}deg ${activeAngle + disabledAngle + bannedAngle}deg,
        #6c757d ${activeAngle + disabledAngle + bannedAngle}deg
    )`;

    // 生成图例
    const legend = `
        <div class="pie-chart-legend">
            <div class="pie-legend-item">
                <div class="pie-legend-color" style="background: #28a745;"></div>
                <span>可用 (${statusCount.active})</span>
            </div>
            <div class="pie-legend-item">
                <div class="pie-legend-color" style="background: #ffc107;"></div>
                <span>已禁用 (${statusCount.disabled})</span>
            </div>
            <div class="pie-legend-item">
                <div class="pie-legend-color" style="background: #dc3545;"></div>
                <span>已封禁 (${statusCount.banned})</span>
            </div>
        </div>
    `;

    document.getElementById('statusChart').innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center;">
            <div class="simple-pie-chart" style="background: ${pieBackground};"></div>
            ${legend}
        </div>
    `;
}

/**
 * 渲染成功率排行榜
 */
function renderSuccessRateChart(keys) {
    // 只统计有使用记录的密钥
    const keysWithStats = keys.filter(key => (key.total_requests || key.usage_count || 0) > 0);

    if (keysWithStats.length === 0) {
        document.getElementById('successRateList').innerHTML = '<p style="color: #999;">暂无使用数据</p>';
        return;
    }

    // 计算成功率并排序
    const keysWithRate = keysWithStats.map(key => {
        const totalRequests = key.total_requests || key.usage_count || 0;
        const successRequests = key.success_requests || (totalRequests - (key.error_count || 0));
        const successRate = totalRequests > 0 ? (successRequests / totalRequests) : 0;

        return {
            ...key,
            successRate: successRate,
            successRateText: (successRate * 100).toFixed(1) + '%'
        };
    }).sort((a, b) => b.successRate - a.successRate).slice(0, 10); // 只显示前10名

    const successRateHtml = keysWithRate.map((key, index) => `
        <div class="success-rate-item">
            <div class="success-rate-key" title="${key.key}">
                #${index + 1} ${key.key.substring(0, 20)}...
            </div>
            <div class="success-rate-value">
                <div class="success-rate-bar">
                    <div class="success-rate-fill" style="width: ${key.successRate * 100}%"></div>
                </div>
                <div class="success-rate-text">${key.successRateText}</div>
            </div>
        </div>
    `).join('');

    document.getElementById('successRateList').innerHTML = successRateHtml;
}

/**
 * 渲染使用热力图
 */
function renderUsageChart(keys) {
    // 统计使用次数
    const keysWithUsage = keys.filter(key => (key.usage_count || 0) > 0);

    if (keysWithUsage.length === 0) {
        document.getElementById('usageStats').innerHTML = '<p style="color: #999;">暂无使用数据</p>';
        return;
    }

    // 计算总使用次数
    const totalUsage = keysWithUsage.reduce((sum, key) => sum + (key.usage_count || 0), 0);

    // 按使用次数排序
    const sortedKeys = keysWithUsage.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 8);

    const usageHtml = sortedKeys.map(key => {
        const usage = key.usage_count || 0;
        const percentage = (usage / totalUsage * 100).toFixed(1);

        return `
            <div class="usage-stat-item">
                <div class="usage-stat-key" title="${key.key}">
                    ${key.key.substring(0, 25)}...
                </div>
                <div class="usage-stat-bar-container">
                    <div class="usage-stat-bar" style="width: ${percentage}%">
                        <span class="usage-stat-count">${usage}</span>
                    </div>
                </div>
                <div class="usage-stat-percentage">${percentage}%</div>
            </div>
        `;
    }).join('');

    document.getElementById('usageStats').innerHTML = usageHtml;
}
