import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { IonApp } from '@ionic/react'
import { supabase } from './lib/supabase'
import { AppShell } from './AppShell'
import { SignInPage } from './pages/SignInPage'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return <IonApp>{loading ? null : session ? <AppShell session={session} /> : <SignInPage />}</IonApp>
}

export default App
