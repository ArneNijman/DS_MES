/**
 * HyperMill Agent — Dutch Shape MES
 *
 * Micro-agent die draait op de PC waar HyperMill geïnstalleerd is.
 * Ontvangt een verzoek van de MES-browser en opent het bestand direct
 * in HyperMill via Windows Start-Process — geen download, geen registry.
 *
 * Gebruik:
 *   node hypermill-agent.js
 *
 * Autostart: voeg toe aan Windows Taakplanner of Opstartmap.
 */

import { createServer } from 'http'
import { exec }         from 'child_process'

const PORT = 3098

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return
  }

  if (req.method === 'POST' && req.url === '/open') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { path } = JSON.parse(body)
        if (!path?.trim()) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'pad verplicht' })); return
        }
        // Verwijder aanhalingstekens om command injection te voorkomen
        const safePath = path.trim().replace(/"/g, '')
        exec(`start "" "${safePath}"`, { shell: true }, err => {
          if (err) console.error(`❌ Open mislukt: ${err.message}`)
        })
        console.log(`📂 Geopend: ${safePath}`)
        res.writeHead(200); res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(500); res.end(JSON.stringify({ error: 'ongeldig verzoek' }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ ok: true, agent: 'hypermill' })); return
  }

  res.writeHead(404); res.end()
}).listen(PORT, () => {
  console.log(`✅ HyperMill agent actief op poort ${PORT}`)
  console.log(`   Wacht op verzoeken van de MES browser...`)
})
