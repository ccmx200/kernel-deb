// ==================== 配置项 ====================
const CONFIG = {
  githubRepo: "ccmx200/kernel-deb",
  releaseTag: "v7.0",
  pageTitle: "小米 Raphael (K20 Pro) 定制内核镜像",
  footer: "GengWei 开源定制内核",
  // 缓存时间（秒）
  releaseCacheTTL: 600,   // 10分钟
  // GitHub 认证令牌（强烈建议在环境变量中设置 GITHUB_TOKEN）
  githubToken: "",        // 留空则使用无认证请求（受限）
};

// 从环境变量读取令牌（更安全）
if (typeof GITHUB_TOKEN !== "undefined") {
  CONFIG.githubToken = GITHUB_TOKEN;
}

// ==================== 工具函数 ====================
function getCacheKey(url) {
  const req = new Request(url);
  // 使用 URL 作为缓存键，忽略无关的头部差异
  return new URL(url).pathname;
}

async function getCachedResponse(request) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    const maxAge = CONFIG.releaseCacheTTL;
    if (Date.now() - age < maxAge * 1000) {
      return cached;
    }
  }
  return null;
}

async function setCachedResponse(request, response) {
  const cache = caches.default;
  const headers = new Headers(response.headers);
  headers.set("X-Cache-Age", Date.now().toString());
  const cachedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
  // 忽略 await，不阻塞 Worker 主逻辑
  ctx.waitUntil(cache.put(request, cachedResponse));
}

// ==================== 获取 Release 信息（带缓存） ====================
async function fetchReleaseInfo() {
  const apiUrl = `https://api.github.com/repos/${CONFIG.githubRepo}/releases/tags/kernel-${CONFIG.releaseTag}`;
  const cacheRequest = new Request(apiUrl, { headers: { "Accept": "application/vnd.github.v3+json" } });

  // 检查缓存
  const cached = await getCachedResponse(cacheRequest);
  if (cached) {
    try {
      const data = await cached.json();
      return parseReleaseData(data);
    } catch (e) {
      // 缓存损坏，忽略并重新请求
    }
  }

  // 未命中缓存，发请求
  try {
    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker",
    };
    if (CONFIG.githubToken) {
      headers["Authorization"] = `token ${CONFIG.githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      console.error(`GitHub API 返回 ${response.status}`);
      return null;
    }

    const data = await response.json();
    // 写入缓存
    const resToCache = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
    await setCachedResponse(cacheRequest, resToCache);

    return parseReleaseData(data);
  } catch (e) {
    console.error("获取 Release 失败:", e.message);
    return null;
  }
}

function parseReleaseData(data) {
  const body = data.body || "";
  const buildTimeMatch = body.match(/构建时间:\s*(.+)/);
  const buildIdMatch = body.match(/构建 ID:\s*(.+)/);

  return {
    version: CONFIG.releaseTag,
    buildTime: buildTimeMatch ? buildTimeMatch[1].trim() : null,
    buildId: buildIdMatch ? buildIdMatch[1].trim() : null,
    publishedAt: data.published_at,
    assets: data.assets || [],
  };
}

// ==================== 格式化函数 ====================
function formatDate(dateStr) {
  if (!dateStr) return "未知";
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diff = Date.now() - date;
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  return "刚刚";
}

// ==================== 生成页面 ====================
async function generateContent() {
  const releaseInfo = await fetchReleaseInfo();
  let buildInfoHtml = "";

  if (releaseInfo) {
    const relativeTime = getRelativeTime(releaseInfo.publishedAt);
    buildInfoHtml = `
    <div class="card build-info-card">
      <h2>📊 最新构建信息</h2>
      <div class="build-info-grid">
        <div class="build-info-item">
          <span class="build-info-label">内核版本</span>
          <span class="build-info-value">${releaseInfo.version}</span>
        </div>
        <div class="build-info-item">
          <span class="build-info-label">构建时间</span>
          <span class="build-info-value">${releaseInfo.buildTime || formatDate(releaseInfo.publishedAt)}</span>
        </div>
        <div class="build-info-item">
          <span class="build-info-label">发布时间</span>
          <span class="build-info-value">${relativeTime}</span>
        </div>
        <div class="build-info-item">
          <span class="build-info-label">构建 ID</span>
          <span class="build-info-value">${releaseInfo.buildId || "-"}</span>
        </div>
      </div>
    </div>`;
  } else {
    // 获取失败时显示占位提示，而不是完全消失
    buildInfoHtml = `
    <div class="card build-info-card" style="border-color: #d97706; background: #1f1a12;">
      <h2>📊 构建信息</h2>
      <p style="color: #fbbf24;">⚠️ 暂时无法获取最新构建数据，请刷新页面重试</p>
    </div>`;
  }

  return `
  <h1>小米 Raphael (K20 Pro) Linux 内核 ${CONFIG.releaseTag}</h1>

  ${buildInfoHtml}

  <div class="card">
    <h2>📦 项目简介</h2>
    <p>本项目为 <strong>红米 K20 Pro(设备代号：raphael)</strong> 提供定制 Linux 内核镜像，由 GitHub Actions 自动构建并经由 Cloudflare Worker 高速分发。</p>
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
      <li>彻底卸载旧版本内核及冲突包</li>
      <li>安装依赖并部署新内核</li>
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
  </div>`;
}

// ==================== 生成 HTML 页面 ====================
function generateHtml(content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.pageTitle}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Roboto,Ubuntu,system-ui,sans-serif}
    body{background-color:#0f1117;color:#e5e7eb;max-width:980px;margin:0 auto;padding:2rem 1rem;line-height:1.8}
    h1{color:#fff;font-size:1.8rem;margin-bottom:1.5rem;border-left:4px solid #2563eb;padding-left:12px}
    h2{color:#f3f4f6;font-size:1.25rem;margin-bottom:.8rem}
    p{color:#d1d5db;margin:.6rem 0}
    ul,ol{padding-left:1.5rem;color:#d1d5db}
    li{margin:.5rem 0}
    code{background:#272c36;padding:2px 6px;border-radius:4px;color:#a5f3fc;font-family:monospace}
    .card{background:#161a23;border-radius:12px;padding:1.5rem;margin:1.2rem 0;border:1px solid #272c36;transition:all .3s ease}
    .card:hover{border-color:#2563eb;box-shadow:0 4px 20px rgba(37,99,235,.1);transform:translateY(-2px)}
    .build-info-card{border-color:#10b981;background:linear-gradient(135deg,#161a23 0%,#0d2922 100%)}
    .build-info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-top:1rem}
    .build-info-item{display:flex;flex-direction:column;padding:.8rem;background:rgba(16,185,129,.1);border-radius:8px;border:1px solid rgba(16,185,129,.2)}
    .build-info-label{font-size:.85rem;color:#6b7280;margin-bottom:.3rem}
    .build-info-value{font-size:1.1rem;color:#10b981;font-weight:600}
    .warning-card{border-color:#d97706;background:#1f1a12}
    .copy-btn{display:block;width:100%;text-align:center;padding:14px;margin:10px 0 0 0;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:500;font-size:1rem;cursor:pointer;transition:all .3s ease}
    .copy-btn:hover{background:#1d4ed8}
    .copy-btn.copied{background:#10b981}
    .code-block{background:#0d0f14;padding:16px;border-radius:8px;border:1px solid #272c36;color:#a5f3fc;font-family:monospace;overflow-x:auto;margin:1rem 0}
    footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #272c36;text-align:center;color:#6b7280;font-size:.9rem}
    @media(max-width:600px){.build-info-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  ${content}
  <footer>${CONFIG.footer}</footer>
  <script>
    function copyCmd(){
      const cmd=document.getElementById('cmd').innerText;
      navigator.clipboard.writeText(cmd).then(()=>{
        const btn=document.querySelector('.copy-btn');
        btn.textContent='✅ 已复制';
        btn.classList.add('copied');
        setTimeout(()=>{
          btn.textContent='📋 复制命令';
          btn.classList.remove('copied');
        },2000);
      });
    }
  </script>
</body>
</html>`;
}

// ==================== 请求处理 ====================
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event));
});

