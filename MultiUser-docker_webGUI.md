# Hanako Web GUI — Linux Docker 部署指南

## 概述

Hanako 原本是 Electron 桌面应用（macOS / Windows），现已支持纯 Web 模式运行，可部署在 Linux 服务器上，通过浏览器远程访问。

## 技术架构

```
┌──────────────────────────────────────────────────┐
│                    Browser                        │
│         http://server:3000?token=xxx              │
└──────────────────┬───────────────────────────────┘
                   │ HTTP + WebSocket
                   ▼
┌──────────────────────────────────────────────────┐
│              Hono Server (Node.js)                │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ /api/* (REST)│  │ /ws (WebSocket)          │  │
│  │ Auth: Bearer │  │ Auth: ?token= query      │  │
│  └─────────────┘  └──────────────────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │ SPA Fallback: dist-web/index.html        │   │
│  │ (public, no auth required)               │   │
│  └──────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────┴───────────────────────────────┐
│              HanaEngine + Hub                     │
│  (Agent, Session, Model, Memory, Plugins...)     │
└──────────────────┬───────────────────────────────┘
                   │
┌──────────────────┴───────────────────────────────┐
│              /data (persistent volume)            │
│  agents/, sessions/, facts.db, configs...        │
└──────────────────────────────────────────────────┘
```

**关键设计：**

- **同一个进程** 同时提供 API 和 Web 前端，无需 nginx / 反向代理
- **鉴权分层**：API (`/api/*`, `/ws`) 需要 Bearer token；静态资源和 SPA 路由公开
- **平台适配**：`desktop/src/modules/platform.js` 在非 Electron 环境下自动切换到 Web fallback，所有 Electron 专有 API 静默降级

## 新增 / 修改文件清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `vite.config.web.js` | Web SPA 构建配置（base: `/`，单入口 `web.html`，输出到 `dist-web/`） |
| `vite.config.web-theme.js` | 主题 IIFE bundle 构建（输出 `dist-web/lib/theme.js`） |
| `desktop/src/web.html` | Web 入口 HTML（CSP 适配，无 Electron 依赖） |
| `Dockerfile` | 多阶段 Docker 镜像构建 |
| `docker-compose.yml` | 一键部署配置 |
| `.dockerignore` | Docker 构建排除规则 |

### 修改文件

#### `server/index.js`

**1. `HANA_HOST` 环境变量（行 516）**

```js
// 之前：硬编码
const host = "127.0.0.1";

// 之后：可配置
const host = process.env.HANA_HOST || "127.0.0.1";
```

设置 `HANA_HOST=0.0.0.0` 即可接受远程连接。

**2. 鉴权中间件改为路径感知（行 161-165）**

```js
// 只对 API 和 WebSocket 路径要求 token
const p = c.req.path;
const needsAuth = p.startsWith("/api/") || p === "/ws" || p === "/internal/browser";
if (!needsAuth) return await next();
// ... token 校验
```

静态文件（`.js`, `.css`, `.html`）和 SPA 路由不再需要鉴权，浏览器可直接加载前端页面。

**3. Web 静态文件服务 + SPA fallback（行 514-582）**

当 `HANA_SERVE_WEB=1` 且 `dist-web/` 目录存在时：
- 对非 `/api/*` 路径的 GET 请求，先尝试返回对应的静态文件
- 文件不存在时返回 `index.html`（SPA 路由回退）
- 静态资源设置长期缓存头 (`Cache-Control: public, max-age=31536000, immutable`)

**4. 控制台输出 token 访问链接（行 700-702）**

Web 模式启动时打印完整 URL，方便用户直接复制到浏览器。

#### `desktop/src/modules/platform.js`

```js
// Web fallback 改进：从浏览器 location 获取实际端口和主机名
getServerPort: async () => location.port || (location.protocol === "https:" ? "443" : "80"),
getServerHost: async () => location.hostname,   // 新增
```

#### `desktop/src/react/services/server-connection.ts`

`createLocalServerConnection` 新增 `serverHost` 参数：

```ts
// 之前 baseUrl 和 wsUrl 硬编码为 127.0.0.1
// 之后使用传入的 host（默认 127.0.0.1 保持向后兼容）
const host = serverHost || "127.0.0.1";
baseUrl: `http://${host}:${port}`,
wsUrl: `ws://${host}:${port}`,
```

#### `package.json`

```json
"build:web": "vite build --config vite.config.web.js && vite build --config vite.config.web-theme.js",
"server:web": "HANA_HOST=0.0.0.0 HANA_SERVE_WEB=1 HANA_CORS_ORIGIN=http://localhost node server/index.js"
```

## 快速开始

### 前置条件

- **Docker** 和 **Docker Compose** 已安装（Linux 推荐安装方式见 [Docker 官方文档](https://docs.docker.com/engine/install/)）
- 如果是本地开发构建（不用 Docker），需满足 [CONTRIBUTING.md](CONTRIBUTING.md) 中的开发环境要求

### 方式一：Docker Compose（推荐）

```bash
# 克隆仓库
git clone https://github.com/liliMozi/openhanako.git
cd openhanako

# 构建镜像并启动
docker-compose up -d

