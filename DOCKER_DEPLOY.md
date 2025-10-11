# Docker 部署指南

## 本地 Docker 部署

### 1. 准备环境变量

创建 `.env` 文件（从 `.env.example` 复制）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置认证方式和管理后台：

```env
# ===== API 认证配置（三选一） =====
# 方式1：使用固定API密钥（推荐生产环境）
FACTORY_API_KEY=your_factory_api_key_here

# 方式2：使用refresh token自动刷新
DROID_REFRESH_KEY=your_actual_refresh_token_here

# ===== 管理后台配置（强烈推荐） =====
ADMIN_ACCESS_KEY=your-secure-admin-password

# ===== 服务配置（可选） =====
PORT=3000
NODE_ENV=production
```

**优先级：FACTORY_API_KEY > DROID_REFRESH_KEY > 客户端authorization**

**重要提示**：
- `ADMIN_ACCESS_KEY` 用于保护管理后台，请设置强密码
- `NODE_ENV=production` 启用文件日志到 `logs/` 目录

### 2. 使用 Docker Compose 启动

```bash
docker-compose up -d
```

查看日志：

```bash
docker-compose logs -f
```

停止服务：

```bash
docker-compose down
```

### 3. 使用原生 Docker 命令

**构建镜像：**

```bash
docker build -t droid2api:latest .
```

**运行容器：**

```bash
# 方式1：使用固定API密钥
docker run -d \
  --name droid2api \
  -p 3000:3000 \
  -e FACTORY_API_KEY="your_factory_api_key_here" \
  droid2api:latest

# 方式2：使用refresh token
docker run -d \
  --name droid2api \
  -p 3000:3000 \
  -e DROID_REFRESH_KEY="your_refresh_token_here" \
  droid2api:latest
```

**查看日志：**

```bash
docker logs -f droid2api
```

**停止容器：**

```bash
docker stop droid2api
docker rm droid2api
```

## 云平台部署

### Render.com 部署

1. 在 Render 创建新的 Web Service
2. 连接你的 GitHub 仓库
3. 配置：
   - **Environment**: Docker
   - **Branch**: docker-deploy
   - **Port**: 3000
4. 添加环境变量（选择其一）：
   - `FACTORY_API_KEY`: 固定API密钥（推荐）
   - `DROID_REFRESH_KEY`: refresh token
5. 点击 "Create Web Service"

### Railway 部署

1. 在 Railway 创建新项目
2. 选择 "Deploy from GitHub repo"
3. 选择分支：docker-deploy
4. Railway 会自动检测 Dockerfile
5. 添加环境变量（选择其一）：
   - `FACTORY_API_KEY`: 固定API密钥（推荐）
   - `DROID_REFRESH_KEY`: refresh token
6. 部署完成后会自动分配域名

### Fly.io 部署

1. 安装 Fly CLI：
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. 登录：
   ```bash
   fly auth login
   ```

3. 初始化应用（在项目目录）：
   ```bash
   fly launch
   ```

4. 设置环境变量（选择其一）：
   ```bash
   # 使用固定API密钥（推荐）
   fly secrets set FACTORY_API_KEY="your_factory_api_key_here"
   
   # 或使用refresh token
   fly secrets set DROID_REFRESH_KEY="your_refresh_token_here"
   ```

5. 部署：
   ```bash
   fly deploy
   ```

### Google Cloud Run 部署

1. 构建并推送镜像：
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/droid2api
   ```

2. 部署到 Cloud Run：
   ```bash
   # 使用固定API密钥（推荐）
   gcloud run deploy droid2api \
     --image gcr.io/YOUR_PROJECT_ID/droid2api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars FACTORY_API_KEY="your_factory_api_key_here" \
     --port 3000
   
   # 或使用refresh token
   gcloud run deploy droid2api \
     --image gcr.io/YOUR_PROJECT_ID/droid2api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DROID_REFRESH_KEY="your_refresh_token_here" \
     --port 3000
   ```

### AWS ECS 部署

1. 创建 ECR 仓库
2. 推送镜像到 ECR
3. 创建 ECS 任务定义
4. 配置环境变量（选择其一）：
   - `FACTORY_API_KEY`（推荐）
   - `DROID_REFRESH_KEY`
5. 创建 ECS 服务

## 持久化配置

### 密钥池数据持久化

密钥池数据存储在 `key_pool.json`，容器重启会丢失。**生产环境强烈推荐挂载数据卷**。

### Docker Compose 方式

修改 `docker-compose.yml`：

```yaml
services:
  droid2api:
    volumes:
      - key-pool-data:/app/key_pool.json      # 密钥池数据
      - logs-data:/app/logs                    # 日志目录

volumes:
  key-pool-data:
  logs-data:
```

### Docker 命令方式

```bash
# 创建数据卷
docker volume create droid2api-keypool
docker volume create droid2api-logs

# 使用固定API密钥
docker run -d \
  --name droid2api \
  -p 3000:3000 \
  -e FACTORY_API_KEY="your_factory_api_key_here" \
  -e ADMIN_ACCESS_KEY="your-admin-password" \
  -e NODE_ENV="production" \
  -v droid2api-keypool:/app/key_pool.json \
  -v droid2api-logs:/app/logs \
  droid2api:latest

