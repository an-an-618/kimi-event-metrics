import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import handler from './handler.mjs'
const port = Number(process.env.PORT || 5180)
const vite = process.env.NODE_ENV !== 'production' ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' }) : null
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return handler(req, res)
  if (vite) return vite.middlewares(req, res)
  try {
    const path = new URL(req.url, 'http://local').pathname
    const filename = resolve('dist', '.' + (path === '/' ? '/index.html' : path))
    if (!filename.startsWith(resolve('dist') + '/')) { res.writeHead(403); return res.end() }
    let file
    try { file = await readFile(filename); res.setHeader('Content-Type', types[extname(filename)] || 'application/octet-stream') }
    catch { file = await readFile(resolve('dist/index.html')); res.setHeader('Content-Type', 'text/html') }
    res.end(file)
  } catch { res.writeHead(500); res.end('Server error') }
})
server.listen(port, '0.0.0.0', () => console.log(`Kimi metrics full-stack demo: http://localhost:${port}`))