# 查看日志，获取访问 token
docker-compose logs hanako | grep "Web GUI"
```

输出示例：
```
[server] Web GUI: http://localhost:3000?token=a1b2c3d4e5f6...
```

浏览器打开日志中的 URL 即可访问。

**自定义配置：**

```bash
# 设置固定 token（避免每次重启 token 变化）
export HANA_TOKEN="your-secret-token"
docker-compose up -d

# 或创建 .env 文件
echo "HANA_TOKEN=your-secret-token" > .env
echo "HANA_CORS_ORIGIN=http://your-domain.com" >> .env
docker-compose up -d
```

### 方式二：手动构建运行

```bash
# 1. 安装依赖
npm install

# 2. 构建 Web 前端
npm run build:web

# 3. 启动服务器
npm run server:web
# 或自定义参数：
# HANA_HOST=0.0.0.0 HANA_PORT=8080 HANA_TOKEN=xxx HANA_SERVE_WEB=1 HANA_CORS_ORIGIN=http://your-domain.com node server/index.js
```

### 方式三：Docker 手动构建

```bash
docker build -t hanako .
docker run -d \
  -p 3000:3000 \
  -v hanako_data:/data \
  -e HANA_TOKEN="your-secret-token" \
  --name hanako \
  hanako
```

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HANA_HOST` | `127.0.0.1` | 服务器绑定地址，设为 `0.0.0.0` 接受远程连接 |
| `HANA_PORT` | `0`（OS 分配） | 服务器端口，Docker 部署建议设为固定值（如 `3000`） |
| `HANA_TOKEN` | 随机生成 16 字节 hex | API / WebSocket 鉴权 token |
| `HANA_SERVE_WEB` | （未设置） | 设为 `1` 启用 Web 前端静态文件服务 |
| `HANA_CORS_ORIGIN` | 仅允许 `localhost` / `127.0.0.1` | 设置浏览器可访问的源，远程访问需设为域名或 `*` |
| `HANA_HOME` | `~/.hanako` | 数据存储目录（Docker 中映射为 `/data`） |

### CORS 配置说明

`HANA_CORS_ORIGIN` 只允许单个精确匹配的源（不支持逗号分隔多值）。远程访问时务必设置：

```bash
# 允许特定域名
HANA_CORS_ORIGIN=http://your-server.com:3000

# 允许任意源（仅限内网 / 开发环境）
HANA_CORS_ORIGIN=*
```

## 鉴权流程

1. 服务器启动时生成或读取 `HANA_TOKEN`
2. 浏览器访问 `http://server:3000?token=<HANA_TOKEN>`
3. 前端从 URL 参数提取 token，存入 `localStorage`
4. 后续所有 API 请求自动携带 `Authorization: Bearer <token>` 头
5. WebSocket 连接通过 URL 参数 `?token=` 传递

> **安全建议**：生产环境请使用固定 `HANA_TOKEN`，并通过反向代理（nginx/Caddy）添加 HTTPS。

## 数据持久化

Docker Compose 配置了命名卷 `hanako_data` 挂载到容器的 `/data` 目录：

```
/data
├── agents/          # Agent 配置
│   └── {agent}/
│       ├── agent.yaml
│       └── sessions/
├── config/          # 应用配置
├── logs/            # 日志文件
├── .pi/             # Pi SDK 数据
└── server-info.json # 运行信息（端口、token）
```

使用 `docker-compose down` 不会删除数据卷。如需清除数据：

```bash
docker-compose down -v
```

## 容器内结构

```
/app
├── server/          # Hono 服务端
├── core/            # Engine 引擎
├── lib/             # 核心库
├── hub/             # 调度器
├── shared/          # 共享工具
├── skills2set/      # 技能包
├── dist-web/        # 构建产物（Web 前端）
├── node_modules/    # 生产依赖
└── package.json
```

## 限制与已知问题

| 功能 | Web 模式支持 | 说明 |
|------|-------------|------|
| 聊天对话 | 完全支持 | HTTP/WS 协议与桌面端一致 |
| 书桌 (Desk) | 支持 | 通过 `/api/fs` 操作文件 |
| 设置面板 | 支持 | Web 模式以模态框打开 |
| 插件管理 | 支持 | |
| 多 Agent | 支持 | |
| Bridge（Telegram/QQ 等） | 支持 | 服务端独立运行，不依赖前端 |
| 系统文件对话框 | 不支持 | 降级为路径输入 |
| Electron 窗口管理 | 不支持 | 静默降级 |
| Computer Use | 不支持 Linux | `isComputerUsePlatformSupported()` 对 Linux 返回 false |
| 沙盒 (Bubblewrap) | 需要 bwrap 二进制 | 容器内安装 `bubblewrap` 包 |
| 自动更新 | 不支持 | Docker 部署通过重建镜像更新 |
| 系统托盘 | 不支持 | Web 环境无系统托盘 API |

### 容器内启用 Bubblewrap 沙盒

```dockerfile
# 在 Dockerfile 中添加
RUN apt-get install -y bubblewrap
```

### 反向代理示例（nginx）

```nginx
server {
    listen 443 ssl;
    server_name hanako.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 后续优化方向

- [ ] Web 登录页面（代替 URL 参数传 token）
- [ ] 多用户支持（用户注册 / 登录、会话隔离）
- [ ] HTTPS 内置支持
- [ ] Web 模式下的文件上传 UI
- [ ] Linux Computer Use 支持
- [ ] Docker Hub 发布预构建镜像
- [ ] Kubernetes Helm Chart
