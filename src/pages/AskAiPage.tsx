import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { sendOutline } from 'ionicons/icons'
import { supabase } from '../lib/supabase'

interface ChatMessage {
  role: 'user' | 'assistant' | 'error'
  text: string
}

const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'What are my account balances?',
  'Am I over budget on anything?',
  'What did I spend the most on last month?',
]

// Ask AI (T019) — a lightweight Q&A chat over the user's own data via the
// `ai-qa` Supabase Edge Function (tool-calling against Gemini, see
// supabase/functions/ai-qa/index.ts). Deliberately not persisted to Dexie —
// this is in-memory chat history for the current screen visit only
// (small v1 scope, per TASKS.md T019); nothing here touches the offline
// sync layer or the financial data model.
export function AskAiPage({ session }: { session: Session }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const ask = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || sending) return

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setSending(true)

    try {
      const { data, error } = await supabase.functions.invoke('ai-qa', {
        body: { question: trimmed },
      })
      if (error) throw error
      const answer = (data as { answer?: string; error?: string })?.answer
      const errMsg = (data as { answer?: string; error?: string })?.error
      if (errMsg && !answer) {
        setMessages((prev) => [...prev, { role: 'error', text: errMsg }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: answer ?? 'No answer came back.' }])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: err instanceof Error ? err.message : 'Something went wrong asking the AI.' },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ask AI</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="mb-3 text-xs opacity-60">
          Signed in as {session.user.email}. Ask about your own spending, income, balances, or budgets — answers
          are generated from your real data, not guessed.
        </p>

        {messages.length === 0 && (
          <div className="mb-4">
            <p className="text-sm opacity-70 mb-2">Try one of these:</p>
            <div className="flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <IonButton key={q} fill="outline" size="small" onClick={() => ask(q)}>
                  {q}
                </IonButton>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'self-end bg-navy text-white rounded-2xl px-4 py-2 max-w-[85%]'
                  : m.role === 'error'
                    ? 'self-start bg-red-100 text-red-800 rounded-2xl px-4 py-2 max-w-[85%]'
                    : 'self-start bg-mist rounded-2xl px-4 py-2 max-w-[85%]'
              }
              style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="self-start flex items-center gap-2 opacity-70">
              <IonSpinner name="dots" />
              <span className="text-sm">Thinking…</span>
            </div>
          )}
        </div>

        <IonItem lines="none" className="rounded-xl">
          <IonInput
            value={input}
            placeholder="Ask about your money…"
            onIonInput={(e) => setInput(e.detail.value ?? '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask(input)
            }}
          />
          <IonButton slot="end" fill="clear" disabled={sending || !input.trim()} onClick={() => ask(input)}>
            <IonIcon icon={sendOutline} />
          </IonButton>
        </IonItem>
      </IonContent>
    </IonPage>
  )
}
