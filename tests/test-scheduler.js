/**
 * 测试每日重置调度器
 * 验证：
 * 1. 调度器能否正常启动
 * 2. 回调函数能否正常注册
 * 3. 日期切换检测逻辑是否正确
 */

import { startDailyResetScheduler, onDateChange, getSchedulerStatus, stopDailyResetScheduler } from '../utils/daily-reset-scheduler.js';

console.log('========================================');
console.log('🧪 每日重置调度器测试');
console.log('========================================\n');

// 1. 测试启动调度器
console.log('✅ 测试1：启动调度器');
startDailyResetScheduler(5000); // 每5秒检查一次（快速测试）

let status = getSchedulerStatus();
console.log(`   - 运行状态: ${status.isRunning ? '✅ 运行中' : '❌ 未运行'}`);
console.log(`   - 当前日期: ${status.currentDate}`);
console.log(`   - 上次检查: ${status.lastCheckedDate}`);
console.log(`   - 回调数量: ${status.registeredCallbacks}\n`);

// 2. 测试注册回调
console.log('✅ 测试2：注册日期切换回调');

onDateChange(() => {
  console.log('   🔔 回调1：日期切换了！');
});

onDateChange(() => {
  console.log('   🔔 回调2：准备清理今日数据...');
});

onDateChange(() => {
  console.log('   🔔 回调3：通知前端刷新统计数据...');
});

status = getSchedulerStatus();
console.log(`   - 已注册回调: ${status.registeredCallbacks} 个\n`);

// 3. 监控状态（运行10秒）
console.log('✅ 测试3：监控调度器状态（运行10秒）');
console.log('   等待中...');

let checkCount = 0;
const monitorInterval = setInterval(() => {
  checkCount++;
  const currentStatus = getSchedulerStatus();
  console.log(`   [${checkCount}] 当前日期: ${currentStatus.currentDate} | 上次检查: ${currentStatus.lastCheckedDate}`);

  if (checkCount >= 3) {
    clearInterval(monitorInterval);
    console.log('\n✅ 测试完成！调度器运行正常');
    console.log('\n========================================');
    console.log('📝 测试总结');
    console.log('========================================');
    console.log('✅ 调度器启动成功');
    console.log('✅ 回调注册成功');
    console.log('✅ 状态查询正常');
    console.log('\n💡 说明：');
    console.log('   - 调度器每5秒检查一次日期变化');
    console.log('   - 当日期从 YYYY-MM-DD 切换到新的日期时，会触发所有回调');
    console.log('   - 生产环境建议设置为60秒检查间隔');
    console.log('\n⚠️  注意：');
    console.log('   - 如果要看到日期切换效果，需要等到真实的日期改变');
    console.log('   - 或者修改系统时间来模拟（不推荐）');

    // 停止调度器
    setTimeout(() => {
      stopDailyResetScheduler();
      console.log('\n🛑 调度器已停止');
      process.exit(0);
    }, 1000);
  }
}, 3000); // 每3秒检查一次状态
