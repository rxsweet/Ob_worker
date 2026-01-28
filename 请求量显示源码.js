// _worker.js —— 最终极简纯净版（仅北京时间更新 + 最清晰提示）
//api令牌：只使用‘用户分析：读取’
const ACCOUNT_ID = "xxx";                    // ← 修改这里
const API_TOKEN   = "xxx";     // ← 修改这里

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/admin/getCloudflareUsage') {
      const result = await getUsage(ACCOUNT_ID, API_TOKEN);
      return new Response(JSON.stringify(result, null, 2), {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const data = await getUsage(ACCOUNT_ID, API_TOKEN);
    const used = data.totalRequests;
    const limit = 100000;
    const percent = (used / limit * 100).toFixed(3);

    // 当前北京时间（完整显示：2025/12/1 15:27:32）
    const nowBeijing = new Date().toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/'); // 保持 2025/12/1 格式

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CF 免费请求使用情况</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:20px;line-height:1.6;background:#fafafa;color:#222;}
    @media (prefers-color-scheme:dark){body{background:#111;color:#ddd;}}
    h1{font-size:1.9em;margin-bottom:8px;}
    .card{background:#fff;border-radius:16px;padding:24px;margin:20px 0;box-shadow:0 6px 20px rgba(0,0,0,0.08);}
    @media (prefers-color-scheme:dark){.card{background:#222;box-shadow:0 6px 20px rgba(0,0,0,0.4);}}
    .num{font-size:3.4em;font-weight:bold;color:#0068ff;margin:8px 0;}
    .bar{height:32px;background:#e0e0e0;border-radius:10px;overflow:hidden;margin:16px 0;}
    .fill{background:#0068ff;height:100%;width:${percent}%;transition:width 1.5s ease;}
    .label{font-weight:600;margin-bottom:6px;color:#0068ff;}
    .small{color:#666;font-size:0.92em;margin-top:12px;}
    .footer{margin-top:60px;text-align:center;color:#888;font-size:0.95em;line-height:1.8;}
  </style>
</head>
<body>
  <h1>Cloudflare 免费请求使用情况</h1>
  <div class="small">更新时间（北京时间）：${nowBeijing}</div>

  <div class="card">
    <div class="label">今日已使用请求数</div>
    <div class="num">${used.toLocaleString()}</div>
    <div class="bar"><div class="fill"></div></div>
    <div style="font-size:1.3em;">
      ${used.toLocaleString()} / 100,000　<span style="color:#0068ff">(${percent}%)</span>
    </div>
    <div class="small">
      Workers 请求：${data.workersRequests.toLocaleString()}<br>
      Pages 请求　：${data.pagesRequests.toLocaleString()}
    </div>
  </div>

  <div class="footer">
    今日还剩 <strong>${(limit - used).toLocaleString()}</strong> 次免费请求<br>
    每天 <strong>08:00 北京时间</strong> 自动清零
  </div>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }
};

// 核心统计函数（不变，最稳定拆分查询）
async function getUsage(accountId, token) {
  const API = "https://api.cloudflare.com/client/v4";
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const datetime_geq = now.toISOString();
    const datetime_leq = new Date().toISOString();

    let pages = 0, workers = 0;

    const p = await fetch(`${API}/graphql`, { method: "POST", headers, body: JSON.stringify({
      query: `query($a:String!,$f:DateTimeAdaptiveGroupFilter){viewer{accounts(filter:{accountTag:$a}){pagesInvocationsAdaptiveGroups(limit:1000,filter:$f){sum{requests}}}}}`,
      variables: { a: accountId, f: { datetime_geq, datetime_leq } }
    })});
    if (p.ok) {
      const j = await p.json();
      if (!j.errors) pages = j.data?.viewer?.accounts?.[0]?.pagesInvocationsAdaptiveGroups?.reduce((s,i)=>s+(i.sum?.requests||0),0) || 0;
    }

    const w = await fetch(`${API}/graphql`, { method: "POST", headers, body: JSON.stringify({
      query: `query($a:String!,$f:AccountWorkersInvocationsAdaptiveFilter_InputObject){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:1000,filter:$f){sum{requests}}}}}`,
      variables: { a: accountId, f: { datetime_geq, datetime_leq } }
    })});
    if (w.ok) {
      const j = await w.json();
      if (!j.errors) workers = j.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.reduce((s,i)=>s+(i.sum?.requests||0),0) || 0;
    }

    return {
      success: true,
      date: now.toISOString().split('T')[0],
      pagesRequests: pages,
      workersRequests: workers,
      totalRequests: pages + workers
    };

  } catch (e) {
    console.error(e);
    return { success: false, totalRequests: 0, pagesRequests: 0, workersRequests: 0 };
  }
}
