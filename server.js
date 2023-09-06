import express from 'express'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()

const enforceHTTPS = (req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(['https://', req.get('Host'), req.url].join(''))
  }
  return next()
}

if (process.env.NODE_ENV === 'production') {
  app.use(enforceHTTPS)
}

const setCache = (req, res, next) => {
  // Cache assets for 30 days
  res.set('Cache-Control', 'public, max-age=2592000')
  next()
}

// Use the cache middleware for static assets
app.use('/assets', setCache, express.static(`${__dirname}/dist/assets`))

// Serve other static files from Vite's build directory
app.use(express.static(`${__dirname}/dist`))

// Fallback to index.html for Single Page Applications
app.get('*', (req, res) => {
  res.sendFile(`${__dirname}/dist/index.html`)
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
