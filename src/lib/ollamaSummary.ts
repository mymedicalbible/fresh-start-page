import { HANDOFF_AI_SYSTEM_PROMPT } from './aiHandoffPrompt'

function ollamaApiBase (): string {
  const envUrl = import.meta.env.VITE_OLLAMA_URL?.trim().replace(/\/$/, '')
  if (envUrl) return envUrl
  if (import.meta.env.DEV) return '/api/ollama'
  return 'http://127.0.0.1:11434'
}

function defaultModel (): string {
  return (import.meta.env.VITE_OLLAMA_MODEL?.trim() || 'gemma3:4b').replace(/^"|"$/g, '')
}

export type OllamaChatResponse = {
  message?: { role?: string; content?: string }
  error?: string
}

/**
 * Generate handoff prose via local Ollama (/api/chat).
 */
export async function generateOllamaHandoffSummary (opts: {
  patientData: string
  patientFocus?: string
  mode: 'fast' | 'thorough'
  model?: string
}): Promise<string> {
  const patientData = opts.patientData.trim()
  if (!patientData) throw new Error('No patientData provided.')

  const userContent = [
    opts.patientFocus?.trim()
      ? `PATIENT PRIORITY (center the narrative on this when relevant):\n${opts.patientFocus.trim()}\n\n`
      : '',
    'PATIENT DATA (from app):\n',
    patientData,
  ].join('')

  const base = ollamaApiBase()
  const url = `${base}/api/chat`
  const model = opts.model?.trim() || defaultModel()
  const numPredict = opts.mode === 'fast' ? 2048 : 4096

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: HANDOFF_AI_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: numPredict,
      },
    }),
  })

  let data: OllamaChatResponse
  try {
    data = (await res.json()) as OllamaChatResponse
  } catch {
    throw new Error(`Ollama returned an unreadable response (HTTP ${res.status}). Is Ollama running?`)
  }
  if (!res.ok)
    throw new Error(data.error || `Ollama HTTP ${res.status}`)

  const text = data.message?.content?.trim() ?? ''
  if (!text) throw new Error('Ollama returned an empty response. Try a different model.')
  return text
}

/** True when the error looks like a browser CORS / network block. */
export function isOllamaCorsOrNetworkError (msg: string): boolean {
  return /failed to fetch|load failed|networkerror|cors|net::/i.test(msg)
}

export function handoffOllamaModelLabel (): string {
  return defaultModel()
}

/** Copy-paste hint for Windows PowerShell (includes this site + common dev origins). */
export function ollamaOriginsPowerShellSnippet (appOrigin: string): string {
  const o = appOrigin.replace(/\/$/, '')
  const extras = ',http://localhost:5173,http://127.0.0.1:5173'
  return [
    '# Quit Ollama, then in PowerShell (each line separate):',
    `$env:OLLAMA_ORIGINS="${o}${extras},*"`,
    'ollama serve',
    '',
    '# If "ollama serve" is installed as a Windows Service / tray app, set a USER or SYSTEM',
    '# environment variable OLLAMA_ORIGINS to the same string, then restart Ollama from',
    '# the Start menu (tray apps do not see $env: from an unrelated PowerShell window).',
    '',
    `# Your app origin: ${o}`,
  ].join('\n')
}
