/**
 * BaSui：auth.js 双认证函数补丁
 *
 * 使用方法：
 * 1. 复制下面的两个函数
 * 2. 替换 auth.js 文件底部的 initializeAuth() 和 getApiKey() 函数
 * 3. 删除本文件（auth-functions-patch.js）
 */

/**
 * 初始化认证系统
 * BaSui：五级认证优先级
 * 1. FACTORY_API_KEY 环境变量（最高）
 * 2. 密钥池管理（多用户）
 * 3. DROID_REFRESH_KEY OAuth（自动刷新）
 * 4. data/auth.json / ~/.factory/auth.json（文件认证）
 * 5. 客户端 Authorization（透传）
 */
export async function initializeAuth() {
  logInfo('🚀 Initializing authentication system...');

  // BaSui：检查 FACTORY_API_KEY 环境变量
  const factoryKey = process.env.FACTORY_API_KEY;
  if (factoryKey && factoryKey.trim() !== '') {
    logInfo('✅ FACTORY_API_KEY detected (single-user mode) - Highest priority');
  }

  // BaSui：初始化密钥池
  keyPoolManager.migrateKeyPoolData();
  const stats = keyPoolManager.getStats();
  logInfo(`✅ Key pool initialized: ${stats.active} active, ${stats.disabled} disabled, ${stats.banned} banned`);

  // BaSui：初始化 OAuth 认证
  await oauthAuthenticator.initialize();

  logInfo('🎉 Authentication system initialized successfully!');
}

/**
 * 获取 API Key
 * BaSui：五级认证优先级实现
 */
export async function getApiKey() {
  // 1️⃣ 最高优先级：FACTORY_API_KEY 环境变量
  const factoryKey = process.env.FACTORY_API_KEY;
  if (factoryKey && factoryKey.trim() !== '') {
    logDebug('Using FACTORY_API_KEY from environment (single-user mode)');
    return `Bearer ${factoryKey.trim()}`;
  }

  // 2️⃣ 次优先级：密钥池管理（如果有可用密钥）
  try {
    const stats = keyPoolManager.getStats();
    if (stats.active > 0) {
      const result = await keyPoolManager.getNextKey();
      logDebug(`Using key from key pool: ${result.keyId}`);
      return `Bearer ${result.key}`;
    }
  } catch (error) {
    // BaSui：密钥池没有可用密钥，继续尝试 OAuth
    logDebug('Key pool not available or empty, trying OAuth authentication...');
  }

  // 3️⃣ 第三优先级：DROID_REFRESH_KEY 或 data/auth.json
  try {
    const oauthKey = await oauthAuthenticator.getOAuthApiKey();
    if (oauthKey) {
      logDebug('Using OAuth authentication (DROID_REFRESH_KEY or auth.json)');
      return `Bearer ${oauthKey}`;
    }
  } catch (error) {
    logError('OAuth authentication failed', error);
  }

  // 4️⃣ 最后兜底：抛出错误（客户端 Authorization 由 middleware 处理）
  throw new Error(
    'No API key available. Please configure one of the following:\n' +
    '  1. FACTORY_API_KEY environment variable (single-user mode)\n' +
    '  2. Add keys to key pool via admin API (/admin/keys/add)\n' +
    '  3. DROID_REFRESH_KEY environment variable (OAuth auto-refresh)\n' +
    '  4. Create data/auth.json or ~/.factory/auth.json (file-based auth)\n' +
    '  5. Provide Authorization header in client request (pass-through mode)'
  );
}
