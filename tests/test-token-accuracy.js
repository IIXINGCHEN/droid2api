/**
 * Token 统计准确性测试
 * BaSui: 测试本地统计 vs Factory API 的 Token 差异
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:3000';
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || 'your-admin-access-key';

console.log('\n🧪 Token 统计准确性测试\n');
console.log('========================================\n');

// 1. 获取当前本地统计
async function getLocalStats() {
  const response = await fetch(`${API_BASE}/admin/stats/summary`, {
    headers: { 'Authorization': `Bearer ${ADMIN_ACCESS_KEY}` }
  });

  if (!response.ok) {
    throw new Error(`获取本地统计失败: ${response.status}`);
  }

  return await response.json();
}

// 2. 获取 Factory API 真实使用量
async function getFactoryUsage() {
  const response = await fetch(`${API_BASE}/admin/token/summary`, {
    headers: { 'Authorization': `Bearer ${ADMIN_ACCESS_KEY}` }
  });

  if (!response.ok) {
    throw new Error(`获取 Factory 统计失败: ${response.status}`);
  }

  return await response.json();
}

// 3. 发送测试请求（包含 Extended Thinking）
async function sendTestRequest() {
  console.log('📤 发送测试请求（启用 Extended Thinking）...\n');

  const response = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer fk-test` // 使用密钥池中的密钥
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      stream: true,
      thinking: {
        type: 'enabled',
        budget_tokens: 4096
      },
      messages: [
        {
          role: 'user',
          content: '请用简单的语言解释一下量子计算的基本原理。'
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  // 解析流式响应，提取 Token 统计
  const tokenStats = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0
  };

  let buffer = '';
  for await (const chunk of response.body) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim());

          if (data.type === 'message_start' && data.message?.usage) {
            tokenStats.inputTokens = data.message.usage.input_tokens || 0;
            tokenStats.cacheCreationTokens = data.message.usage.cache_creation_input_tokens || 0;
            tokenStats.cacheReadTokens = data.message.usage.cache_read_input_tokens || 0;
          }

          if (data.type === 'message_delta' && data.usage) {
            tokenStats.outputTokens = data.usage.output_tokens || 0;
            tokenStats.thinkingTokens = data.usage.thinking_output_tokens || 0;
          }
        } catch (e) {
          // 忽略非JSON行
        }
      }
    }
  }

  console.log('✅ 请求完成！');
  console.log(`📊 响应中的 Token 统计：`);
  console.log(`   - 输入 Token: ${tokenStats.inputTokens}`);
  console.log(`   - 输出 Token: ${tokenStats.outputTokens}`);
  console.log(`   - 推理 Token: ${tokenStats.thinkingTokens}`);
  console.log(`   - 缓存创建 Token: ${tokenStats.cacheCreationTokens}`);
  console.log(`   - 缓存读取 Token: ${tokenStats.cacheReadTokens}`);
  console.log(`   - 总计: ${tokenStats.inputTokens + tokenStats.outputTokens + tokenStats.thinkingTokens}\n`);

  return tokenStats;
}

// 4. 对比统计
async function compareStats(before, after, requestTokens) {
  console.log('\n📊 统计对比\n');
  console.log('========================================\n');

  // 本地统计增量
  const localDelta = {
    input: after.local.today_input_tokens - before.local.today_input_tokens,
    output: after.local.today_output_tokens - before.local.today_output_tokens,
    thinking: (after.local.today_thinking_tokens || 0) - (before.local.today_thinking_tokens || 0),
    cache_creation: (after.local.today_cache_creation_tokens || 0) - (before.local.today_cache_creation_tokens || 0),
    cache_read: (after.local.today_cache_read_tokens || 0) - (before.local.today_cache_read_tokens || 0)
  };

  const localTotal = localDelta.input + localDelta.output + localDelta.thinking;

  console.log('📈 本地统计增量：');
  console.log(`   - 输入 Token: +${localDelta.input}`);
  console.log(`   - 输出 Token: +${localDelta.output}`);
  console.log(`   - 推理 Token: +${localDelta.thinking} ${localDelta.thinking > 0 ? '✅' : '❌ 漏统计了！'}`);
  console.log(`   - 缓存创建 Token: +${localDelta.cache_creation}`);
  console.log(`   - 缓存读取 Token: +${localDelta.cache_read}`);
  console.log(`   - 总计: +${localTotal}\n`);

  console.log('🌐 Factory API 增量：');
  const factoryDelta = after.factory.orgTotalTokensUsed - before.factory.orgTotalTokensUsed;
  console.log(`   - 总计: +${factoryDelta}\n`);

  console.log('🔍 对比结果：');
  const diff = Math.abs(localTotal - factoryDelta);
  const accuracy = ((1 - diff / factoryDelta) * 100).toFixed(2);

  console.log(`   - 本地统计: ${localTotal} tokens`);
  console.log(`   - Factory 统计: ${factoryDelta} tokens`);
  console.log(`   - 差值: ${diff} tokens`);
  console.log(`   - 准确率: ${accuracy}%`);

  if (accuracy >= 95) {
    console.log(`   - 结论: ✅ 统计准确！\n`);
  } else if (accuracy >= 80) {
    console.log(`   - 结论: ⚠️ 统计基本准确，但有一定误差\n`);
  } else {
    console.log(`   - 结论: ❌ 统计不准确，需要进一步调查\n`);
  }

  // 检查推理 Token 是否被统计
  if (requestTokens.thinkingTokens > 0) {
    if (localDelta.thinking > 0) {
      console.log('✅ 推理 Token 已正确统计！\n');
    } else {
      console.log('❌ 推理 Token 未被统计！（这是主要问题）\n');
    }
  }
}

// 主流程
async function main() {
  try {
    // 1. 获取测试前的统计
    console.log('📊 获取测试前的统计...\n');
    const beforeLocal = await getLocalStats();
    const beforeFactory = await getFactoryUsage();

    const before = {
      local: beforeLocal,
      factory: beforeFactory.keys[Object.keys(beforeFactory.keys)[0]]?.standard || {}
    };

    console.log('本地今日 Token: ', before.local.today_tokens);
    console.log('Factory 已使用: ', before.factory.orgTotalTokensUsed);
    console.log('Factory 剩余: ', before.factory.remaining);
    console.log('');

    // 2. 发送测试请求
    const requestTokens = await sendTestRequest();

    // 等待 2 秒（让统计写入）
    console.log('⏱️  等待 2 秒让统计写入...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. 获取测试后的统计
    console.log('📊 获取测试后的统计...\n');
    const afterLocal = await getLocalStats();
    const afterFactory = await getFactoryUsage();

    const after = {
      local: afterLocal,
      factory: afterFactory.keys[Object.keys(afterFactory.keys)[0]]?.standard || {}
    };

    console.log('本地今日 Token: ', after.local.today_tokens);
    console.log('Factory 已使用: ', after.factory.orgTotalTokensUsed);
    console.log('Factory 剩余: ', after.factory.remaining);

    // 4. 对比统计
    await compareStats(before, after, requestTokens);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
