const BING_ORIGIN = 'https://www.bing.com'

export default async function handler(req, res) {
  const requestUrl = new URL(req.url, 'https://start.abobb.site')
  const targetPath = requestUrl.pathname.replace(/^\/api\/bing\/?/, '/')
  const targetUrl = `${BING_ORIGIN}${targetPath}${requestUrl.search}`

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: req.headers.accept || '*/*',
      },
    })

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const cacheControl =
      response.headers.get('cache-control') || 'public, max-age=1800, s-maxage=1800'
    const body = Buffer.from(await response.arrayBuffer())

    res.status(response.status)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(body)
  } catch (error) {
    console.error('Bing proxy failed:', error)
    res.status(502).json({ error: 'bingProxyFailed' })
  }
}
