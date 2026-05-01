// ==================== 配置项 ====================
const CONFIG = {
  githubRepo: "ccmx200/kernel-deb",
  releaseTag: "v7.0",
  pageTitle: "小米 Raphael (K20 Pro) 定制内核镜像",
  githubRepoUrl: "https://github.com/ccmx200/kernel-deb",
  releaseCacheTTL: 86400, // 缓存时间（秒）
  githubToken: "", // 如需访问私有仓库，请在 Cloudflare 环境变量中设置 GITHUB_TOKEN
};

// 从环境变量读取令牌（可选）
if (typeof GITHUB_TOKEN !== "undefined") {
  CONFIG.githubToken = GITHUB_TOKEN;
}

// 工具函数
function getCacheKey(url) {
  return new URL(url).pathname;
}

async function getCachedResponse(request) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    if (Date.now() - age < CONFIG.releaseCacheTTL * 1000) return cached;
  }
  return null;
}

async function setCachedResponse(request, response) {
  const cache = caches.default;
  const headers = new Headers(response.headers);
  headers.set("X-Cache-Age", Date.now().toString());
  const res = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  ctx.waitUntil(cache.put(request, res));
}

// 获取 Release 信息（带缓存）
async function fetchReleaseInfo() {
  const apiUrl = `https://api.github.com/repos/${CONFIG.githubRepo}/releases/tags/kernel-${CONFIG.releaseTag}`;
  const cacheRequest = new Request(apiUrl, {
    headers: { "Accept": "application/vnd.github.v3+json" },
  });

  const cached = await getCachedResponse(cacheRequest);
  if (cached) {
    try {
      return parseReleaseData(await cached.json());
    } catch (e) {
      // 缓存数据损坏，继续请求
    }
  }

  try {
    const headers = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker",
    };
    if (CONFIG.githubToken) {
      headers["Authorization"] = `token ${CONFIG.githubToken}`;
    }
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    await setCachedResponse(
      cacheRequest,
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      })
    );
    return parseReleaseData(data);
  } catch (e) {
    console.error("Release fetch failed:", e);
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

function formatDate(dateStr) {
  if (!dateStr) return "未知";
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelativeTime(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr);
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  return "刚刚";
}

async function generateContent() {
  const releaseInfo = await fetchReleaseInfo();

  let buildInfoHtml = "";
  if (releaseInfo) {
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
          <span class="build-info-value">${getRelativeTime(releaseInfo.publishedAt)}</span>
        </div>
        <div class="build-info-item">
          <span class="build-info-label">构建 ID</span>
          <span class="build-info-value">${releaseInfo.buildId || "-"}</span>
        </div>
      </div>
    </div>`;
  } else {
    buildInfoHtml = `
    <div class="card build-info-card" style="border-color:#d97706;background:#1f1a12;">
      <h2>📊 构建信息</h2>
      <p style="color:#fbbf24;">⚠️ 暂时无法获取最新构建数据，请刷新重试</p>
    </div>`;
  }

  return `
  <h1>小米 Raphael (K20 Pro) Linux 内核 ${CONFIG.releaseTag}</h1>

  ${buildInfoHtml}

  <div class="card">
    <h2>📦 更新 API</h2>
    <p>这是一个自动化内核更新接口，依托 Cloudflare Worker 为 <strong>红米 K20 Pro（raphael）</strong> 提供高速更新服务。配合一键脚本，即可自动获取并安装由 GitHub Actions 构建的最新 Linux 内核包。</p>
  </div>

  <div class="card">
    <h2>🚀 一键升级</h2>
    <div class="code-block" id="cmd">sudo bash -c "$(curl -fsSL https://up-kernel.cuicanmx.cn/Update-kernel.sh)"</div>
    <button class="copy-btn" onclick="copyCmd()">📋 复制命令</button>
  </div>

  <div class="card">
    <h2>📋 脚本流程</h2>
    <ol>
      <li>下载最新内核包（image、headers、firmware、alsa）</li>
      <li>彻底卸载旧版本内核及冲突包</li>
      <li>安装依赖并部署新内核</li>
      <li>生成 initramfs 镜像</li>
      <li>配置启动文件（/boot/initramfs、/boot/linux.efi）</li>
      <li>验证启动文件完整性</li>
      <li>清理临时文件</li>
    </ol>
  </div>

  <div class="card warning-card">
    <h2>⚠️ 刷机须知</h2>
    <ul>
      <li>仅适配 <strong>小米 Raphael (K20 Pro)</strong>，其他机型请勿刷入</li>
      <li>刷机前请备份全部数据，确保电量充足</li>
      <li>更新后执行 <code>reboot</code> 重启生效</li>
    </ul>
  </div>`;
}

function generateHtml(content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.pageTitle}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐧</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#0b0d14;color:#e2e8f0;font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Ubuntu,sans-serif;line-height:1.7;max-width:1024px;margin:0 auto;padding:2.5rem 1.5rem}
    h1{font-size:2rem;font-weight:700;color:#fff;margin-bottom:2rem;position:relative;padding-bottom:.5rem}
    h1::after{content:'';position:absolute;bottom:0;left:0;width:60px;height:3px;background:linear-gradient(90deg,#2563eb,#06b6d4);border-radius:2px}
    h2{font-size:1.3rem;font-weight:600;color:#f1f5f9;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
    p{color:#d1d5db;margin:.8rem 0}
    ul,ol{padding-left:1.6rem;color:#d1d5db;margin:.8rem 0}
    li{margin:.5rem 0}
    code{background:#1e293b;padding:.2rem .5rem;border-radius:4px;color:#93c5fd;font-family:'JetBrains Mono','Fira Code',monospace;font-size:.9rem}
    .card{background:#111827;border-radius:16px;padding:1.8rem;margin:1.5rem 0;border:1px solid #1f2937;transition:all .2s ease;box-shadow:0 4px 6px -1px rgba(0,0,0,.2)}
    .card:hover{border-color:#2563eb;box-shadow:0 10px 25px -5px rgba(37,99,235,.15);transform:translateY(-2px)}
    .build-info-card{background:linear-gradient(135deg,#0f172a 0%,#064e3b 100%);border-color:#059669}
    .build-info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-top:1.2rem}
    .build-info-item{background:rgba(5,150,105,.1);padding:.9rem;border-radius:10px;border:1px solid rgba(5,150,105,.2);display:flex;flex-direction:column}
    .build-info-label{font-size:.8rem;color:#9ca3af;margin-bottom:.3rem}
    .build-info-value{font-size:1.1rem;font-weight:600;color:#34d399}
    .warning-card{border-color:#b45309;background:#1c1917}
    .code-block{background:#0a0e14;padding:1.2rem;border-radius:10px;border:1px solid #1e293b;color:#a5f3fc;font-family:'JetBrains Mono','Fira Code',monospace;font-size:.95rem;overflow-x:auto;margin:1rem 0}
    .copy-btn{display:block;width:100%;padding:12px;margin-top:12px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:500;font-size:1rem;cursor:pointer;transition:background .2s}
    .copy-btn:hover{background:#1d4ed8}
    .copy-btn.copied{background:#059669}
    footer{margin-top:3rem;padding-top:2rem;border-top:1px solid #1e293b;display:flex;justify-content:center}
    .github-footer{display:inline-flex;align-items:center;gap:.6rem;background:#1e293b;color:#e2e8f0;text-decoration:none;padding:.75rem 1.5rem;border-radius:12px;border:1px solid #334155;transition:all .2s ease}
    .github-footer:hover{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 4px 12px rgba(37,99,235,.3)}
    .github-footer svg{width:20px;height:20px;fill:currentColor}
    @media(max-width:640px){h1{font-size:1.6rem}.build-info-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  ${content}
  <footer>
    <a href="${CONFIG.githubRepoUrl}" target="_blank" rel="noopener noreferrer" class="github-footer">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      ccmx200/kernel-deb
    </a>
  </footer>
  <script>
    function copyCmd(){
      const cmd=document.getElementById('cmd').innerText;
      navigator.clipboard.writeText(cmd).then(()=>{
        const btn=document.querySelector('.copy-btn');
        btn.textContent='✅ 已复制';
        btn.classList.add('copied');
        setTimeout(()=>{btn.textContent='📋 复制命令';btn.classList.remove('copied');},2000);
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

let ctx;

async function handleRequest(event) {
  ctx = event;
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/") {
    const content = await generateContent();
    return new Response(generateHtml(content), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (path.endsWith(".deb") || path === "/Update-kernel.sh") {
    return proxyDownload(request, path);
  }

  return new Response("Not Found", { status: 404 });
}

async function proxyDownload(request, path) {
  let targetUrl;
  const isScript = path === "/Update-kernel.sh";

  // 根据文件类型构造正确的 GitHub 链接
  if (path.endsWith(".deb")) {
    targetUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/kernel-${CONFIG.releaseTag}${path}`;
  } else if (isScript) {
    // 使用 HEAD 自动跟随默认分支（无需硬编码主线名）
    targetUrl = `https://raw.githubusercontent.com/${CONFIG.githubRepo}/HEAD/Update-kernel.sh`;
  } else {
    return new Response("Invalid file type", { status: 400 });
  }

  // 1️⃣ 直接复用客户端请求的全部头部，不做任何手动添加
  const clientHeaders = new Headers(request.headers);
  const proxyHeaders = new Headers();

  // 遍历并复制客户端头部，过滤掉可能引起问题的 Hop-by-hop 头部
  for (const [key, value] of clientHeaders) {
    const lowerKey = key.toLowerCase();
    // 排除 Host 和 Cloudflare 内部头，避免干扰
    if (lowerKey === "host" || lowerKey.startsWith("cf-")) continue;
    proxyHeaders.set(key, value);
  }

  try {
    // 2️⃣ 向 GitHub 发起请求，使用完全转发的头部
    const githubResponse = await fetch(targetUrl, {
      headers: proxyHeaders,
      redirect: "follow",
    });

    // 3️⃣ 构建响应头（保留上游的 Content-Type 等，并添加 CORS）
    const resHeaders = new Headers(githubResponse.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set("Accept-Ranges", "bytes");

    // 仅对 .deb 文件保留强制下载头（确保下载行为），脚本不设置，允许直接文本展示
    if (path.endsWith(".deb")) {
      resHeaders.set("Content-Disposition", "attachment");
    } else {
      // 移除可能由 GitHub 返回的 Content-Disposition，确保脚本不作为附件下载
      resHeaders.delete("Content-Disposition");
    }

    return new Response(githubResponse.body, {
      status: githubResponse.status,
      statusText: githubResponse.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, {
      status: 502,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}