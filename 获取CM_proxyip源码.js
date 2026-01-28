export default {
  async fetch(request, env, ctx) {
    const domains = [
      "ProxyIP.HK.CMLiussss.net",
      "ProxyIP.JP.CMLiussss.net",
      "ProxyIP.KR.CMLiussss.net",
      "ProxyIP.SG.CMLiussss.net",
      "ProxyIP.US.CMLiussss.net"
    ];

    const allIps = new Set();  // 自动去重

    await Promise.allSettled(
      domains.map(async (domain) => {
        try {
          const ips = await resolveDomain(domain);
          ips.forEach(ip => allIps.add(ip));
        } catch (err) {
          // 某个域名失败就跳过，不影响整体
        }
      })
    );

    // 转数组、排序、每行一个
    const uniqueIps = Array.from(allIps).sort();
    const textContent = uniqueIps.join("\n");

    // 如果完全没有 IP，返回提示文本
    const finalText = textContent.trim() 
      ? textContent 
      : "No IP records found from any domain";

    return new Response(finalText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  },
};

// 原 resolveDomain 函数，未改动
async function resolveDomain(domain) {
  domain = domain.includes(':') ? domain.split(':')[0] : domain;
  try {
    const [ipv4Response, ipv6Response] = await Promise.all([
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=A`, {
        headers: { 'Accept': 'application/dns-json' },
      }),
      fetch(`https://1.1.1.1/dns-query?name=${domain}&type=AAAA`, {
        headers: { 'Accept': 'application/dns-json' },
      }),
    ]);

    const [ipv4Data, ipv6Data] = await Promise.all([
      ipv4Response.json(),
      ipv6Response.json(),
    ]);

    const ips = [];

    if (ipv4Data.Answer) {
      const ipv4Addresses = ipv4Data.Answer
        .filter((record) => record.type === 1)
        .map((record) => record.data);
      ips.push(...ipv4Addresses);
    }

    if (ipv6Data.Answer) {
      const ipv6Addresses = ipv6Data.Answer
        .filter((record) => record.type === 28)
        .map((record) => `[${record.data}]`);
      ips.push(...ipv6Addresses);
    }

    if (ips.length === 0) {
      throw new Error('No A or AAAA records found');
    }

    return ips;
  } catch (error) {
    throw new Error(`DNS resolution failed: ${error.message}`);
  }
}
