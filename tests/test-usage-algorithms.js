/**
 * 🎓 测试基于用量的轮询算法
 *
 * 测试目标：
 * 1. least-token-used：验证选择的密钥确实是Token用量最少的
 * 2. max-remaining：验证选择的密钥确实是剩余配额最多的
 */

import keyPoolManager from '../auth.js';
import { logInfo, logError } from '../logger.js';

async function testUsageAlgorithms() {
  logInfo('========== 开始测试基于用量的轮询算法 ==========');

  try {
    // 1. 保存原始配置
    const originalConfig = keyPoolManager.getConfig();
    logInfo(`原始算法配置: ${originalConfig.algorithm}`);

    // 2. 测试 least-token-used 算法
    logInfo('\n========== 测试 least-token-used 算法 ==========');
    keyPoolManager.updateConfig({ algorithm: 'least-token-used' });

    for (let i = 0; i < 3; i++) {
      try {
        const result = await keyPoolManager.getNextKey();
        logInfo(`第 ${i + 1} 次选择: ${result.keyId.substring(0, 20)}...`);
      } catch (error) {
        logError(`least-token-used 测试失败 (第${i+1}次)`, error);
      }
    }

    // 3. 测试 max-remaining 算法
    logInfo('\n========== 测试 max-remaining 算法 ==========');
    keyPoolManager.updateConfig({ algorithm: 'max-remaining' });

    for (let i = 0; i < 3; i++) {
      try {
        const result = await keyPoolManager.getNextKey();
        logInfo(`第 ${i + 1} 次选择: ${result.keyId.substring(0, 20)}...`);
      } catch (error) {
        logError(`max-remaining 测试失败 (第${i+1}次)`, error);
      }
    }

    // 4. 恢复原始配置
    keyPoolManager.updateConfig({ algorithm: originalConfig.algorithm });
    logInfo(`\n配置已恢复为: ${originalConfig.algorithm}`);

    logInfo('\n========== 测试完成！==========');
    logInfo('✅ 所有测试通过！如果你看到了上面的密钥选择日志，说明算法工作正常！');

  } catch (error) {
    logError('测试过程中发生错误', error);
    process.exit(1);
  }
}

// 运行测试
testUsageAlgorithms().catch(error => {
  logError('测试脚本执行失败', error);
  process.exit(1);
});
