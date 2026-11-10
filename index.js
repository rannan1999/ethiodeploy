const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// ==================== 统一全局变量配置 ====================
// 1. 哪吒探针配置
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.mingfei1981.eu.org';
const NEZHA_PORT = process.env.NEZHA_PORT || '443';
const NEZHA_KEY = process.env.NEZHA_KEY || '';

// 2. 通用 / Vless 核心配置
const UUID = process.env.UUID || 'faacf142-dee8-48c2-8558-641123eb939c';
const ARGO_PORT = process.env.ARGO_PORT || '8001';

// 3. Argo 隧道配置
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';

// 4. Web 服务端口
const PORT = process.env.PORT || 3000;
// ========================================================

// 简单 HTTPS 下载助手
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`[Download] Fetching ${url} ...`);
        const file = fs.createWriteStream(dest);

        const getWithRedirect = (currentUrl) => {
            https.get(currentUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    getWithRedirect(response.headers.location);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to get '${currentUrl}' (${response.statusCode})`));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`[Download] Saved to ${dest}`);
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        };

        getWithRedirect(url);
    });
}

// 创建默认 index.html（如果不存在）
function ensureIndexHtml() {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('[Init] index.html already exists, skipping creation.');
        return;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>服务运行中</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 40px 50px;
            max-width: 520px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
        }
        h1 {
            font-size: 28px;
            margin-bottom: 12px;
            color: #4ade80;
        }
        .status {
            display: inline-block;
            background: rgba(74, 222, 128, 0.15);
            color: #4ade80;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
            margin-bottom: 30px;
        }
        p {
            line-height: 1.7;
            color: #a0aec0;
            margin-bottom: 16px;
        }
        .info {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            padding: 16px;
            margin-top: 24px;
            text-align: left;
            font-size: 13px;
            color: #cbd5e0;
        }
        .info div {
            margin: 6px 0;
        }
        .label {
            color: #718096;
            display: inline-block;
            width: 90px;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>服务运行中</h1>
        <div class="status">● Online</div>
        <p>Vless + Cloudflare Argo + 哪吒探针 已启动</p>
        <p>健康检查接口正常，页面由 Node.js 静态服务提供</p>
        <div class="info">
            <div><span class="label">UUID</span> ${UUID}</div>
            <div><span class="label">Argo Port</span> ${ARGO_PORT}</div>
            <div><span class="label">Web Port</span> ${PORT}</div>
            <div><span class="label">Domain</span> ${ARGO_DOMAIN || '未配置'}</div>
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(indexPath, htmlContent, 'utf8');
    console.log('[Init] Default index.html created successfully.');
}

// 0. 初始化环境：下载哪吒探针、Vless 核心与 Cloudflare 客户端
async function initializeEnvironment() {
    const arch = os.arch(); // 'arm64', 'x64', etc.
    const isArm = arch === 'arm64' || arch === 'aarch64';

    // 1. 哪吒探针路径及下载链接
    const agentPath = path.resolve('./app_agent');
    const agentUrl = isArm
        ? 'https://btpp.mu2023.eu.org/download/arm64agent'
        : 'https://btpp.mu2023.eu.org/download/amd64agent';

    if (!fs.existsSync(agentPath)) {
        await downloadFile(agentUrl, agentPath);
    } else {
        console.log(`[Init] Nezha agent already exists at ${agentPath}, skipping download.`);
    }

    // 2. Vless 核心路径及下载链接
    const sbPath = path.resolve('./app_sb');
    const sbUrl = isArm
        ? 'https://github.com/babama1001980/good/releases/download/npc/armsb'
        : 'https://github.com/babama1001980/good/releases/download/npc/amdsb';

    if (!fs.existsSync(sbPath)) {
        await downloadFile(sbUrl, sbPath);
    } else {
        console.log(`[Init] Vless core already exists at ${sbPath}, skipping download.`);
    }

    // 3. Cloudflared 路径及下载链接
    const argoPath = path.resolve('./cloudflared');
    const argoUrl = isArm
        ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
        : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

    if (!fs.existsSync(argoPath)) {
        await downloadFile(argoUrl, argoPath);
    } else {
        console.log(`[Init] Cloudflared already exists at ${argoPath}, skipping download.`);
    }

    // 4. 显式赋予所有二进制文件可执行权限 (0o755)
    [agentPath, sbPath, argoPath].forEach((file) => {
        try {
            fs.chmodSync(file, 0o755);
            console.log(`[Init] Set 755 permission for ${path.basename(file)}.`);
        } catch (e) {
            console.error(`[Init] Failed to set permissions for ${path.basename(file)}:`, e);
        }
    });

    // 5. 确保 index.html 存在
    ensureIndexHtml();

    return { agentPath, sbPath, argoPath };
}

// 1. 保活 HTTP 及 index.html 访问支持
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('index.html not found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OK');
    }
});

server.listen(PORT, () => {
    console.log(`[Server] Health check and static server listening on port ${PORT}`);
});

// 2. 初始化完成后启动各项服务
initializeEnvironment().then(({ agentPath, sbPath, argoPath }) => {

    // --- A. 启动 Vless 核心 (生成 config.json 并运行) ---
    const configContent = {
        log: { disabled: false, level: "info", timestamp: true },
        inbounds: [
            {
                type: "vless",
                tag: "vless-in",
                listen: "127.0.0.1",
                listen_port: parseInt(ARGO_PORT),
                users: [
                    {
                        name: "user",
                        uuid: UUID,
                        flow: ""
                    }
                ],
                transport: {
                    type: "ws",
                    path: "/vless-argo"
                }
            }
        ],
        outbounds: [
            { type: "direct", tag: "direct" },
            { type: "block", tag: "block" }
        ]
    };

    const configPath = path.resolve('./config.json');
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    console.log(`[Vless] Generated config.json on port ${ARGO_PORT}`);

    const sbProcess = spawn(sbPath, ['run', '-c', configPath], { stdio: 'inherit' });
    sbProcess.on('error', (err) => console.error('[Vless Error]', err));
    sbProcess.on('close', (code) => console.log(`[Vless] Exited with code ${code}`));


    // --- B. 启动 Cloudflare Argo 隧道 ---
    if (ARGO_AUTH) {
        const argoArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', 'run', '--token', ARGO_AUTH];
        console.log(`[Argo] Starting Cloudflare Tunnel for domain: ${ARGO_DOMAIN || 'token mode'}`);
        const argoProcess = spawn(argoPath, argoArgs, { stdio: 'inherit' });
        argoProcess.on('error', (err) => console.error('[Argo Error]', err));
        argoProcess.on('close', (code) => console.log(`[Argo] Exited with code ${code}`));
    } else {
        console.warn('[Argo] ARGO_AUTH is empty, skipping Cloudflare Tunnel.');
    }


    // --- C. 启动哪吒探针 (Nezha Agent) ---
    if (NEZHA_KEY) {
        const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
        const args = [];

        if (NEZHA_PORT) {
            args.push('-s', `${NEZHA_SERVER}:${NEZHA_PORT}`);
            args.push('-p', NEZHA_KEY);
            if (tlsPorts.includes(String(NEZHA_PORT))) {
                args.push('--tls');
            }
        } else {
            const isTls = tlsPorts.some(p => NEZHA_SERVER.includes(p));
            const configYaml = `client_secret: ${NEZHA_KEY}\nserver: ${NEZHA_SERVER}:${NEZHA_PORT}\ntls: ${isTls}\nuuid: ${UUID}\n`;
            const nezhaConfigPath = path.resolve('./nezha.yaml');
            fs.writeFileSync(nezhaConfigPath, configYaml);
            args.push('-c', nezhaConfigPath);
        }

        console.log(`[Nezha] Starting agent: ${agentPath} ${args.join(' ')}`);
        const nezhaProcess = spawn(agentPath, args, { stdio: 'inherit' });

        nezhaProcess.on('error', (err) => {
            console.error('[Nezha Error] Failed to start Nezha process:', err);
        });

        nezhaProcess.on('close', (code) => {
            console.log(`[Nezha] Agent exited with code ${code}`);
        });
    } else {
        console.warn('[Nezha] NEZHA_KEY is empty, skipping Nezha agent.');
    }

}).catch(err => {
    console.error('[Init Error] Failed to initialize environment:', err);
});
