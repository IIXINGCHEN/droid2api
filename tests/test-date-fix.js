/**
 * 测试日期修复
 * 验证本地时区 vs UTC 时区
 */

// 测试修改后的 getTodayKey 函数（本地时区）
function getTodayKeyLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 测试修改前的 getTodayKey 函数（UTC时区）
function getTodayKeyUTC() {
  return new Date().toISOString().split('T')[0];
}

console.log('='.repeat(80));
console.log('📅 日期修复测试');
console.log('='.repeat(80));
console.log('');

console.log('当前时间信息：');
console.log('  Windows 本地时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
console.log('  UTC 时间:', new Date().toISOString());
console.log('');

console.log('日期 Key 对比：');
console.log('  修改前（UTC时区）:', getTodayKeyUTC());
console.log('  修改后（本地时区）:', getTodayKeyLocal());
console.log('');

console.log('时区差异：');
const utcDate = getTodayKeyUTC();
const localDate = getTodayKeyLocal();
if (utcDate !== localDate) {
  console.log('  ⚠️  UTC 时区与本地时区日期不同！');
  console.log('  这就是为什么"今日Token"没有自动清零的原因！');
} else {
  console.log('  ✅ UTC 时区与本地时区日期相同！');
}
console.log('');

console.log('修复说明：');
console.log('  1. 修改了 utils/daily-reset-scheduler.js 的 getTodayKey()');
console.log('  2. 修改了 utils/request-stats.js 的 getTodayKey()');
console.log('  3. 所有日期相关函数都使用本地时区');
console.log('  4. 重启服务器后，调度器将正确识别日期切换！');
console.log('');

console.log('='.repeat(80));
console.log('✅ 测试完成！请重启服务器以应用修复。');
console.log('='.repeat(80));
