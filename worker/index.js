// 配置项
const CONFIG = {
  githubRepo: "ccmx200/kernel-deb",
  releaseTag: "v7.0",
  pageTitle: "小米 Raphael (K20 Pro) 定制内核镜像",
  footer: "GengWei 开源定制内核 "
};

// 内核更新介绍
const UPDATE_INTRO = `
<h1>小米 Raphael (K20 Pro) Linux 内核 v7.0</h1>

<div class="card">
<h2>📦 项目简介</h2>
<p>本项目为 <strong>红米 K20 Pro (设备代号：raphael)</strong></p>
</div>

<div class="card">
<h2>🚀 一键内核升级</h2>
<div class="code-block" id="cmd">sudo bash -c "$(curl -fsSL https://up-kernel.cuicanmx.cn/Update-kernel.sh)"</div>
<button class="copy-btn" onclick="copyCmd()">📋 复制命令</button>
</div>

<div class="card">
<h2>📋 脚本功能说明</h2>
<p>执行一键升级脚本后，会自动完成以下操作：</p>
<ol>
<li>下载最新内核包（image、headers、firmware、alsa）</li>
<li>卸载旧版本内核及相关软件包</li>
<li>安装新版本内核（4 个 deb 包）</li>
<li>生成 initramfs 镜像</li>
<li>配置启动文件（/boot/initramfs、/boot/linux.efi）</li>
<li>验证启动文件完整性</li>
<li>清理临时下载文件</li>
</ol>
</div>

<div class="card warning-card">
<h2>⚠️ 刷机须知</h2>
<ul>
<li>仅适配 <strong>小米 Raphael (K20 Pro)</strong> 设备，其他机型请勿刷入</li>
<li>内核更新属于底层修改，刷机前请备份设备全部数据</li>
<li>请确保设备电量充足（建议 50% 以上），避免更新中断导致系统异常</li>
<li>更新完成后执行 <code>reboot</code> 重启设备即可使用新内核</li>
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

        ul, ol {
            padding-left: 1.5rem;
            color: #d1d5db;
        }

        li {
            margin: 0.5rem 0;
        }

        code {
            background: #272c36;
            padding: 2px 6px;
            border-radius: 4px;
            color: #a5f3fc;
            font-family: monospace;
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

        /* 复制按钮 */
        .copy-btn {
            display: block;
            width: 100%;
            text-align: center;
            padding: 14px;
            margin: 10px 0 0 0;
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 8px;
            font-weight: 500;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .copy-btn:hover {
            background: #1d4ed8;
        }

        .copy-btn.copied {
            background: #10b981;
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
    <script>
        function copyCmd() {
            const cmd = document.getElementById('cmd').innerText;
            navigator.clipboard.writeText(cmd).then(() => {
                const btn = document.querySelector('.copy-btn');
                btn.textContent = '✅ 已复制';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = '📋 复制命令';
                    btn.classList.remove('copied');
                }, 2000);
            });
        }
    </script>
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

  // 只代理 deb 包
  if (!path.endsWith('.deb')) {
    return new Response('Not Found', { status: 404 });
  }

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
