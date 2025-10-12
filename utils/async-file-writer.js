import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { logDebug, logError } from '../logger.js';

/**
 * 异步批量文件写入器 🚀
 *
 * 性能优化核心：
 * - 批量写入（debounce）：高并发时合并多次写入为一次
 * - 异步 I/O：不阻塞主线程
 * - 原子操作：临时文件 + rename 保证数据安全
 * - 自动备份：防止数据损坏
 *
 * 使用场景：
 * - 密钥池频繁更新（每次请求都更新使用次数）
 * - Token 统计实时写入
 * - 请求统计日志
 */

class AsyncFileWriter {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.debounceTime = options.debounceTime || 1000;  // 默认1秒批量写入
    this.maxRetries = options.maxRetries || 3;         // 最大重试次数
    this.retryDelay = options.retryDelay || 500;       // 重试延迟

    this.pendingData = null;      // 待写入数据
    this.writeTimer = null;       // 写入定时器
    this.isWriting = false;       // 是否正在写入
    this.writeQueue = [];         // 写入队列
  }

  /**
   * 异步写入数据（带 debounce）
   * @param {object} data - 要写入的数据
   * @returns {Promise<void>}
   */
  async write(data) {
    // BaSui：缓存待写入数据（后续的写入会覆盖前面的）
    this.pendingData = data;

    // BaSui：清除旧的定时器，重新开始计时
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    // BaSui：debounce - 1秒内的多次写入合并为一次
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ resolve, reject });

      this.writeTimer = setTimeout(async () => {
        await this._flushWrite();
      }, this.debounceTime);
    });
  }

  /**
   * 立即写入（跳过 debounce）
   * @param {object} data - 要写入的数据
   * @returns {Promise<void>}
   */
  async writeImmediately(data) {
    this.pendingData = data;

    // BaSui：清除 debounce 定时器
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }

    return this._flushWrite();
  }

  /**
   * 执行实际写入（带重试机制）
   * @private
   */
  async _flushWrite() {
    // BaSui：防止并发写入（加锁）
    if (this.isWriting) {
      logDebug('Write in progress, skipping...');
      return;
    }

    if (!this.pendingData) {
      return;  // 没有数据需要写入
    }

    this.isWriting = true;
    const dataToWrite = this.pendingData;
    const queueToNotify = [...this.writeQueue];
    this.pendingData = null;
    this.writeQueue = [];

    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logDebug(`Retrying file write: ${this.filePath} (attempt ${attempt + 1}/${this.maxRetries})`);
          await this._sleep(this.retryDelay);
        }

        // BaSui：原子写入（临时文件 + rename）
        await this._atomicWrite(dataToWrite);

        logDebug(`File written successfully: ${this.filePath}${attempt > 0 ? ` (after ${attempt + 1} attempts)` : ''}`);

        // BaSui：通知所有等待的 Promise
        queueToNotify.forEach(({ resolve }) => resolve());

        this.isWriting = false;
        return;  // 写入成功
      } catch (error) {
        lastError = error;
        logError(`File write failed (attempt ${attempt + 1}/${this.maxRetries}): ${this.filePath}`, error);
      }
    }

    // BaSui：所有重试都失败了
    this.isWriting = false;
    const errorMsg = `文件写入失败（尝试${this.maxRetries}次）: ${this.filePath} - ${lastError.message}`;
    logError(errorMsg, lastError);

    // BaSui：通知所有等待的 Promise 失败
    queueToNotify.forEach(({ reject }) => reject(new Error(errorMsg)));
  }

  /**
   * 原子写入操作（临时文件 + rename）
   * @private
   */
  async _atomicWrite(data) {
    const jsonData = JSON.stringify(data, null, 2);
    const tempPath = this.filePath + '.tmp';
    const backupPath = this.filePath + '.bak';

    // 1. 写入临时文件
    await fs.writeFile(tempPath, jsonData, 'utf-8');

    // 2. 验证写入的数据是否正确
    const written = await fs.readFile(tempPath, 'utf-8');
    if (written !== jsonData) {
      throw new Error('写入验证失败：文件内容不匹配');
    }

    // 3. 备份旧文件（如果存在）
    try {
      await fs.access(this.filePath);
      await fs.copyFile(this.filePath, backupPath);
    } catch (err) {
      // 文件不存在，不需要备份
    }

    // 4. 原子重命名（这是原子操作，即使进程崩溃也不会损坏）
    await fs.rename(tempPath, this.filePath);
  }

  /**
   * 睡眠工具函数
   * @private
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 销毁写入器（应用退出时调用）
   */
  async destroy() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    // BaSui：立即写入剩余数据
    if (this.pendingData) {
      await this._flushWrite();
    }
  }
}

/**
 * 全局写入器管理器（单例模式）
 */
class FileWriterManager {
  constructor() {
    this.writers = new Map();
  }

  /**
   * 获取或创建写入器
   * @param {string} filePath - 文件路径
   * @param {object} options - 配置选项
   * @returns {AsyncFileWriter}
   */
  getWriter(filePath, options = {}) {
    if (!this.writers.has(filePath)) {
      this.writers.set(filePath, new AsyncFileWriter(filePath, options));
    }
    return this.writers.get(filePath);
  }

  /**
   * 销毁所有写入器
   */
  async destroyAll() {
    const destroyPromises = [];
    for (const writer of this.writers.values()) {
      destroyPromises.push(writer.destroy());
    }
    await Promise.all(destroyPromises);
    this.writers.clear();
  }
}

// BaSui：全局单例
const fileWriterManager = new FileWriterManager();

export { AsyncFileWriter, fileWriterManager };
export default fileWriterManager;
