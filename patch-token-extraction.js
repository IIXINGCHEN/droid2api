/**
 * Token 提取逻辑修复补丁
 * BaSui: 这个脚本用来批量修复 routes.js 中的 Token 提取逻辑
 * 补全所有缺失的 Token 类型（thinking, cache_creation, cache_read）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES_FILE = path.join(__dirname, 'routes.js');

console.log('🔧 开始修复 Token 提取逻辑...\n');

// 读取文件
let content = fs.readFileSync(ROUTES_FILE, 'utf-8');

// 修复 1: 修复 /v1/chat/completions 端点的 Anthropic Token 提取
console.log('📝 修复 1/3: /v1/chat/completions 端点（Anthropic）...');
content = content.replace(
  /if \(model\.type === 'anthropic'\) \{\s*\/\/ Anthropic格式\s*if \(data\.type === 'message_start' && data\.message\?\.usage\) \{\s*inputTokens = data\.message\.usage\.input_tokens \|\| 0;\s*\}\s*\/\/ 🔧 修复：message_delta中的output_tokens是累计值，不是增量，不能用\+=\s*if \(data\.type === 'message_delta' && data\.usage\) \{\s*outputTokens = data\.usage\.output_tokens \|\| 0;\s*\}/gm,
  `if (model.type === 'anthropic') {
                    // Anthropic格式 - 完整提取所有Token类型
                    const tokenStats = createTokenStats();
                    extractAnthropicTokens(data, tokenStats);
                    inputTokens = tokenStats.inputTokens;
                    outputTokens = tokenStats.outputTokens;
                    thinkingTokens = (thinkingTokens || 0) + tokenStats.thinkingTokens;
                    cacheCreationTokens = (cacheCreationTokens || 0) + tokenStats.cacheCreationTokens;
                    cacheReadTokens = (cacheReadTokens || 0) + tokenStats.cacheReadTokens;`
);

// 修复 2: 添加缺失的变量声明
console.log('📝 修复 2/3: 添加缺失的 Token 变量...');
content = content.replace(
  /\/\/ BaSui: 收集流式响应中的Token统计\s*let inputTokens = 0;\s*let outputTokens = 0;/gm,
  `// BaSui: 收集流式响应中的Token统计（完整版）
      let inputTokens = 0;
      let outputTokens = 0;
      let thinkingTokens = 0;
      let cacheCreationTokens = 0;
      let cacheReadTokens = 0;`
);

// 修复 3: 更新 recordRequest 调用，传入完整的 Token 统计
console.log('📝 修复 3/3: 更新 recordRequest 调用...');
content = content.replace(
  /recordRequest\(\{\s*inputTokens,\s*outputTokens,\s*model: modelId,\s*success: true\s*\}\);/gm,
  `recordRequest({
            inputTokens,
            outputTokens,
            thinkingTokens,
            cacheCreationTokens,
            cacheReadTokens,
            model: modelId,
            success: true
          });`
);

// 修复 4: 修复日志输出
content = content.replace(
  /logDebug\(`流式响应Token统计.*?: input=\$\{inputTokens\}, output=\$\{outputTokens\}`\);/gm,
  `logDebug(\`流式响应Token统计: input=\${inputTokens}, output=\${outputTokens}, thinking=\${thinkingTokens}, cache_creation=\${cacheCreationTokens}, cache_read=\${cacheReadTokens}\`);`
);

// 保存文件
fs.writeFileSync(ROUTES_FILE, content, 'utf-8');

console.log('\n✅ Token 提取逻辑修复完成！');
console.log('📋 修复内容：');
console.log('   - ✅ 添加 thinkingTokens, cacheCreationTokens, cacheReadTokens 变量');
console.log('   - ✅ 使用 extractAnthropicTokens 提取完整 Token 统计');
console.log('   - ✅ 更新 recordRequest 调用传入完整 Token 数据');
console.log('   - ✅ 更新日志输出显示完整 Token 信息\n');
console.log('🚀 请重启服务器以生效！');
