import { useEffect, useState } from 'react'
import type { ParserSettings } from '../types'

const PROVIDERS: { value: string; label: string; hint: string; models: string[] }[] = [
  {
    value: '',
    label: 'Server default',
    hint: 'Uses the key configured on the server. Nothing to fill in.',
    models: [],
  },
  {
    value: 'groq',
    label: 'Groq',
    hint: 'Fast, generous free tier. Key: console.groq.com/keys',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
  },
  {
    value: 'gemini',
    label: 'Gemini',
    hint: 'Key: aistudio.google.com/apikey. Free tier throttles quickly.',
    models: ['gemini-3.6-flash'],
  },
  {
    value: 'bedrock',
    label: 'AWS Bedrock',
    hint: 'Uses the server’s AWS credentials, not a pasted key.',
    models: ['anthropic.claude-opus-5', 'anthropic.claude-sonnet-5'],
  },
  {
    value: 'ollama',
    label: 'Ollama (local)',
    hint: 'Runs on your own machine. No key needed.',
    models: ['llama3.2:3b', 'llama3.1'],
  },
  {
    value: 'fallback',
    label: 'No model (rules only)',
    hint: 'Skips the agent entirely and uses the built-in keyword parser.',
    models: [],
  },
]

interface Props {
  settings: ParserSettings
  onSave: (next: ParserSettings) => void
  onClose: () => void
}

export function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ParserSettings>(settings)
  const current = PROVIDERS.find((p) => p.value === draft.provider) ?? PROVIDERS[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Model settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            {'✕'}
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Which model turns your words into search filters. Leave it on the default unless you want
          to use your own key.
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-600">
          Provider
          <select
            value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value, model: '' })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-[11px] text-slate-400">{current.hint}</p>

        {current.models.length > 0 && (
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Model
            <input
              list="model-options"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder={current.models[0]}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none"
            />
            <datalist id="model-options">
              {current.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        )}

        {(draft.provider === 'groq' || draft.provider === 'gemini') && (
          <label className="mt-3 block text-xs font-medium text-slate-600">
            API key
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="Leave blank to use the server’s key"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-emerald-400 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Kept in this browser only and sent with your searches. Never shared with other users.
            </span>
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft({ provider: '', model: '', apiKey: '' })
              onSave({ provider: '', model: '', apiKey: '' })
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
