export default {
  async fetch(request, env, ctx) {
    const domains = [
      "ProxyIP.HK.CMLiussss.net",
      "ProxyIP.JP.CMLiussss.net",
      "ProxyIP.KR.CMLiussss.net",
      "ProxyIP.SG.CMLiussss.net",
      "ProxyIP.US.CMLiussss.net"
    ];

    const allIps = new Set(); // 自动去重
    const errors = [];        // 收集每个域名的失败原因

    await Promise.allSettled(
      domains.map(async (domain) => {
        try {
          const ips = await resolveDomain(domain);
          ips.forEach(ip => allIps.add(ip));
        } catch (err) {
          errors.push(`${domain}: ${err.message}`);
        }
      })
    );

    // 转数组、排序、每行一个
    const uniqueIps = Array.from(allIps).sort();
    let textContent = uniqueIps.join("\n");

    // 如果有错误，附加在后面
    if (errors.length > 0) {
      textContent += "\n\nErrors:\n" + errors.join("\n");
    }

    // 如果完全没有 IP，返回提示 + 错误信息（如果有）
    const finalText = textContent.trim()
      ? textContent
      : "No IP records found from any domain\nAll domains failed to resolve." + 
        (errors.length > 0 ? "\n\nErrors:\n" + errors.join("\n") : "");

    return new Response(finalText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  },
};

// 修改后的 resolveDomain：只查询 A 记录（IPv4），去掉 AAAA
async function resolveDomain(domain) {
  domain = domain.includes(':') ? domain.split(':')[0] : domain;
  try {
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
      headers: { 'Accept': 'application/dns-json' },
    });

    const data = await response.json();
    const ips = [];

    if (data.Answer) {
      const ipv4Addresses = data.Answer
        .filter((record) => record.type === 1)
        .map((record) => record.data);
      ips.push(...ipv4Addresses);
    }

    if (ips.length === 0) {
      throw new Error('No A records found');
    }

    return ips;
  } catch (error) {
    throw new Error(`DNS resolution failed: ${error.message}`);
  }
}
