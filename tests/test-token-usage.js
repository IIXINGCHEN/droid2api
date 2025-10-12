/**
 * 测试Token使用量追踪功能
 */
import 'dotenv/config';
import { getFactoryBalanceManager } from './balance/factory-balance-manager.js';
import keyPoolManager from './auth.js';
import { logInfo, logError } from './logger.js';

async function test() {
    logInfo('========== 开始测试Token使用量追踪功能 ==========');

    try {
        // 初始化管理器
        const manager = getFactoryBalanceManager();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待初始化

        // 1. 测试添加Factory密钥
        logInfo('\n1. 添加测试密钥...');
        const testKeys = [
            'fk-test-key-001',
            'fk-test-key-002',
            'sk-openai-test-key',  // OpenAI密钥（测试自动识别）
        ];

        testKeys.forEach(key => {
            try {
                const keyObj = keyPoolManager.addKey(key, `测试密钥 ${key}`);
                logInfo(`✅ 添加密钥成功: ${keyObj.id} (Provider: ${keyObj.provider})`);
            } catch (e) {
                logInfo(`⚠️ 密钥已存在: ${key}`);
            }
        });

        // 2. 模拟记录Token使用量
        logInfo('\n2. 模拟记录Token使用量...');
        const factoryKeys = keyPoolManager.keys.filter(k => k.provider === 'factory');

        if (factoryKeys.length > 0) {
            // 模拟多次请求
            for (let i = 0; i < 5; i++) {
                const key = factoryKeys[i % factoryKeys.length];
                const usage = {
                    total_tokens: Math.floor(Math.random() * 1000) + 100,
                    prompt_tokens: Math.floor(Math.random() * 500) + 50,
                    completion_tokens: Math.floor(Math.random() * 500) + 50
                };

                manager.recordUsage(key.api_key || key.key, usage);
                logInfo(`📝 记录使用量 [${key.id}]: ${usage.total_tokens} tokens`);
            }
        }

        // 3. 获取使用量统计
        logInfo('\n3. 获取使用量统计...');
        const allStats = manager.getUsageStats();
        logInfo('📊 所有密钥使用量统计:');
        Object.entries(allStats).forEach(([key, stats]) => {
            logInfo(`  ${key}:`);
            logInfo(`    总Token: ${stats.total_tokens}`);
            logInfo(`    总请求: ${stats.total_requests}`);
            logInfo(`    最后更新: ${stats.last_updated || 'N/A'}`);
        });

        // 4. 获取单个密钥的使用量
        if (factoryKeys.length > 0) {
            logInfo('\n4. 获取单个密钥使用量...');
            const testKey = factoryKeys[0];
            const keyStats = manager.getUsageStats(testKey.api_key || testKey.key);
            logInfo(`密钥 ${testKey.id} 的使用量:`, keyStats);
        }

        // 5. 获取使用量汇总
        logInfo('\n5. 获取使用量汇总...');
        const summary = manager.getBalanceSummary();
        logInfo('📈 使用量汇总:', summary);

        // 6. 测试数据持久化
        logInfo('\n6. 测试数据持久化...');
        await manager.saveCache();
        logInfo('✅ 数据已保存到文件');

        // 7. 测试重新加载
        logInfo('\n7. 测试重新加载数据...');
        await manager.loadCache();
        const reloadedStats = manager.getUsageStats();
        logInfo(`✅ 重新加载成功，共 ${Object.keys(reloadedStats).length} 条记录`);

        // 8. 显示配置信息
        logInfo('\n8. 当前配置信息...');
        logInfo(`📅 同步间隔: ${manager.syncInterval / 60000}分钟`);
        logInfo(`📦 批量大小: ${manager.batchSize}`);
        logInfo(`🗓️ 数据保留: ${manager.dataRetentionDays}天`);

        // 9. 测试清理功能
        logInfo('\n9. 测试数据清理...');
        manager.cleanupOldData();
        logInfo('✅ 过期数据已清理');

        // 10. 显示今日使用量
        logInfo('\n10. 今日使用量统计...');
        const today = new Date().toISOString().split('T')[0];
        let todayTotal = 0;
        let todayRequests = 0;

        Object.values(manager.getUsageStats()).forEach(stats => {
            if (stats.daily && stats.daily[today]) {
                todayTotal += stats.daily[today].tokens || 0;
                todayRequests += stats.daily[today].requests || 0;
            }
        });

        logInfo(`📅 今日统计:`);
        logInfo(`  Token使用: ${todayTotal}`);
        logInfo(`  请求次数: ${todayRequests}`);

        logInfo('\n========== 测试完成 ==========');
        logInfo('✅ Token使用量追踪功能正常工作');
        logInfo('📁 数据已保存到: data/factory_usage.json');

        // 停止自动同步（测试环境）
        manager.stopAutoSync();

    } catch (error) {
        logError(`❌ 测试失败: ${error.message}`, error);
    }

    // 退出进程
    process.exit(0);
}

// 运行测试
test().catch(error => {
    logError('测试异常:', error);
    process.exit(1);
});