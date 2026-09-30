async function searchHtml(query, options = {}, requestOptions = {}) {
  const { load } = await import('cheerio');
  const signal = AbortSignal.any([
    ...(requestOptions.signal ? [requestOptions.signal] : []),
    AbortSignal.timeout(12000),
  ]);
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'text/html' },
    body: new URLSearchParams({ q: query, kl: options.region || 'wt-wt' }),
    redirect: 'error',
    signal,
  });
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
    await response.body?.cancel();
    throw new Error('DuckDuckGo search unavailable.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('DuckDuckGo response too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const $ = load(Buffer.concat(chunks, size).toString('utf8'));
  if ($('form[action*="anomaly"], #challenge-form, .anomaly-modal').length) {
    throw new Error('DuckDuckGo requires a verification challenge.');
  }
  const results = [];
  const seen = new Set();
  $('.result').each((_, element) => {
    if (results.length >= 8 || $(element).hasClass('result--ad')) return;
    const link = $(element).find('.result__a').first();
    const href = link.attr('href');
    if (!href) return;
    try {
      let url = new URL(href, 'https://duckduckgo.com');
      if (/(^|\.)duckduckgo\.com$/.test(url.hostname) && url.searchParams.has('uddg')) {
        url = new URL(url.searchParams.get('uddg'));
      }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /(^|\.)duckduckgo\.com$/.test(url.hostname)) return;
      const title = link.text().replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!title || seen.has(url.href)) return;
      seen.add(url.href);
      const description = $(element).find('.result__snippet').text().replace(/\s+/g, ' ').trim().slice(0, 1200);
      results.push({ title, url: url.href, hostname: url.hostname, description, rawDescription: description, icon: '' });
    } catch { /* Ignore malformed result URLs. */ }
  });
  return { noResults: results.length === 0, vqd: '', results };
}

module.exports = { searchHtml };
