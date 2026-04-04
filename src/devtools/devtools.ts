// Registers our panel in Chrome DevTools
chrome.devtools.panels.create(
  'Protocol-Lens',
  '',
  '/src/panel/panel.html',
  () => {
    console.log('Protocol-Lens panel created')
  }
)

// The HAR interceptor — fires on every completed network request
chrome.devtools.network.onRequestFinished.addListener((request) => {
  // Only care about JSON API responses
  const contentType = request.response.headers.find(
    (h) => h.name.toLowerCase() === 'content-type'
  )
  const isJson = contentType?.value?.includes('application/json')
  if (!isJson) return

  // getContent() is callback-based, so we wrap it
  request.getContent((body) => {
    if (!body) return

    try {
      const parsed = JSON.parse(body)
      const entry = {
        url: request.request.url,
        method: request.request.method,
        status: request.response.status,
        timestamp: Date.now(),
        payload: parsed,
      }

      // Send to our panel via the background service worker
      chrome.runtime.sendMessage({ type: 'HAR_ENTRY', data: entry })
    } catch {
      // Not valid JSON, skip
    }
  })
})