# 或使用refresh token
docker run -d \
  --name droid2api \
  -p 3000:3000 \
  -e DROID_REFRESH_KEY="your_refresh_token_here" \
  -e ADMIN_ACCESS_KEY="your-admin-password" \
  -e NODE_ENV="production" \
  -v droid2api-keypool:/app/key_pool.json \
  -v droid2api-logs:/app/logs \
  droid2api:latest
```

## 健康检查

容器启动后，可以通过以下端点检查服务状态：

```bash
# 检查服务基本状态
curl http://localhost:3000/

# 获取可用模型列表
curl http://localhost:3000/v1/models

# 检查管理后台（需要ADMIN_ACCESS_KEY）
curl -H "x-admin-key: your-admin-key" http://localhost:3000/admin/stats
```

## 管理后台访问

### Web界面

浏览器访问 `http://localhost:3000/` 或 `http://your-domain.com/`

**功能列表**：
- 密钥池统计信息
- 添加/删除/测试密钥
- 批量导入密钥
- 导出密钥列表
- 配置轮询算法

### API接口

所有管理接口需要在请求头中添加 `x-admin-key`：

```bash
# 获取密钥池统计
curl -H "x-admin-key: your-admin-key" http://localhost:3000/admin/stats

# 批量测试所有密钥
curl -X POST -H "x-admin-key: your-admin-key" http://localhost:3000/admin/keys/test-all

# 导出所有active状态的密钥
curl -H "x-admin-key: your-admin-key" "http://localhost:3000/admin/keys/export?status=active"
```

## 环境变量说明

| 变量名 | 必需 | 优先级 | 说明 |
|--------|------|--------|------|
| `FACTORY_API_KEY` | 否 | 最高 | 固定API密钥，跳过自动刷新（推荐生产环境） |
| `DROID_REFRESH_KEY` | 否 | 次高 | Factory refresh token，用于自动刷新 API key |
| `ADMIN_ACCESS_KEY` | 强烈推荐 | - | 管理后台访问密钥，保护 `/admin/*` 接口 |
| `NODE_ENV` | 否 | - | 运行环境（development/production），默认 production |
| `PORT` | 否 | - | 服务端口，默认 3000 |

**重要提示**：
- `FACTORY_API_KEY` 和 `DROID_REFRESH_KEY` 至少配置一个
- **必须配置 `ADMIN_ACCESS_KEY`** 以保护管理后台安全
- `NODE_ENV=production` 时日志写入 `logs/` 目录，按天轮换

## 故障排查

### 容器无法启动

查看日志：
```bash
docker logs droid2api
```

常见问题：
- 缺少认证配置（`FACTORY_API_KEY` 或 `DROID_REFRESH_KEY`）
- API密钥或refresh token 无效或过期
- 端口 3000 已被占用
- `ADMIN_ACCESS_KEY` 未设置或使用默认值（需要更改）

### API 请求返回 401

**原因**：API密钥或refresh token 过期或无效

**解决**：
1. 如果使用 `FACTORY_API_KEY`：检查密钥是否有效
2. 如果使用 `DROID_REFRESH_KEY`：获取新的 refresh token
3. 更新环境变量
4. 重启容器

### 容器频繁重启

检查健康检查日志和应用日志，可能是：
- 内存不足
- API key 刷新失败
- 配置文件错误

## 安全建议

1. **不要将 `.env` 文件提交到 Git**
2. **使用 secrets 管理敏感信息**（如 GitHub Secrets、Docker Secrets）
3. **生产环境推荐使用 `FACTORY_API_KEY`**（更稳定，无需刷新）
4. **必须设置强 `ADMIN_ACCESS_KEY`** 保护管理后台
5. **定期更新 API 密钥和 refresh token**
6. **启用 HTTPS**（云平台通常自动提供）
7. **限制管理后台访问来源**（通过防火墙或云平台配置）
8. **定期备份 `key_pool.json`** 密钥池数据
9. **使用数据卷持久化** 密钥池和日志数据

## 性能优化

### 多阶段构建（可选）

```dockerfile
# 构建阶段
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 生产阶段
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 资源限制

在 docker-compose.yml 中添加：

```yaml
services:
  droid2api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 监控和日志

### 日志系统

droid2api 使用智能日志系统：

**生产模式（NODE_ENV=production）**：
- 控制台：简洁日志
- 文件：详细日志写入 `logs/droid2api_YYYY-MM-DD.log`
- 自动按天轮换

**开发模式（NODE_ENV=development）**：
- 控制台：详细日志
- 文件：不写入

### 查看日志

**Docker Compose**：
```bash
# 实时查看容器日志
docker-compose logs -f

# 查看最近100行
docker-compose logs --tail=100

# 查看文件日志（如果挂载了卷）
docker exec droid2api ls /app/logs
docker exec droid2api cat /app/logs/droid2api_2025-10-11.log
```

**Docker 命令**：
```bash
# 容器日志
docker logs -f droid2api

# 导出日志到文件
docker logs droid2api > droid2api.log 2>&1

# 访问容器内部日志文件
docker exec -it droid2api sh
cd logs
ls -lh
```

### 集成监控工具

可以集成：
- Prometheus + Grafana（指标监控）
- Datadog（全栈监控）
- New Relic（APM性能监控）
- Sentry（错误追踪）
- ELK Stack（日志聚合分析）
