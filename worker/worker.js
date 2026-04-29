// 配置项 - 完全匹配刷机脚本
const CONFIG = {
  // 真实 GitHub 仓库
  githubRepo: "GengWei1997/kernel-deb",
  // 固定版本 tag（你的脚本用的是 v6.18）
  releaseTag: "v6.18",
  pageTitle: "小米 Raphael (K20 Pro) 定制内核镜像",
  footer: "GengWei 开源定制内核 | Cloudflare Worker 高速镜像加速"
};

// 内核更新介绍 + 优化排版文案
const UPDATE_INTRO = `
<h1>小米 Raphael (K20 Pro) 定制 Linux 内核 v6.18</h1>

<div class="card">
<h2>📦 项目简介</h2>
<p>本项目为 <strong>红米 K20 Pro / 小米 9T Pro (设备代号：raphael)</strong> 专属定制 Linux 内核编译项目，基于主线 Linux 6.18 内核适配移植，专为移动端 Linux 系统打磨优化，适配各类 Debian 系第三方系统。</p>
</div>

<div class="card">
<h2>✨ 内核更新特性</h2>
<ul>
<li>基于 <strong>Linux 6.18 主线内核</strong> 编译，修复大量上游底层漏洞</li>
<li>完整适配设备触控、快充、陀螺仪、传感器等全套硬件驱动</li>
<li>深度优化电源管理策略，大幅降低待机功耗、缓解设备发热</li>
<li>修复原生内核死机、随机重启、系统卡顿等稳定性问题</li>
<li>标准化 deb 安装包，支持一键部署、升级、替换内核</li>
</ul>
</div>

<div class="card">
<h2>💻 适配系统</h2>
<ul>
<li>Debian 全系系统</li>
<li>Ubuntu / Ubuntu Touch</li>
<li>PostmarketOS 移动端 Linux 系统</li>
<li>所有基于 Debian 构建的第三方 Linux 发行版</li>
</ul>
</div>

<div class="card">
<h2>⬇️ 内核文件下载（高速镜像）</h2>
<p>所有文件源自官方 Release，由 Cloudflare Worker 全球加速，解决 GitHub 下载超时、速度慢问题。</p>
<a class="download-btn" href="/linux-image-xiaomi-raphael.deb" target="_blank">📥 内核镜像包 linux-image-xiaomi-raphael.deb</a>
<a class="download-btn" href="/linux-headers-xiaomi-raphael.deb" target="_blank">📥 内核头文件 linux-headers-xiaomi-raphael.deb</a>
</div>

<div class="card">
<h2>🚀 一键内核升级命令</h2>
<p>复制以下命令，终端直接执行，全自动完成内核更新：</p>
<div class="code-block">wget -O update-kernel.sh https://你的worker域名/update-kernel.sh && chmod +x update-kernel.sh && ./update-kernel.sh</div>
</div>

<div class="card warning-card">
<h2>⚠️ 刷机须知</h2>
<ul>
<li>仅适配 <strong>小米 Raphael (K20 Pro)</strong> 设备，其他机型请勿刷入</li>
<li>内核更新属于底层修改，刷机前请备份设备全部数据</li>
<li>请确保设备电量充足，避免更新中断导致系统异常</li>
</ul>
</div>
`;

// 生成美化HTML页面
function generateHtml(content) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.pageTitle}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Roboto, Ubuntu, system-ui, sans-serif;
        }

        body {
            background-color: #0f1117;
            color: #e5e7eb;
            max-width: 980px;
            margin: 0 auto;
            padding: 2rem 1rem;
            line-height: 1.8;
        }

        h1 {
            color: #ffffff;
            font-size: 1.8rem;
            margin-bottom: 1.5rem;
            border-left: 4px solid #2563eb;
            padding-left: 12px;
        }

        h2 {
            color: #f3f4f6;
            font-size: 1.25rem;
            margin-bottom: 0.8rem;
        }

        p {
            color: #d1d5db;
            margin: 0.6rem 0;
        }

        ul {
            padding-left: 1.5rem;
            color: #d1d5db;
        }

        li {
            margin: 0.5rem 0;
        }

        /* 卡片通用样式 */
        .card {
            background: #161a23;
            border-radius: 12px;
            padding: 1.5rem;
            margin: 1.2rem 0;
            border: 1px solid #272c36;
            transition: all 0.3s ease;
        }

        .card:hover {
            border-color: #2563eb;
            box-shadow: 0 4px 20px rgba(37, 99, 235, 0.1);
            transform: translateY(-2px);
        }

        /* 警告卡片 */
        .warning-card {
            border-color: #d97706;
            background: #1f1a12;
        }

        /* 下载按钮 */
        .download-btn {
            display: block;
            width: 100%;
            text-align: center;
            padding: 14px;
            margin: 10px 0;
            background: #2563eb;
            color: #fff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .download-btn:hover {
            background: #1d4ed8;
            transform: scale(1.01);
        }

        /* 代码块样式 */
        .code-block {
            background: #0d0f14;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #272c36;
            color: #a5f3fc;
            font-family: monospace;
            overflow-x: auto;
            margin: 1rem 0;
        }

        footer {
            margin-top: 3rem;
            padding-top: 1.5rem;
            border-top: 1px solid #272c36;
            text-align: center;
            color: #6b7280;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    ${content}
    <footer>${CONFIG.footer}</footer>
</body>
</html>
  `;
}

// 处理请求
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 根路径：展示美化首页
  if (path === "/") {
    return new Response(generateHtml(UPDATE_INTRO), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  // 镜像代理 deb 内核文件
  const targetUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/${CONFIG.releaseTag}${path}`;

  const res = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });

  // 全局跨域 + 强制下载
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Disposition", "attachment");

  return new Response(res.body, {
    status: res.status,
    headers: headers
  });
}
