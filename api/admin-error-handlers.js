import { logError } from '../logger.js';

/**
 * 标准错误响应构造器
 */
export function errorResponse(status, error, message) {
  return {
    status,
    body: {
      error,
      message
    }
  };
}

/**
 * 成功响应构造器
 */
export function successResponse(data, message = null) {
  const response = {
    success: true
  };

  if (message) {
    response.message = message;
  }

  if (data !== undefined) {
    response.data = data;
  }

  return response;
}

/**
 * 处理常见错误并返回对应的HTTP响应
 * 根据error.message自动判断错误类型
 */
export function handleCommonError(error, operation) {
  // 记录错误日志
  logError(`Failed to ${operation}`, error);

  // 根据错误消息判断错误类型
  const errorMsg = error.message;

  // 404错误：资源未找到
  if (errorMsg === 'Key not found') {
    return errorResponse(404, 'Not found', errorMsg);
  }

  // 409错误：资源冲突
  if (errorMsg === 'Key already exists') {
    return errorResponse(409, 'Conflict', errorMsg);
  }

  // 400错误：配置更新失败
  if (operation === 'update config' && errorMsg) {
    return errorResponse(400, 'Bad request', errorMsg);
  }

  // 默认500错误：内部服务器错误
  return errorResponse(500, 'Internal server error', errorMsg);
}

/**
 * 发送错误响应的便捷函数
 */
export function sendErrorResponse(res, error, operation) {
  const { status, body } = handleCommonError(error, operation);
  return res.status(status).json(body);
}

/**
 * 发送成功响应的便捷函数
 */
export function sendSuccessResponse(res, data, message = null) {
  return res.json(successResponse(data, message));
}

/**
 * 参数校验错误响应（400 Bad Request）
 */
export function sendBadRequest(res, message) {
  return res.status(400).json({
    error: 'Bad request',
    message
  });
}

/**
 * 包装异步路由处理函数，自动捕获错误并处理
 * 使用方式：router.get('/path', wrapAsync(async (req, res) => { ... }))
 */
export function wrapAsync(handler, operation = 'process request') {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      sendErrorResponse(res, error, operation);
    }
  };
}

/**
 * 包装同步路由处理函数，自动捕获错误并处理
 */
export function wrapSync(handler, operation = 'process request') {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (error) {
      sendErrorResponse(res, error, operation);
    }
  };
}
