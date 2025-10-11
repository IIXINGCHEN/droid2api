import { logDebug } from '../logger.js';

export class OpenAIResponseTransformer {
  constructor(model, requestId) {
    this.model = model;
    this.requestId = requestId || `chatcmpl-${Date.now()}`;
    this.created = Math.floor(Date.now() / 1000);
  }

  parseSSELine(line) {
    if (line.startsWith('event:')) {
      return { type: 'event', value: line.slice(6).trim() };
    }
    if (line.startsWith('data:')) {
      const dataStr = line.slice(5).trim();
      try {
        return { type: 'data', value: JSON.parse(dataStr) };
      } catch (e) {
        return { type: 'data', value: dataStr };
      }
    }
    return null;
  }

  transformEvent(eventType, eventData) {
    logDebug(`Target OpenAI event: ${eventType}`);

    if (eventType === 'response.created') {
      return this.createOpenAIChunk('', 'assistant', false);
    }

    if (eventType === 'response.in_progress') {
      return null;
    }

    if (eventType === 'response.output_text.delta') {
      const text = eventData.delta || eventData.text || '';
      return this.createOpenAIChunk(text, null, false);
    }

    if (eventType === 'response.output_text.done') {
      return null;
    }

    if (eventType === 'response.done') {
      const status = eventData.response?.status;
      let finishReason = 'stop';
      
      if (status === 'completed') {
        finishReason = 'stop';
      } else if (status === 'incomplete') {
        finishReason = 'length';
      }

      const finalChunk = this.createOpenAIChunk('', null, true, finishReason);
      const done = this.createDoneSignal();
      return finalChunk + done;
    }

    return null;
  }

  createOpenAIChunk(content, role = null, finish = false, finishReason = null) {
    const chunk = {
      id: this.requestId,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finish ? finishReason : null
        }
      ]
    };

    if (role) {
      chunk.choices[0].delta.role = role;
    }
    if (content) {
      chunk.choices[0].delta.content = content;
    }

    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  createDoneSignal() {
    return 'data: [DONE]\n\n';
  }

  async *transformStream(sourceStream) {
    let buffer = '';
    let currentEvent = null;
    // 老王：添加buffer大小保护，防止内存溢出（最大10KB未处理行）
    const MAX_BUFFER_SIZE = 10 * 1024;

    try {
      for await (const chunk of sourceStream) {
        // 老王：优化 - 避免超大chunk直接toString可能的性能问题
        const chunkStr = chunk.toString();
        buffer += chunkStr;

        // 老王：内存保护 - 如果buffer过大说明没有换行符，截断并警告
        if (buffer.length > MAX_BUFFER_SIZE) {
          logDebug(`⚠️ Buffer size exceeded ${MAX_BUFFER_SIZE} bytes, truncating`);
          buffer = buffer.slice(-MAX_BUFFER_SIZE); // 保留最后10KB
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后不完整的行

        for (const line of lines) {
          if (!line.trim()) continue;

          const parsed = this.parseSSELine(line);
          if (!parsed) continue;

          if (parsed.type === 'event') {
            currentEvent = parsed.value;
          } else if (parsed.type === 'data') {
            // 老王：如果没有event行，使用默认值，避免丢失数据
            const eventType = currentEvent || 'response.data';
            const transformed = this.transformEvent(eventType, parsed.value);
            if (transformed) {
              yield transformed;
              // 老王：优化 - yield后立即释放引用，帮助GC
            }
            currentEvent = null;
          }
        }
      }

      if (currentEvent === 'response.done' || currentEvent === 'response.completed') {
        yield this.createDoneSignal();
      }
    } catch (error) {
      logDebug('Error in OpenAI stream transformation', error);
      throw error;
    }
  }
}
