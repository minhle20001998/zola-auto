export interface TemplateCtx {
  id: string
  phone: string
  filename: string
  name: string
  index: number
  total: number
}

export interface RenderResult {
  text: string
  unknownTokens: string[]
}

const KNOWN = new Set(['id', 'phone', 'filename', 'name', 'index', 'total'])

export function renderCaption(template: string, ctx: TemplateCtx): RenderResult {
  if (!template) return { text: '', unknownTokens: [] }
  const unknownTokens: string[] = []
  const text = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, raw: string) => {
    const key = raw.toLowerCase()
    if (!KNOWN.has(key)) {
      unknownTokens.push(raw)
      return `{${raw}}`
    }
    switch (key) {
      case 'id':
        return ctx.id
      case 'phone':
        return ctx.phone
      case 'filename':
        return ctx.filename
      case 'name':
        return ctx.name ?? ''
      case 'index':
        return String(ctx.index)
      case 'total':
        return String(ctx.total)
      default:
        return `{${raw}}`
    }
  })
  return { text: text.trim(), unknownTokens }
}
