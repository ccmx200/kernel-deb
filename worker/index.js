// ==================== 配置项 ====================
const CONFIG = {
  githubRepo: "ccmx200/kernel-deb",
  releaseTag: "v7.0",
  pageTitle: "小米 Raphael (K20 Pro) 定制内核镜像",
  githubRepoUrl: "https://github.com/ccmx200/kernel-deb",
  // 缓存策略大幅放宽，减少源站请求
  releaseCacheTTL: 86400,           // Release 信息缓存 1 天
  assetCacheTTL: 2592000,           // .deb 缓存 30 天（文件不变，可设更长）
  scriptCacheTTL: 86400,            // 脚本缓存 1 天（更新脚本后需等缓存过期）
  pageCacheTTL: 3600,               // 首页 HTML 缓存 1 小时
  cronMaxRetries: 2,                // 定时任务重试次数
};

// ========== 通用缓存工具 ==========
async function getCached(request, ttl) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    const age = parseInt(cached.headers.get("X-Cache-Age") || "0");
    if (Date.now() - age < ttl * 1000) return cached;
  }
  return null;
}

async function setCache(request, response, ttl) {
  const cache = caches.default;
  const headers = new Headers(response.headers);
  headers.set("X-Cache-Age", Date.now().toString());
  headers.set("Cache-Control", `public, max-age=${ttl}`);
  const res = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  // 兼容 scheduled 事件无 ctx
  if (typeof ctx !== "undefined" && ctx?.waitUntil) {
    ctx.waitUntil(cache.put(request, res));
  } else {
    await cache.put(request, res);
  }
}

// ========== Release 信息获取（强缓存）==========
async function fetchReleaseInfo() {
  const apiUrl = `https://api.github.com/repos/${CONFIG.githubRepo}/releases/tags/kernel-${CONFIG.releaseTag}`;
  const req = new Request(apiUrl, { headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "Cloudflare-Worker" } });

  const cached = await getCached(req, CONFIG.releaseCacheTTL);
  if (cached) {
    try { return parseReleaseData(await cached.json()); } catch (e) {}
  }

  try {
    const resp = await fetch(req.clone());
    if (!resp.ok) return null;
    const data = await resp.json();
    await setCache(req, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }), CONFIG.releaseCacheTTL);
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

function formatDate(d) { return d ? new Date(d).toLocaleString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }) : "未知"; }
function getRelativeTime(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d);
  const h = Math.floor(diff/36e5), days = Math.floor(h/24);
  if (days>0) return `${days} 天前`;
  if (h>0) return `${h} 小时前`;
  return "刚刚";
}

// ========== 极简现代风格页面生成 ==========
async function generateContent() {
  const info = await fetchReleaseInfo();

  const buildHtml = info ? `
    <div class="stats">
      <div class="stat"><span class="stat-label">内核版本</span><span class="stat-value">${info.version}</span></div>
      <div class="stat"><span class="stat-label">构建时间</span><span class="stat-value">${info.buildTime || formatDate(info.publishedAt)}</span></div>
      <div class="stat"><span class="stat-label">发布时间</span><span class="stat-value">${getRelativeTime(info.publishedAt)}</span></div>
      <div class="stat"><span class="stat-label">构建 ID</span><span class="stat-value">${info.buildId || "-"}</span></div>
    </div>` : `
    <div class="stats" style="background:#fff3cd;border-color:#ffc107;">
      <div class="stat" style="grid-column:1/-1;text-align:center;color:#856404;">⚠️ 暂时无法获取最新构建数据，请刷新重试</div>
    </div>`;

  return `
    <section class="hero">
      <h1>🐧 小米 Raphael (K20 Pro) 内核 ${CONFIG.releaseTag}</h1>
      <p>自动化构建 · 高速分发 · 一键升级</p>
    </section>

    <section class="card">
      <h2>📊 最新构建信息</h2>
      ${buildHtml}
    </section>

    <section class="card">
      <h2>🚀 一键升级</h2>
      <div class="code-block" id="cmd">sudo bash -c "$(curl -fsSL https://up-kernel.cuicanmx.cn/Update-kernel.sh)"</div>
      <button class="copy-btn" onclick="copyCmd()">📋 复制命令</button>
    </section>

    <section class="card">
      <h2>📦 关于本项目</h2>
      <p>依托 Cloudflare Worker 为 <strong>红米 K20 Pro（raphael）</strong> 提供稳定的内核更新服务。所有内核包由 GitHub Actions 自动构建。</p>
      <p class="sub-text">支持断点续传，全国加速访问。</p>
    </section>

    <section class="card">
      <h2>📋 脚本流程</h2>
      <ol class="steps">
        <li>下载最新内核包</li>
        <li>自动卸载旧版本</li>
        <li>安装内核及依赖</li>
        <li>生成 initramfs</li>
        <li>配置启动文件</li>
        <li>验证完整性</li>
        <li>清理临时文件</li>
      </ol>
    </section>

    <section class="card warning">
      <h2>⚠️ 刷机须知</h2>
      <ul>
        <li>仅适配 <strong>小米 Raphael (K20 Pro)</strong></li>
        <li>刷机前请备份数据，保持电量充足</li>
        <li>更新后执行 <code>reboot</code> 重启</li>
      </ul>
    </section>`;
}

