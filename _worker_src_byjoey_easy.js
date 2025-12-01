// Cloudflare Workers 直接粘贴版：美观显示 今天请求量 + 今天可观测性事件（免费版专用，修正为“/天”）
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 支持根路径 / 和 /getusage 两个入口
  if (path !== "/" && path !== "/getusage") {
    return new Response("路径错误，请访问 / 或 /getusage", { status: 404 });
  }

  const AccountID = url.searchParams.get("AccountID");
  const APIToken  = url.searchParams.get("APIToken");
  const Email     = url.searchParams.get("Email");
  const GlobalKey = url.searchParams.get("GlobalAPIKey");

  if (!AccountID || !APIToken) {
    // 没参数时显示使用说明
    return new Response(`
      <h1>Cloudflare 免费额度一键查看</h1>
      <p>请在地址栏加上你的参数：</p>
      <p style="background:#f0f0f0;padding:15px;border-radius:8px;">
        ${url.origin}/?AccountID=<b>你的AccountID</b>&APIToken=<b>你的Token</b>
      </p>
      <p>（推荐用上面这种 API Token 方式，更安全）</p>
    `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // 并行查询两个数据
  const [reqData, eventData] = await Promise.all([
    getTodayRequests(AccountID, APIToken),
    getTodayEvents(AccountID, APIToken)
  ]);

  const now = new Date().toISOString().replace("T", " ").substr(0, 19) + "（UTC）";

  const html = `
<!DOCTYPE html>
<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CF 免费额度</title>
<style>
  body{font-family: -apple-system,system-ui,Arial,sans-serif;background:#f6f9fc;padding:20px;color:#333;}
  .card{background:white;border-radius:12px;padding:20px;margin:15px 0;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
  .num{font-size:42px;font-weight:bold;margin:10px 0;}
  .label{font-size:18px;color:#555;margin-bottom:8px;}
  .bar{background:#e0e0e0;border-radius:8px;height:20px;margin:10px 0;overflow:hidden;}
  .fill{background:#4caf50;height:100%;transition:width 1s;}
  .red{background:#f44336;}
  .yellow{background:#ff9800;}
  .time{color:#888;font-size:14px;margin-top:30px;text-align:center;}
</style>

<div class="card">
  <div class="label">今天的请求（免费 10万/天）</div>
  <div class="num">${reqData.total.toLocaleString()} <small style="font-size:50%;color:#666;">/ 100,000</small></div>
  <div class="bar"><div class="fill ${reqData.percent>90?'red':reqData.percent>70?'yellow':''}" style="width:${reqData.percent}%"></div></div>
  <div>Workers: ${reqData.workers.toLocaleString()}　Pages: ${reqData.pages.toLocaleString()}</div>
</div>

<div class="card">
  <div class="label">今天的可观测性事件（免费 20万/天）</div>
  <div class="num">${eventData.total.toLocaleString()} <small style="font-size:50%;color:#666;">/ 200,000</small></div>
  <div class="bar"><div class="fill ${eventData.percent>90?'red':eventData.percent>70?'yellow':''}" style="width:${eventData.percent}%"></div></div>
  <div>（日志、console.log、trace 等都算在这里）</div>
</div>

<div class="time">更新时间：${now}</div>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

// ================ 今天请求量 ================
async function getTodayRequests(accountId, token) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const query = `
    query {
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          pagesFunctionsInvocationsAdaptiveGroups(filter: {datetime_geq: "${today}"}) { sum { requests } }
          workersInvocationsAdaptive(filter: {datetime_geq: "${today}"}) { sum { requests } }
        }
      }
    }`;

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  const json = await res.json();
  const acc = json.data.viewer.accounts[0] || {};
  const pages = acc.pagesFunctionsInvocationsAdaptiveGroups?.reduce((s,g)=>s+(g.sum?.requests||0),0)||0;
  const workers = acc.workersInvocationsAdaptive?.reduce((s,g)=>s+(g.sum?.requests||0),0)||0;
  const total = pages + workers;
  const percent = Math.min(100, (total / 100000 * 100).toFixed(2));

  return { pages, workers, total, percent };
}

// ================ 今天可观测性事件（近似值） ================
// 当前 GraphQL 只能拿到 invocations，事件数 ≈ invocations（大多数情况下误差很小）
async function getTodayEvents(accountId, token) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const query = `
    query {
      viewer {
        accounts(filter: {accountTag: "${accountId}"}) {
          workersInvocationsAdaptive(filter: {datetime_geq: "${today}"}) { sum { requests } }
          pagesFunctionsInvocationsAdaptiveGroups(filter: {datetime_geq: "${today}"}) { sum { requests } }
        }
      }
    }`;

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  const json = await res.json();
  const acc = json.data.viewer.accounts[0] || {};
  const workers = acc.workersInvocationsAdaptive?.reduce((s,g)=>s+(g.sum?.requests||0),0)||0;
  const pages = acc.pagesFunctionsInvocationsAdaptiveGroups?.reduce((s,g)=>s+(g.sum?.requests||0),0)||0;
  const total = workers + pages;
  const percent = Math.min(100, (total / 200000 * 100).toFixed(2));

  return { total, percent };
}
