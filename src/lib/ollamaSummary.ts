import { HANDOFF_AI_SYSTEM_PROMPT } from './aiHandoffPrompt'

function ollamaApiBase (): string {
  const envUrl = import.meta.env.VITE_OLLAMA_URL?.trim().replace(/\/$/, '')
  if (envUrl) return envUrl
  if (import.meta.env.DEV) return '/api/ollama'
  return 'http://127.0.0.1:11434'
}

function defaultModel (): string {
  return (import.meta.env.VITE_OLLAMA_MODEL?.trim() || 'llama3.2').replace(/^"|"$/g, '')
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

  const data = (await res.json()) as OllamaChatResponse
  if (!res.ok)
    throw new Error(data.error || `Ollama HTTP ${res.status}`)

  const text = data.message?.content?.trim() ?? ''
  if (!text) throw new Error('Ollama returned an empty summary.')
  return text
}

export function handoffOllamaModelLabel (): string {
  return defaultModel()
}