// 全局 ctx 用于 waitUntil
let ctx;

async function handleRequest(event) {
  ctx = event; // 保存以便在 setCachedResponse 中使用 waitUntil
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname;

  // 首页
  if (path === "/") {
    const content = await generateContent();
    return new Response(generateHtml(content), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 下载代理（deb 和脚本）
  if (path.endsWith(".deb") || path === "/Update-kernel.sh") {
    return proxyDownload(request, path);
  }

  return new Response("Not Found", { status: 404 });
}

// ==================== 下载代理（支持 Range 请求） ====================
async function proxyDownload(request, path) {
  let targetUrl;
  if (path.endsWith(".deb")) {
    targetUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/kernel-${CONFIG.releaseTag}${path}`;
  } else {
    targetUrl = `https://raw.githubusercontent.com/${CONFIG.githubRepo}/refs/heads/main/Update-kernel.sh`;
  }

  // 构造转发请求头，保留 Range 头（关键！）
  const headers = new Headers();
  headers.set("User-Agent", "Cloudflare-Worker");
  if (CONFIG.githubToken) {
    headers.set("Authorization", `token ${CONFIG.githubToken}`);
  }

  // 复制客户端部分头，尤其是 Range
  const clientHeaders = new Headers(request.headers);
  const rangeHeader = clientHeaders.get("Range");
  if (rangeHeader) {
    headers.set("Range", rangeHeader);
  }

  // 发起请求到 GitHub
  const githubResponse = await fetch(targetUrl, {
    method: "GET",
    headers: headers,
    redirect: "follow",
  });

  // 构造响应头
  const resHeaders = new Headers();
  resHeaders.set("Access-Control-Allow-Origin", "*");
  resHeaders.set("Accept-Ranges", "bytes");

  if (githubResponse.status === 206 || githubResponse.status === 200) {
    // 正确传递 Content-Type 和 Content-Length
    const contentType = githubResponse.headers.get("Content-Type") || "application/octet-stream";
    resHeaders.set("Content-Type", contentType);
    
    const contentLength = githubResponse.headers.get("Content-Length");
    if (contentLength) {
      resHeaders.set("Content-Length", contentLength);
    }

    // 如果是完整响应 (200)，强制 attachment 触发下载；如果是部分响应 (206)，则保留为 inline 或 attachment 由客户端决定
    if (githubResponse.status === 200) {
      resHeaders.set("Content-Disposition", "attachment");
    } else {
      // 206 时移除 Content-Disposition，避免下载工具误解
      // 但为了安全，仍可设置为 attachment，好多下载工具能处理。
      // 这里采用通用的 "attachment" 也可以，但不影响断点续传
      resHeaders.set("Content-Disposition", "attachment");
    }

    return new Response(githubResponse.body, {
      status: githubResponse.status,
      headers: resHeaders,
    });
  } else {
    // 错误处理
    return new Response(githubResponse.body, {
      status: githubResponse.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}