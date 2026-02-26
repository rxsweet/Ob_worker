
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
          const ips = await resolveDomainWithFallback(domain);
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
      : "No IP records found from any domain\nAll domains failed to resolve after trying all DNS providers." + 
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

// 新增：带 fallback 的 resolve 函数
async function resolveDomainWithFallback(domain) {
  domain = domain.includes(':') ? domain.split(':')[0] : domain;

  const providers = [
    {name: "Cloudflare", url: `https://cloudflare-dns.com/dns-query?name=${domain}&type=A` },
    {name: "Google", url: `https://dns.google/resolve?name=${domain}&type=A` },
    {name: "1111", url: `https://1.1.1.1/dns-query?name=${domain}&type=A` },
    {name: "Quad9", url: `https://dns.quad9.net/dns-query?name=${domain}&type=A` }
  ];

  let lastError = null;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        headers: { 'Accept': 'application/dns-json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${provider.name}`);
      }

      const data = await response.json();

      const ips = [];
      if (data.Answer) {
        const ipv4Addresses = data.Answer
          .filter((record) => record.type === 1)
          .map((record) => record.data);
        ips.push(...ipv4Addresses);
      }

      if (ips.length > 0) {
        return ips;  // 成功拿到 IP，立即返回
      }

      // 如果 Answer 为空，也算失败，继续下一个 provider
      lastError = new Error(`No A records found from ${provider.name}`);

    } catch (error) {
      lastError = new Error(`Failed with ${provider.name}: ${error.message}`);
      // 继续尝试下一个 provider
    }
  }

  // 三个 provider 都失败
  throw lastError || new Error('All DNS providers failed');
}
