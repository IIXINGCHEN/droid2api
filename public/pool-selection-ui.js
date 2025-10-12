/**
 * 🎯 密钥池选择 UI 功能模块
 * BaSui: 这个文件管理所有与密钥池选择相关的 UI 交互！
 * 让用户能方便地选择把密钥添加到哪个池子，或者选择导出/测试哪个池子！
 */

// ===== 🎯 动态加载池子选项到各个下拉框 =====

/**
 * 加载池子选项到指定的 select 元素
 * @param {string} selectId - select 元素的 ID
 * @param {boolean} includeDefault - 是否包含"默认池"选项
 */
async function loadPoolGroupOptions(selectId, includeDefault = true) {
    try {
        const select = document.getElementById(selectId);
        if (!select) return;

        // 先清空现有选项（保留默认池选项）
        if (includeDefault) {
            select.innerHTML = '<option value="">默认池 (default)</option>';
        } else {
            select.innerHTML = '';
        }

        // 获取密钥池列表
        const response = await apiRequest('/pool-groups');
        const poolGroups = response.data || [];

        // 添加池子选项
        poolGroups.forEach(pool => {
            const option = document.createElement('option');
            option.value = pool.id;
            option.textContent = `${pool.name} (${pool.id})`;
            select.appendChild(option);
        });

        console.log(`✅ 已加载 ${poolGroups.length} 个池子选项到 #${selectId}`);
    } catch (error) {
        console.error(`❌ 加载池子选项失败 (#${selectId}):`, error);
    }
}

/**
 * 初始化所有下拉框的池子选项
 * BaSui: 在页面加载时调用，一次性加载所有池子选项！
 */
async function initializeAllPoolSelects() {
    // 加载"添加密钥"模态框的池子选项
    await loadPoolGroupOptions('newKeyPoolGroup', true);

    // 加载"批量导入"模态框的池子选项
    await loadPoolGroupOptions('batchImportPoolGroup', true);

    // 加载"导出密钥"模态框的池子选项（多选）
    await loadPoolGroupOptions('exportPoolGroup', true);

    // 加载"批量测试"模态框的池子选项
    await loadPoolGroupOptions('testPoolGroup', true);

    // 加载"修改密钥池"模态框的池子选项
    await loadPoolGroupOptions('changePoolSelect', false);

    // 加载密钥管理页面的池子筛选器
    await loadPoolGroupOptions('poolGroupFilter', false);

    console.log('🎉 所有池子选项加载完成！');
}

// ===== 📥 导出密钥功能 =====

/**
 * 显示导出密钥模态框
 * BaSui: 替换原来的直接导出，改成先弹窗让用户选择！
 */
function showExportKeysModal() {
    // 加载最新的池子选项
    loadPoolGroupOptions('exportPoolGroup', true);

    // 显示模态框
    showModal('exportKeysModal');
}

/**
 * 切换"全部池"选项
 */
function toggleExportAllPools() {
    const allPoolsChecked = document.getElementById('exportAllPools').checked;
    const poolOptions = document.getElementById('exportPoolOptions');

    if (allPoolsChecked) {
        poolOptions.style.display = 'none';
    } else {
        poolOptions.style.display = 'block';
    }
}

/**
 * 确认导出密钥
 */
async function confirmExportKeys() {
    try {
        // 获取用户选择
        const exportAll = document.getElementById('exportAllPools').checked;
        const format = document.querySelector('input[name="exportFormat"]:checked').value;
        const status = document.getElementById('exportStatusFilter').value;

        let poolGroups = [];
        if (!exportAll) {
            // 获取选中的池子
            const select = document.getElementById('exportPoolGroup');
            poolGroups = Array.from(select.selectedOptions).map(opt => opt.value);

            if (poolGroups.length === 0) {
                alert('请至少选择一个池子！');
                return;
            }
        }

        // 构造导出URL
        let url = `/admin/keys/export?status=${status}&format=${format}`;
        if (!exportAll && poolGroups.length > 0) {
            url += `&poolGroups=${poolGroups.join(',')}`;
        }

        // 发送请求
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-admin-key': adminKey
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'keys_export.json';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?(.+)"?/);
            if (match) filename = match[1];
        }

        // 下载文件
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);

        // 关闭模态框
        closeModal('exportKeysModal');

        alert(`✅ 导出成功！文件名: ${filename}`);
    } catch (error) {
        console.error('❌ 导出失败:', error);
        alert(`导出失败: ${error.message}`);
    }
}

