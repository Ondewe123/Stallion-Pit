/*
  ILcats missing-groups recovery scraper.

  How to use:
  1. Open the Mercedes ILcats VIN page in Chrome.
  2. Open DevTools > Console.
  3. Paste this entire file and press Enter.
  4. Wait until it downloads:
     - ilcats-ADB2020186F450004-missing-diagrams.csv
     - ilcats-ADB2020186F450004-missing-parts.csv
     - ilcats-ADB2020186F450004-missing-debug.json

  The output CSVs are shaped for scripts/import-ipc.mjs after merging with
  the original partial CSVs via scripts/merge-ipc-csv.mjs.
*/

(async () => {
  const CONFIG = {
    vin: 'ADB2020186F450004',
    modelCode: '202.018',
    engineCode: '111.920',
    gearboxCode: '717.416',
    brand: 'mercedes',
    catalog: '44V',
    model: '202018',
    language: 'en',
    aggregateText: 'Body And Chasis',
    missingGroups: [
      '55', '56', '57', '58', '59',
      '60', '61', '62', '63', '64', '65', '66', '67', '68', '69',
      '70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
      '80', '81', '82', '83', '84', '85', '86', '87', '88', '89',
      '90', '91', '92', '93', '94', '95', '96', '97', '98', '99',
    ],
    delayMs: 450,
    maxRetries: 2,
  }

  const DIAGRAM_HEADERS = ['branch', 'group', 'group_name', 'subgroup', 'diagram_title', 'part_count', 'source_url', 'image_url']
  const PART_HEADERS = [
    'vin',
    'model_code',
    'engine_code',
    'gearbox_code',
    'branch',
    'catalog_group',
    'group_name',
    'subgroup',
    'diagram_title',
    'item_no',
    'part_number',
    'replacement_numbers',
    'quantity',
    'name',
    'usage',
    'remarks',
    'source_url',
    'diagram_image_url',
    'price_url',
  ]

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
  const absoluteUrl = (href) => new URL(href, location.href).toString()
  const csvCell = (value) => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const toCsv = (headers, rows) =>
    [headers.join(','), ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\n') + '\n'
  const downloadText = (filename, text, type = 'text/plain') => {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const branchFromUrl = (url) => {
    const u = new URL(url)
    const spmModel = u.searchParams.get('spmmodel')
    const spmAgg = u.searchParams.get('spmaggtype')
    if (spmAgg === 'M' && spmModel) return `engine_${spmModel}`
    if (spmAgg === 'GM' && spmModel) return `manual_transmission_${spmModel}`
    if (spmAgg === 'GA' && spmModel) return `automatic_transmission_${spmModel}`
    return `body_chassis_${u.searchParams.get('catalog') || CONFIG.catalog}`
  }

  const fetchDoc = async (url) => {
    let lastError = null
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt += 1) {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        return new DOMParser().parseFromString(html, 'text/html')
      } catch (error) {
        lastError = error
        await sleep(CONFIG.delayMs * (attempt + 1))
      }
    }
    throw lastError
  }

  const isPartNumber = (text) => /^(A|N)\s?\d{6,}$/i.test(clean(text).replace(/\s+/g, ''))
  const normalizePartNumber = (text) => clean(text).replace(/\s+/g, '')
  const priceUrl = (partNumber) =>
    partNumber ? `https://www.neoriginal.ru/prices?brand=mercedes&article=${encodeURIComponent(partNumber)}` : ''

  const titleFromDoc = (doc, url) => {
    const fromHeading = [...doc.querySelectorAll('h1,h2,h3,.caption,.title,.name')]
      .map(el => clean(el.textContent))
      .find(text => text && !/mercedes|parts catalog/i.test(text))
    if (fromHeading) return fromHeading.replace(/^\d+\s+/, '')

    const u = new URL(url)
    return `${u.searchParams.get('group') || ''}/${u.searchParams.get('subgroup') || ''}`.trim()
  }

  const imageFromDoc = (doc) => {
    const img = [...doc.images].find(node =>
      /getImage|BM_IMAGES|\.png|\.jpg|\.jpeg/i.test(node.src || node.getAttribute('src') || '')
    )
    return img ? absoluteUrl(img.getAttribute('src') || img.src) : ''
  }

  const urlsFromDoc = (doc) => {
    const urls = []
    for (const a of doc.querySelectorAll('a[href]')) {
      urls.push({
        url: absoluteUrl(a.getAttribute('href')),
        text: clean(a.textContent),
      })
    }
    for (const node of doc.querySelectorAll('[onclick]')) {
      const onclick = node.getAttribute('onclick') || ''
      for (const match of onclick.matchAll(/['"]([^'"]+\?[^'"]+)['"]/g)) {
        urls.push({
          url: absoluteUrl(match[1]),
          text: clean(node.textContent),
        })
      }
    }
    return urls
  }

  const discoverGroupListUrls = () => {
    const urls = urlsFromDoc(document)
      .filter(link => {
        const u = new URL(link.url)
        const isGroupsPage = u.searchParams.get('function') === 'getGroups'
        const isWantedAggregate = !CONFIG.aggregateText || link.text.toLowerCase().includes(CONFIG.aggregateText.toLowerCase())
        return isGroupsPage && isWantedAggregate
      })
      .map(link => link.url)

    if (new URL(location.href).searchParams.get('function') === 'getGroups') urls.push(location.href)
    return [...new Set(urls)]
  }

  const collectDiagramUrlsFromDoc = (doc, allowedGroups) => {
    const urls = new Map()
    for (const link of urlsFromDoc(doc)) {
      const u = new URL(link.url)
      if (u.searchParams.get('function') !== 'getParts') continue
      const linkGroup = u.searchParams.get('group')
      const subgroup = u.searchParams.get('subgroup')
      if (allowedGroups.has(linkGroup) && subgroup) urls.set(`${linkGroup}|${subgroup}|${link.url}`, link.url)
    }
    return urls
  }

  const discoverAllDiagramUrls = async () => {
    const allowedGroups = new Set(CONFIG.missingGroups)
    const urls = new Map()
    const groupListUrls = discoverGroupListUrls()
    const samples = []

    for (const url of groupListUrls) {
      const doc = url === location.href ? document : await fetchDoc(url)
      for (const [key, value] of collectDiagramUrlsFromDoc(doc, allowedGroups)) urls.set(key, value)
      samples.push(...urlsFromDoc(doc).slice(0, 12).map(link => ({ text: link.text, url: link.url })))
    }

    return { urls: [...urls.values()], groupListUrls, samples }
  }

  const parsePartRows = (doc, diagram, sourceUrl, imageUrl) => {
    const rows = []
    const tableRows = [...doc.querySelectorAll('tr')]

    for (const tr of tableRows) {
      const cells = [...tr.querySelectorAll('td,th')].map(td => clean(td.textContent))
      if (cells.length < 3) continue

      const partIndex = cells.findIndex(isPartNumber)
      if (partIndex < 0) continue

      const partLink = [...tr.querySelectorAll('a[href]')]
        .map(a => ({ href: absoluteUrl(a.getAttribute('href')), text: clean(a.textContent) }))
        .find(a => normalizePartNumber(a.text) === normalizePartNumber(cells[partIndex]))
      const partNumber = normalizePartNumber(cells[partIndex])
      const itemNo = cells.slice(0, partIndex).reverse().find(text => /^\d+[A-Z]?$/.test(text)) || cells[0] || ''
      const after = cells.slice(partIndex + 1).filter(Boolean)
      const replacement = after.find(text => isPartNumber(text) && normalizePartNumber(text) !== partNumber) || ''
      const quantity = after.find(text => /^-?\d+([.,]\d+)?$|^NB$/i.test(text)) || ''
      const name = after.find(text =>
        text !== replacement &&
        text !== quantity &&
        !isPartNumber(text) &&
        !/^[-\d.,]+$/.test(text)
      ) || ''
      const tail = after.filter(text => text && text !== replacement && text !== quantity && text !== name && !isPartNumber(text))

      rows.push({
        vin: CONFIG.vin,
        model_code: CONFIG.modelCode,
        engine_code: CONFIG.engineCode,
        gearbox_code: CONFIG.gearboxCode,
        branch: diagram.branch,
        catalog_group: diagram.group,
        group_name: diagram.group_name,
        subgroup: diagram.subgroup,
        diagram_title: diagram.diagram_title,
        item_no: itemNo,
        part_number: partNumber,
        replacement_numbers: replacement ? normalizePartNumber(replacement) : '',
        quantity,
        name,
        usage: tail[0] || '',
        remarks: tail.slice(1).join(' | '),
        source_url: sourceUrl,
        diagram_image_url: imageUrl,
        price_url: partLink?.href || priceUrl(partNumber),
      })
    }

    const unique = new Map()
    for (const row of rows) {
      unique.set([
        row.catalog_group,
        row.subgroup,
        row.item_no,
        row.part_number,
        row.name,
        row.usage,
        row.remarks,
      ].join('|'), row)
    }
    return [...unique.values()]
  }

  const diagrams = []
  const parts = []
  const debug = {
    started_at: new Date().toISOString(),
    page: location.href,
    groups: [],
    errors: [],
  }

  console.log('[ILcats IPC] Starting missing group scrape', CONFIG)

  const discovered = await discoverAllDiagramUrls()
  const diagramUrlsByGroup = new Map()
  for (const url of discovered.urls) {
    const group = new URL(url).searchParams.get('group')
    if (!diagramUrlsByGroup.has(group)) diagramUrlsByGroup.set(group, [])
    diagramUrlsByGroup.get(group).push(url)
  }
  debug.group_list_urls = discovered.groupListUrls
  debug.discovered_diagram_links = discovered.urls.length
  debug.link_samples = discovered.samples
  console.log(`[ILcats IPC] discovered ${discovered.urls.length} real diagram links from ${discovered.groupListUrls.length} group-list pages`)

  for (const group of CONFIG.missingGroups) {
    try {
      const diagramUrls = diagramUrlsByGroup.get(group) || []
      console.log(`[ILcats IPC] group ${group}: ${diagramUrls.length} diagram links`)
      const groupDebug = { group, diagram_links: diagramUrls.length, diagrams: [] }

      for (const url of diagramUrls) {
        try {
          await sleep(CONFIG.delayMs)
          const doc = await fetchDoc(url)
          const u = new URL(url)
          const imageUrl = imageFromDoc(doc)
          const diagram = {
            branch: branchFromUrl(url),
            group,
            group_name: group,
            subgroup: u.searchParams.get('subgroup') || '',
            diagram_title: titleFromDoc(doc, url),
            part_count: 0,
            source_url: url,
            image_url: imageUrl,
          }
          const parsedParts = parsePartRows(doc, diagram, url, imageUrl)
          diagram.part_count = parsedParts.length
          diagrams.push(diagram)
          parts.push(...parsedParts)
          groupDebug.diagrams.push({
            subgroup: diagram.subgroup,
            title: diagram.diagram_title,
            parts: parsedParts.length,
            url,
          })
          console.log(`[ILcats IPC] ${group}/${diagram.subgroup}: ${parsedParts.length} parts - ${diagram.diagram_title}`)
        } catch (error) {
          debug.errors.push({ group, url, message: error.message })
          console.warn(`[ILcats IPC] Failed diagram ${url}: ${error.message}`)
        }
      }

      debug.groups.push(groupDebug)
    } catch (error) {
      debug.errors.push({ group, message: error.message })
      console.warn(`[ILcats IPC] Failed group ${group}: ${error.message}`)
    }
  }

  debug.finished_at = new Date().toISOString()
  debug.diagram_rows = diagrams.length
  debug.part_rows = parts.length
  window.__ILCATS_IPC_MISSING_DEBUG__ = { CONFIG, diagrams, parts, debug }

  const prefix = `ilcats-${CONFIG.vin}-missing`
  downloadText(`${prefix}-diagrams.csv`, toCsv(DIAGRAM_HEADERS, diagrams), 'text/csv')
  downloadText(`${prefix}-parts.csv`, toCsv(PART_HEADERS, parts), 'text/csv')
  downloadText(`${prefix}-debug.json`, JSON.stringify(debug, null, 2), 'application/json')

  console.log(`[ILcats IPC] Done: ${diagrams.length} diagrams, ${parts.length} parts, ${debug.errors.length} errors`)
  console.log('[ILcats IPC] Debug object is available as window.__ILCATS_IPC_MISSING_DEBUG__')
})()
