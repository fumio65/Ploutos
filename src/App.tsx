import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  IonApp,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonCard,
  IonCardContent,
} from '@ionic/react'
import { supabase } from './lib/supabase'

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

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <IonApp>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ploutos</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {/* Tailwind-styled balance card (navy/emerald, Modern Minimal theme) */}
        <div className="bg-navy text-white rounded-2xl p-6 shadow-lg">
          <p className="text-sm opacity-80">Total Balance</p>
          <p className="text-3xl font-bold mt-1">₱40,000.00</p>
          <p className="text-emerald text-sm mt-2">+ ₱10,000 saved toward Trip goal</p>
        </div>

        {/* Native Ionic card, unstyled by Tailwind, to confirm no conflict */}
        <IonCard className="mt-4">
          <IonCardContent>
            This card uses Ionic's own styling. If this renders with its normal
            card chrome (and the block above renders as a navy rounded card),
            Tailwind utilities and Ionic components are coexisting cleanly.
          </IonCardContent>
        </IonCard>

        {/* Supabase auth test (T005) */}
        <IonCard className="mt-4">
          <IonCardContent>
            {loading ? (
              <p>Checking session…</p>
            ) : session ? (
              <>
                <p className="mb-2">
                  Signed in as <strong>{session.user.email}</strong>
                </p>
                <IonButton expand="block" color="medium" onClick={signOut}>
                  Sign out
                </IonButton>
              </>
            ) : (
              <>
                <p className="mb-2">Not signed in.</p>
                <IonButton expand="block" onClick={signInWithGoogle}>
                  Sign in with Google
                </IonButton>
              </>
            )}
          </IonCardContent>
        </IonCard>

        <IonButton expand="block" className="mt-4">
          Add Transaction
        </IonButton>
      </IonContent>
    </IonApp>
  )
}

export default App