// ===== 🧪 批量测试功能 =====

/**
 * 显示批量测试模态框
 * BaSui: 替换原来的直接测试，改成先弹窗让用户选择！
 */
function showBatchTestModal() {
    // 加载最新的池子选项
    loadPoolGroupOptions('testPoolGroup', true);

    // 清空测试结果
    document.getElementById('testResult').innerHTML = '';

    // 显示模态框
    showModal('batchTestModal');
}

/**
 * 切换测试池子选项
 */
function toggleTestPoolOptions() {
    const testSpecific = document.querySelector('input[name="testPool"][value="specific"]').checked;
    const poolOptions = document.getElementById('testPoolOptions');

    if (testSpecific) {
        poolOptions.style.display = 'block';
    } else {
        poolOptions.style.display = 'none';
    }
}

// 监听单选按钮变化
document.addEventListener('DOMContentLoaded', () => {
    const testPoolRadios = document.querySelectorAll('input[name="testPool"]');
    testPoolRadios.forEach(radio => {
        radio.addEventListener('change', toggleTestPoolOptions);
    });
});

/**
 * 确认批量测试
 */
async function confirmBatchTest() {
    try {
        const testAll = document.querySelector('input[name="testPool"][value="all"]').checked;
        const concurrency = document.getElementById('testConcurrency').value;
        const autoRefresh = document.getElementById('testAutoRefresh').checked;

        let poolGroup = null;
        if (!testAll) {
            poolGroup = document.getElementById('testPoolGroup').value;
        }

        // 显示加载提示
        const resultDiv = document.getElementById('testResult');
        resultDiv.innerHTML = '<div class="loading">🧪 正在测试中，请稍候...</div>';

        // 发送测试请求
        let url = `/admin/keys/test-all?concurrency=${concurrency}`;
        if (poolGroup) {
            url += `&poolGroup=${poolGroup}`;
        }

        const response = await apiRequest(url, 'POST');
        const data = response.data;

        // 显示测试结果
        let message = '<div class="result-summary success">';
        message += '<h3>🎉 批量测试完成</h3>';
        message += `<p>📊 总密钥数: ${data.total} 个</p>`;
        message += `<p>🔍 已测试: ${data.tested} 个</p>`;
        message += `<p>✅ 测试通过: ${data.success} 个</p>`;
        message += `<p>❌ 测试失败: ${data.failed} 个</p>`;
        message += `<p>🚫 自动封禁: ${data.banned} 个</p>`;

        if (data.banned > 0) {
            message += '<p class="hint">💡 提示: 已自动封禁余额不足的密钥</p>';
        }

        message += '</div>';

        resultDiv.innerHTML = message;

        // 自动刷新列表
        if (autoRefresh) {
            setTimeout(() => {
                refreshData();
                closeModal('batchTestModal');
            }, 2000);
        }
    } catch (error) {
        console.error('❌ 批量测试失败:', error);
        const resultDiv = document.getElementById('testResult');
        resultDiv.innerHTML = `<div class="result-summary error">❌ 测试失败: ${error.message}</div>`;
    }
}

// ===== 📤 批量导入功能增强 =====

/**
 * 显示批量导入模态框
 * BaSui: 增强版，包含池子选择！
 */
function showBatchImportModal() {
    // 加载最新的池子选项
    loadPoolGroupOptions('batchImportPoolGroup', true);

    // 清空输入和结果
    document.getElementById('batchKeysInput').value = '';
    document.getElementById('importResult').innerHTML = '';

    // 显示模态框
    showModal('batchImportModal');
}

