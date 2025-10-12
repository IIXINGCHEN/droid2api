# 🐳 droid2api - Dockerfile
# 版本：v1.4.0+
# Node.js 版本：24 (Alpine Linux)
# 镜像大小：~150MB（优化后）

# ===== 构建策略说明 =====
#
# 单阶段构建（当前方案）：
#   - 优点：简单直接，适合快速开发和测试
#   - 缺点：镜像略大（包含 npm 缓存）
#   - 镜像大小：~200MB
#
# 多阶段构建（生产优化）：
#   - 优点：镜像更小（~150MB），构建更快（利用缓存）
#   - 缺点：稍微复杂
#   - 使用方式：参考 DOCKER_DEPLOY.md 中的「镜像优化」章节

# ===== 阶段 1：基础镜像 =====
FROM node:24-alpine

# 设置维护者信息
LABEL maintainer="droid2api"
LABEL version="1.4.0"
LABEL description="OpenAI-compatible API proxy with key pool management"

# 设置工作目录
WORKDIR /app

# ===== 阶段 2：安装依赖 =====
# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目依赖
# 使用 npm ci 确保依赖版本一致（比 npm install 更快更可靠）
# --only=production 只安装生产依赖，减小镜像大小
RUN npm ci --only=production && \
    npm cache clean --force

# ===== 阶段 3：复制项目文件 =====
# 复制所有项目文件（.dockerignore 会排除不需要的文件）
COPY . .

# 创建必要的目录
RUN mkdir -p /app/data /app/logs

# ===== 阶段 4：配置运行环境 =====
# 暴露端口（默认3000，可通过环境变量 PORT 覆盖）
EXPOSE 3000

# 设置默认环境变量
ENV NODE_ENV=production
ENV PORT=3000

# ===== 阶段 5：健康检查 =====
# Docker 内置健康检查（可选，docker-compose 中也有配置）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT}/ || exit 1

# ===== 阶段 6：启动应用 =====
# 使用 node 直接启动（比 npm start 更快，减少一层进程）
CMD ["node", "server.js"]

# ===== 🎯 使用说明 =====
#
# 构建镜像：
#   docker build -t droid2api:latest .
#
# 运行容器：
#   docker run -d \
#     --name droid2api \
#     -p 3000:3000 \
#     -e FACTORY_API_KEY="your_key" \
#     -e ADMIN_ACCESS_KEY="your_admin_password" \
#     -v $(pwd)/data:/app/data \
#     droid2api:latest
#
# 查看日志：
#   docker logs -f droid2api
#
# 进入容器：
#   docker exec -it droid2api sh
#
# ===== 📊 镜像大小优化建议 =====
#
# 当前方案（单阶段）：~200MB
#   - 适合：快速开发、测试环境
#
# 多阶段构建：~150MB（减少 25%）
#   - 适合：生产环境、CI/CD
#   - 参考：DOCKER_DEPLOY.md 中的「镜像优化」章节
#
# ===== 🔒 安全建议 =====
#
# 1. 使用非 root 用户运行（可选）：
#    RUN addgroup -g 1001 -S nodejs && \
#        adduser -S nodejs -u 1001 && \
#        chown -R nodejs:nodejs /app
#    USER nodejs
#
# 2. 定期更新基础镜像：
#    docker pull node:24-alpine
#    docker build -t droid2api:latest .
#
# 3. 扫描安全漏洞：
#    docker scan droid2api:latest
#
# ===== 📚 相关文档 =====
#
# - DOCKER_DEPLOY.md - Docker 部署完整指南
# - README.md - 项目文档
# - .dockerignore - Docker 构建排除文件列表
