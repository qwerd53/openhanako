改动的文件

修改 (6):
  server/index.js          ← HANA_HOST + 路径鉴权 + 静态文件服务
  package.json             ← 新增 build:web 脚本
  desktop/src/modules/platform.js        ← getServerHost
  desktop/src/react/services/server-connection.ts ← serverHost 参数
  desktop/src/react/app-init.ts          ← 传入 serverHost
  desktop/src/react/types.ts             ← PlatformApi 类型

新增 (3):
  vite.config.web.js       ← Web SPA 构建配置
  vite.config.web-theme.js ← 主题构建
  desktop/src/web.html     ← Web 入口 HTML
Linux 服务器打包步骤
把项目上传到 Linux 服务器后，执行：


# 1. 安装依赖（需要 C++ 编译工具链编译 better-sqlite3）
sudo apt install build-essential python3 -y
npm install

# 2. 构建 Web 前端
npm run build:web

# 3. 构建独立服务器包（linux-x64）
npm run build:server linux x64
产出物在：

dist-web/ — Web 前端静态文件
dist-server/linux-x64/ — 独立服务器包（内置 Node.js 运行时）
启动 Web GUI

HANA_HOST=0.0.0.0 HANA_PORT=3000 HANA_SERVE_WEB=1 HANA_CORS_ORIGIN=http://你的域名:3000 node server/index.js
启动后会打印访问链接：


[server] Web GUI: http://localhost:3000?token=abc123...
浏览器打开即可使用。

打包成可分发的压缩包

# 把前端 + 独立服务器包打包
mkdir -p hanako-web-gui
cp -r dist-web hanako-web-gui/
cp -r dist-server/linux-x64/* hanako-web-gui/

# 创建启动脚本
cat > hanako-web-gui/start.sh << 'SCRIPT'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export HANA_HOST="${HANA_HOST:-0.0.0.0}"
export HANA_PORT="${HANA_PORT:-3000}"
export HANA_SERVE_WEB=1
export HANA_CORS_ORIGIN="${HANA_CORS_ORIGIN:-*}"
export HANA_HOME="${HANA_HOME:-$HOME/.hanako}"
"$DIR/hana-server"
SCRIPT
chmod +x hanako-web-gui/start.sh

# 打包
tar -czf hanako-web-gui-linux-x64.tar.gz hanako-web-gui/
复制 hanako-web-gui-linux-x64.tar.gz 到任意 Linux 服务器，解压后 ./start.sh 即可运行。Electron 打包 (npm run dist:linux) 完全不受影响。