/**
 * 批量导入密钥（增强版）
 */
async function batchImport() {
    const keysText = document.getElementById('batchKeysInput').value.trim();
    const poolGroup = document.getElementById('batchImportPoolGroup').value;

    if (!keysText) {
        alert('请输入密钥');
        return;
    }

    const keys = keysText.split('\n').map(k => k.trim()).filter(k => k);

    try {
        const response = await apiRequest('/keys/batch', 'POST', {
            keys,
            poolGroup: poolGroup || undefined  // 如果是空字符串，传 undefined
        });
        const result = response.data;

        const resultDiv = document.getElementById('importResult');

        // 根据导入结果智能判断状态
        let statusClass = 'success';
        let statusEmoji = '✅';
        let summaryText = '';

        if (result.success > 0) {
            statusClass = 'success';
            statusEmoji = '✅';
            summaryText = `成功导入 ${result.success} 个密钥！`;
        } else if (result.duplicate > 0 && result.invalid === 0) {
            statusClass = 'warning';
            statusEmoji = '🔄';
            summaryText = `所有密钥都已存在（${result.duplicate} 个重复）`;
        } else if (result.invalid > 0) {
            statusClass = 'error';
            statusEmoji = '❌';
            summaryText = `导入失败，有 ${result.invalid} 个无效密钥`;
        } else {
            statusClass = 'error';
            statusEmoji = '❌';
            summaryText = '导入失败';
        }

        resultDiv.innerHTML = `
            <div class="result-summary ${statusClass}">
                <h3>${statusEmoji} ${summaryText}</h3>
                <p>📊 总数: ${result.total}</p>
                <p>✅ 成功: ${result.success}</p>
                <p>🔄 重复: ${result.duplicate}</p>
                <p>❌ 无效: ${result.invalid}</p>
                ${poolGroup ? `<p>🎯 导入到池: ${poolGroup}</p>` : ''}
            </div>
        `;

        // 如果有成功导入，2秒后刷新
        if (result.success > 0) {
            setTimeout(() => {
                refreshData();
            }, 2000);
        }
    } catch (err) {
        const resultDiv = document.getElementById('importResult');
        resultDiv.innerHTML = `
            <div class="result-summary error">
                <h3>❌ 导入失败</h3>
                <p>${err.message}</p>
            </div>
        `;
    }
}

/**
 * 显示添加密钥模态框
 * BaSui: 增强版，包含池子选择！
 */
function showAddKeyModal() {
    // 加载最新的池子选项
    loadPoolGroupOptions('newKeyPoolGroup', true);

    // 清空输入
    document.getElementById('newKeyInput').value = '';
    document.getElementById('newKeyNotes').value = '';

    // 显示模态框
    showModal('addKeyModal');
}

/**
 * 添加密钥（增强版）
 */
async function addKey() {
    const key = document.getElementById('newKeyInput').value.trim();
    const notes = document.getElementById('newKeyNotes').value.trim();
    const poolGroup = document.getElementById('newKeyPoolGroup').value;

    if (!key) {
        alert('请输入密钥');
        return;
    }

    if (!key.startsWith('fk-')) {
        alert('密钥格式错误，必须以 fk- 开头');
        return;
    }

    try {
        await apiRequest('/keys', 'POST', {
            key,
            notes,
            poolGroup: poolGroup || undefined
        });
        alert('✅ 添加成功！');
        closeModal('addKeyModal');
        refreshData();
    } catch (err) {
        alert('❌ 添加失败: ' + err.message);
    }
}

// ===== 🚀 页面加载时初始化 =====
window.addEventListener('load', () => {
    // 延迟1秒加载，确保认证完成
    setTimeout(() => {
        initializeAllPoolSelects();
    }, 1000);
});

console.log('🎯 密钥池选择 UI 模块加载完成！');
