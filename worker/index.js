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

// ---------- 工具函数 ----------
function getCacheKey(url) { return new URL(url).pathname; }

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

// ---------- 获取 Release 信息（带缓存）----------
async function fetchReleaseInfo() {
  const apiUrl = `https://api.github.com/repos/${CONFIG.githubRepo}/releases/tags/kernel-${CONFIG.releaseTag}`;
  const cacheRequest = new Request(apiUrl, { headers: { "Accept": "application/vnd.github.v3+json" } });

  const cached = await getCachedResponse(cacheRequest);
  if (cached) {
    try { return parseReleaseData(await cached.json()); } catch (e) {}
  }

  try {
    const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "Cloudflare-Worker" };
    if (CONFIG.githubToken) headers["Authorization"] = `token ${CONFIG.githubToken}`;
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    await setCachedResponse(cacheRequest, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
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
  return new Date(dateStr).toLocaleString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
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

// ---------- 生成页面内容（新设计）----------
async function generateContent() {
  const releaseInfo = await fetchReleaseInfo();

  let buildHtml = "";
  if (releaseInfo) {
    buildHtml = `
      <div class="stats">
        <div class="stat">
          <span class="stat-label">内核版本</span>
          <span class="stat-value">${releaseInfo.version}</span>
        </div>
        <div class="stat">
          <span class="stat-label">构建时间</span>
          <span class="stat-value">${releaseInfo.buildTime || formatDate(releaseInfo.publishedAt)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">发布时间</span>
          <span class="stat-value">${getRelativeTime(releaseInfo.publishedAt)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">构建 ID</span>
          <span class="stat-value">${releaseInfo.buildId || "-"}</span>
        </div>
      </div>`;
  } else {
    buildHtml = `
      <div class="stats" style="background:#fff3cd;border-color:#ffc107;">
        <div class="stat" style="grid-column:1/-1;text-align:center;color:#856404;">
          ⚠️ 暂时无法获取最新构建数据，请刷新重试
        </div>
      </div>`;
  }

  return `
    <section class="hero">
      <h1>🐧 小米 Raphael (K20 Pro) 内核 ${CONFIG.releaseTag}</h1>
      <p>自动化构建 · 高速分发 · 一键升级</p>
    </section>

    <section class="card build-info">
      <h2>📊 最新构建信息</h2>
      ${buildHtml}
    </section>

    <section class="card">
      <h2>📦 关于本项目</h2>
      <p>依托 Cloudflare Worker 为 <strong>红米 K20 Pro（raphael）</strong> 提供稳定的内核更新服务。所有内核包由 GitHub Actions 自动构建，通过本页面的命令即可快速安装。</p>
      <p style="margin-top:0.5rem;font-size:0.9rem;color:#6b7280;">支持断点续传，全国加速访问。</p>
    </section>

    <section class="card">
      <h2>🚀 一键升级</h2>
      <div class="code-block" id="cmd">sudo bash -c "$(curl -fsSL https://up-kernel.cuicanmx.cn/Update-kernel.sh)"</div>
      <button class="copy-btn" onclick="copyCmd()">📋 复制命令</button>
    </section>

    <section class="card">
      <h2>📋 脚本流程</h2>
      <ol class="steps">
        <li>下载最新内核包（image、headers、firmware、alsa）</li>
        <li>彻底卸载旧版本内核及冲突包</li>
        <li>安装依赖并部署新内核</li>
        <li>生成 initramfs 镜像</li>
        <li>配置启动文件（/boot/initramfs、/boot/linux.efi）</li>
        <li>验证启动文件完整性</li>
        <li>清理临时文件</li>
      </ol>
    </section>

    <section class="card warning">
      <h2>⚠️ 刷机须知</h2>
      <ul>
        <li>仅适配 <strong>小米 Raphael (K20 Pro)</strong>，其他机型请勿刷入</li>
        <li>刷机前请备份全部数据，确保电量充足</li>
        <li>更新后执行 <code>reboot</code> 重启生效</li>
      </ul>
    </section>`;
}

// ---------- 生成完整 HTML（新设计）----------
function generateHtml(content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.pageTitle}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐧</text></svg>">
  <style>
    /* ========== 全局重置与字体 ========== */
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{
      background:#f8fafc;
      color:#1e293b;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
      line-height:1.6;
      min-height:100vh;
      padding-bottom:3rem;
    }
    a{color:#2563eb;text-decoration:none}
    a:hover{text-decoration:underline}

    /* 容器 */
    .container{
      max-width:900px;
      margin:0 auto;
      padding:2rem 1.5rem;
    }

    /* 头部 */
    .hero{
      text-align:center;
      padding:3rem 1rem 2rem;
    }
    .hero h1{
      font-size:2.2rem;
      font-weight:700;
      color:#0f172a;
      margin-bottom:0.5rem;
      letter-spacing:-0.5px;
    }
    .hero p{
      font-size:1.1rem;
      color:#475569;
    }

    /* 卡片样式 */
    .card{
      background:#ffffff;
      border:1px solid #e2e8f0;
      border-radius:16px;
      padding:1.8rem;
      margin-bottom:1.8rem;
      box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
      transition:box-shadow 0.2s ease;
    }
    .card:hover{
      box-shadow:0 10px 25px -5px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
    }
    .card h2{
      font-size:1.3rem;
      font-weight:600;
      color:#1e293b;
      margin-bottom:1.2rem;
      display:flex;
      align-items:center;
      gap:0.5rem;
    }

    /* 构建信息统计 */
    .stats{
      display:grid;
      grid-template-columns:repeat(auto-fit, minmax(180px,1fr));
      gap:1rem;
      background:#f1f5f9;
      border-radius:12px;
      padding:1rem;
      border:1px solid #e2e8f0;
      margin-top:0.5rem;
    }
    .stat{
      background:white;
      padding:1rem;
      border-radius:10px;
      box-shadow:0 1px 3px rgba(0,0,0,0.04);
      display:flex;
      flex-direction:column;
      align-items:flex-start;
    }
    .stat-label{
      font-size:0.8rem;
      color:#64748b;
      margin-bottom:0.4rem;
      text-transform:uppercase;
      letter-spacing:0.3px;
    }
    .stat-value{
      font-size:1.1rem;
      font-weight:600;
      color:#0f172a;
      word-break:break-word;
    }

    /* 代码块 */
    .code-block{
      background:#0f172a;
      padding:1.2rem 1.5rem;
      border-radius:12px;
      color:#a5f3fc;
      font-family:'JetBrains Mono','Fira Code','SF Mono',monospace;
      font-size:0.95rem;
      overflow-x:auto;
      margin-bottom:1rem;
      border:1px solid #1e293b;
      white-space:pre-wrap;
      word-break:break-all;
    }

    /* 复制按钮 */
    .copy-btn{
      display:inline-flex;
      align-items:center;
      gap:0.4rem;
      padding:0.75rem 1.8rem;
      background:#2563eb;
      color:white;
      font-weight:600;
      font-size:1rem;
      border:none;
      border-radius:12px;
      cursor:pointer;
      transition:background 0.2s, transform 0.1s;
    }
    .copy-btn:hover{
      background:#1d4ed8;
      transform:translateY(-1px);
    }
    .copy-btn.copied{
      background:#059669;
    }

    /* 步骤列表 */
    .steps{
      counter-reset:step;
      list-style:none;
      padding-left:0;
    }
    .steps li{
      counter-increment:step;
      padding:0.8rem 0 0.8rem 3rem;
      position:relative;
      border-bottom:1px solid #f1f5f9;
      color:#334155;
    }
    .steps li:last-child{border-bottom:none}
    .steps li::before{
      content:counter(step);
      position:absolute;
      left:0;
      top:0.7rem;
      width:28px;
      height:28px;
      background:#2563eb;
      color:white;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:0.85rem;
      font-weight:600;
    }

    /* 警告卡片 */
    .warning{
      border-color:#fcd34d;
      background:#fffbeb;
    }
    .warning h2{
      color:#92400e;
    }
    .warning ul{
      color:#78350f;
      padding-left:1.4rem;
    }
    .warning li{
      margin-bottom:0.5rem;
    }

    /* 页脚 */
    footer{
      text-align:center;
      margin-top:2.5rem;
    }
    .github-link{
      display:inline-flex;
      align-items:center;
      gap:0.6rem;
      background:#ffffff;
      border:1px solid #e2e8f0;
      padding:0.7rem 1.6rem;
      border-radius:12px;
      color:#1e293b;
      font-weight:500;
      transition:all 0.2s;
    }
    .github-link:hover{
      background:#f8fafc;
      border-color:#2563eb;
      color:#2563eb;
      text-decoration:none;
    }
    .github-link svg{
      width:20px;
      height:20px;
      fill:currentColor;
    }

    /* 响应式 */
    @media(max-width:640px){
      .hero h1{font-size:1.6rem}
      .stats{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <footer>
      <a href="${CONFIG.githubRepoUrl}" target="_blank" rel="noopener noreferrer" class="github-link">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        ccmx200/kernel-deb
      </a>
    </footer>
  </div>
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

// ==================== 请求处理（保持不变）====================
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

  if (path.endsWith(".deb")) {
    targetUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/kernel-${CONFIG.releaseTag}${path}`;
  } else if (isScript) {
    targetUrl = `https://raw.githubusercontent.com/${CONFIG.githubRepo}/HEAD/Update-kernel.sh`;
  } else {
    return new Response("Invalid file type", { status: 400 });
  }

  const clientHeaders = new Headers(request.headers);
  const proxyHeaders = new Headers();
  for (const [key, value] of clientHeaders) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "host" || lowerKey.startsWith("cf-")) continue;
    proxyHeaders.set(key, value);
  }

  try {
    const githubResponse = await fetch(targetUrl, { headers: proxyHeaders, redirect: "follow" });
    const resHeaders = new Headers(githubResponse.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set("Accept-Ranges", "bytes");

    if (path.endsWith(".deb")) {
      resHeaders.set("Content-Disposition", "attachment");
    } else {
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
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}