// ========== 生成完整 HTML（极简 CSS，无冗余动画）==========
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
    body{background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5}
    .container{max-width:800px;margin:0 auto;padding:2rem 1.25rem}
    .hero{text-align:center;padding:2rem 0 1.5rem}
    .hero h1{font-size:2rem;font-weight:700}
    .hero p{color:#475569;margin-top:0.3rem;font-size:1.05rem}
    .card{background:#fff;border-radius:12px;padding:1.6rem;margin-bottom:1.6rem;border:1px solid #e2e8f0}
    .card h2{font-size:1.25rem;font-weight:600;margin-bottom:1rem;display:flex;align-items:center;gap:0.4rem}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.8rem;background:#f1f5f9;border-radius:10px;padding:0.8rem}
    .stat{background:#fff;padding:0.8rem;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
    .stat-label{font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.1em}
    .stat-value{font-size:1.1rem;font-weight:600;color:#0f172a;word-break:break-word}
    .code-block{background:#0f172a;padding:1.2rem;border-radius:10px;color:#a5f3fc;font-family:'JetBrains Mono',monospace;font-size:0.9rem;overflow-x:auto;margin-bottom:0.8rem;white-space:pre-wrap;word-break:break-all}
    .copy-btn{display:inline-block;padding:0.7rem 1.5rem;background:#2563eb;color:#fff;font-weight:600;font-size:0.95rem;border:none;border-radius:10px;cursor:pointer}
    .copy-btn:hover{background:#1d4ed8}
    .copy-btn.copied{background:#059669}
    .steps{counter-reset:step;list-style:none;padding-left:0}
    .steps li{counter-increment:step;padding:0.6rem 0 0.6rem 2.5rem;position:relative;border-bottom:1px solid #f1f5f9;color:#334155}
    .steps li:last-child{border-bottom:none}
    .steps li::before{content:counter(step);position:absolute;left:0;top:0.5rem;width:22px;height:22px;background:#2563eb;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700}
    .warning{background:#fffbeb;border-color:#fcd34d}
    .warning h2{color:#92400e}
    .warning ul{padding-left:1.3rem;color:#78350f}
    .warning li{margin-bottom:0.4rem}
    footer{text-align:center;margin-top:2rem}
    .github-link{display:inline-flex;align-items:center;gap:0.5rem;background:#fff;border:1px solid #e2e8f0;padding:0.6rem 1.2rem;border-radius:10px;color:#1e293b;font-weight:500;text-decoration:none}
    .github-link:hover{background:#f8fafc;border-color:#2563eb;color:#2563eb}
    .github-link svg{width:18px;height:18px;fill:currentColor}
    .sub-text{font-size:0.85rem;color:#6b7280;margin-top:0.5rem}
    @media(max-width:640px){.hero h1{font-size:1.5rem}.stats{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <footer>
      <a href="${CONFIG.githubRepoUrl}" target="_blank" rel="noopener noreferrer" class="github-link">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
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

// ==================== 请求处理（带 HTML 缓存）====================
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event));
});

let ctx;

async function handleRequest(event) {
  ctx = event;
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname;

  // 首页：生成并缓存 HTML
  if (path === "/" || path === "") {
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await getCached(cacheKey, CONFIG.pageCacheTTL);
    if (cached) return cached;

    const content = await generateContent();
    const html = generateHtml(content);
    const response = new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${CONFIG.pageCacheTTL}`,
      },
    });
    // 缓存整个 page
    await setCache(cacheKey, response.clone(), CONFIG.pageCacheTTL);
    return response;
  }

  // 代理下载 .deb / .sh（带缓存和 HEAD 支持）
  if (path.endsWith(".deb") || path === "/Update-kernel.sh") {
    return proxyDownload(request, path);
  }

  return new Response("Not Found", { status: 404 });
}

// ==================== 代理下载（性能增强：HEAD 支持，减少回源）====================
async function proxyDownload(request, path) {
  const isScript = path === "/Update-kernel.sh";
  const isDeb = path.endsWith(".deb");
  const method = request.method.toUpperCase();

  let targetUrl;
  if (isDeb) {
    targetUrl = `https://github.com/${CONFIG.githubRepo}/releases/download/kernel-${CONFIG.releaseTag}${path}`;
  } else {
    targetUrl = `https://raw.githubusercontent.com/${CONFIG.githubRepo}/HEAD/Update-kernel.sh`;
  }

  const cacheKey = new Request(targetUrl, { method: "GET" });
  const ttl = isDeb ? CONFIG.assetCacheTTL : CONFIG.scriptCacheTTL;

  // 1. 检查缓存（提前，HEAD 和 GET 共享）
  const cached = await getCached(cacheKey, ttl);
  if (cached) {
    const respHeaders = new Headers(cached.headers);
    respHeaders.set("X-Cache", "HIT");
    if (isDeb) respHeaders.set("Content-Disposition", "attachment");
    // 对 HEAD 请求只返回头，不返回 body（节省带宽）
    if (method === "HEAD") {
      return new Response(null, { status: cached.status, headers: respHeaders });
    }
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: respHeaders });
  }

  // 2. 缓存未命中，请求源站（直接使用 Worker 的 fetch，简化头部转发，减少开销）
  const proxyHeaders = new Headers();
  proxyHeaders.set("User-Agent", "Cloudflare-Worker"); // 保证 GitHub 不拒
  // 传递客户端的 Range 头以支持断点续传
  const clientRange = request.headers.get("Range");
  if (clientRange) proxyHeaders.set("Range", clientRange);

  try {
    // 对 HEAD 请求我们也只需要头，但为了缓存我们依然抓取完整响应。
    // 更简单的做法：总是抓取 GET（因为我们要缓存 body），响应给客户端时，如果是 HEAD 就只返回头。
    const resp = await fetch(targetUrl, { method: "GET", headers: proxyHeaders, redirect: "follow" });

    if (!resp.ok && resp.status !== 206) {
      return new Response(resp.body, { status: resp.status, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 克隆用于缓存
    const cloned = resp.clone();

    // 构建客户端响应头（保留原头 + CORS）
    const clientRespHeaders = new Headers(resp.headers);
    clientRespHeaders.set("Access-Control-Allow-Origin", "*");
    clientRespHeaders.set("Accept-Ranges", "bytes");
    if (isDeb) clientRespHeaders.set("Content-Disposition", "attachment");

    // 构建缓存响应头
    const cacheHeaders = new Headers(cloned.headers);
    cacheHeaders.set("X-Cache-Age", Date.now().toString());
    cacheHeaders.set("Cache-Control", `public, max-age=${ttl}`);
    if (isDeb) cacheHeaders.set("Content-Disposition", "attachment");

    const cacheRes = new Response(cloned.body, { status: cloned.status, statusText: cloned.statusText, headers: cacheHeaders });

    // 异步写入缓存
    if (ctx?.waitUntil) {
      ctx.waitUntil(caches.default.put(cacheKey, cacheRes));
    } else {
      await caches.default.put(cacheKey, cacheRes);
    }

    // 如果是 HEAD 请求，只返回头
    if (method === "HEAD") {
      return new Response(null, { status: resp.status, headers: clientRespHeaders });
    }

    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: clientRespHeaders });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

// ==================== 定时预缓存（每日一次 + 避免重复）====================
addEventListener("scheduled", event => {
  event.waitUntil(warmUpCache());
});

async function warmUpCache() {
  console.log("⏰ 预缓存任务开始...");
  const info = await fetchReleaseInfo();
  if (!info || !info.assets || !info.assets.length) {
    console.log("❌ 未获取到 Release 资产，跳过");
    return;
  }

  const assetsToCache = info.assets.filter(a => a.name.endsWith(".deb"));
  console.log(`📦 发现 ${assetsToCache.length} 个 .deb 文件`);

  for (const asset of assetsToCache) {
    const downloadUrl = asset.browser_download_url;
    const cacheKey = new Request(downloadUrl, { method: "GET" });

    // 如果缓存已经存在且未过期，跳过下载
    const existing = await getCached(cacheKey, CONFIG.assetCacheTTL);
    if (existing) {
      console.log(`✅ ${asset.name} 已缓存，跳过`);
      continue;
    }

    let success = false;
    for (let retry = 0; retry < CONFIG.cronMaxRetries; retry++) {
      try {
        const resp = await fetch(downloadUrl, {
          headers: { "User-Agent": "Cloudflare-Worker-Cron" },
          redirect: "follow",
        });
        if (!resp.ok) {
          console.log(`⚠️ ${asset.name} 返回 ${resp.status}，重试 ${retry+1}/${CONFIG.cronMaxRetries}`);
          continue;
        }
        const cloned = resp.clone();
        const cacheHeaders = new Headers(cloned.headers);
        cacheHeaders.set("X-Cache-Age", Date.now().toString());
        cacheHeaders.set("Cache-Control", `public, max-age=${CONFIG.assetCacheTTL}`);
        cacheHeaders.set("Content-Disposition", "attachment");

        const cacheRes = new Response(cloned.body, { status: cloned.status, statusText: cloned.statusText, headers: cacheHeaders });
        await caches.default.put(cacheKey, cacheRes);
        console.log(`✅ ${asset.name} 缓存成功`);
        success = true;
        break;
      } catch (e) {
        console.log(`❌ ${asset.name} 请求失败: ${e.message}`);
      }
    }
    if (!success) console.log(`💥 ${asset.name} 最终缓存失败`);
  }
  console.log("🏁 预缓存任务结束");
}