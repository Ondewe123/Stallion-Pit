const OPTION_CODE_RE = /\b([0-9]{3}[A-Z]?)\s*:\s*([^"|;\n\r]+|"[^"]*")/gi
const CONTEXT_WINDOW = 80

const normalizeCode = (value) => String(value || '').trim().toUpperCase()

const cleanLabel = (value) => {
  const text = String(value || '')
    .replace(/^"|"$/g, '')
    .replace(/Not\s+for\s+options?/gi, ' ')
    .replace(/\b(?:not\s+for\s+options?|for\s+options?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

const optionText = (part) => [
  part?.usage,
  part?.remarks,
  part?.name,
].filter(Boolean).join(' | ')

function precedingContext(text, index) {
  return text.slice(Math.max(0, index - CONTEXT_WINDOW), index).toLowerCase()
}

function ruleTypeForContext(context) {
  if (/\b(?:not\s+for|without|except)\s+options?\b/.test(context)) return 'excluded'
  if (/\b(?:for|with)\s+options?\b/.test(context)) return 'required'
  return null
}

function mergeRule(rules, type, code, label) {
  const bucket = rules[type]
  if (bucket.some(rule => rule.code === code)) return
  bucket.push({ code, label })
}

export function parseOptionMentions(part) {
  const text = optionText(part)
  const mentions = []
  let match
  while ((match = OPTION_CODE_RE.exec(text))) {
    const code = normalizeCode(match[1])
    const label = cleanLabel(match[2])
    if (!code || !label) continue
    mentions.push({
      code,
      label,
      ruleType: ruleTypeForContext(precedingContext(text, match.index)),
    })
  }
  return mentions
}

export function parseOptionRules(part) {
  const rules = { required: [], excluded: [] }
  for (const mention of parseOptionMentions(part)) {
    if (!mention.ruleType) continue
    mergeRule(rules, mention.ruleType, mention.code, mention.label)
  }
  return rules
}

export function appliesToVehicleOptions(part, selectedCodes = []) {
  const installed = new Set((selectedCodes || []).map(normalizeCode).filter(Boolean))
  const rules = parseOptionRules(part)
  if (rules.excluded.some(rule => installed.has(rule.code))) return false
  if (rules.required.length === 0) return true
  return rules.required.some(rule => installed.has(rule.code))
}

export function filterByVehicleOptions(parts, selectedCodes = []) {
  return (parts || []).filter(part => appliesToVehicleOptions(part, selectedCodes))
}

export function buildOptionCodeCandidates(parts) {
  const byCode = new Map()
  for (const part of parts || []) {
    const rules = parseOptionRules(part)
    const ruleTypesByCode = new Map()
    for (const rule of rules.required) ruleTypesByCode.set(rule.code, { label: rule.label, required: true })
    for (const rule of rules.excluded) {
      const current = ruleTypesByCode.get(rule.code) || { label: rule.label }
      ruleTypesByCode.set(rule.code, { ...current, label: current.label || rule.label, excluded: true })
    }

    for (const [code, ruleInfo] of ruleTypesByCode) {
      const current = byCode.get(code) || {
        code,
        labels: new Map(),
        count: 0,
        requiredCount: 0,
        excludedCount: 0,
      }
      current.count += 1
      if (ruleInfo.required) current.requiredCount += 1
      if (ruleInfo.excluded) current.excludedCount += 1
      current.labels.set(ruleInfo.label, (current.labels.get(ruleInfo.label) || 0) + 1)
      byCode.set(code, current)
    }
  }

  return [...byCode.values()]
    .map(option => {
      const [label] = [...option.labels.entries()].sort((a, b) => b[1] - a[1])[0] || ['']
      return {
        code: option.code,
        label,
        count: option.count,
        requiredCount: option.requiredCount,
        excludedCount: option.excludedCount,
      }
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}
