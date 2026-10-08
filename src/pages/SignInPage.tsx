import { Capacitor } from '@capacitor/core'
import { IonButton, IonCard, IonCardContent, IonContent, IonPage } from '@ionic/react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithGoogleNative } from '../lib/nativeAuth'

export function SignInPage() {
  const [error, setError] = useState<string | null>(null)

  const signInWithGoogle = async () => {
    setError(null)
    // Native (Capacitor-wrapped) builds need a plugin-based sign-in flow
    // instead of the browser redirect below — see src/lib/nativeAuth.ts.
    // Capacitor.isNativePlatform() is always false in a plain web browser,
    // so this branch is unreachable there and the flow below is unchanged.
    if (Capacitor.isNativePlatform()) {
      try {
        await signInWithGoogleNative()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Native sign-in failed.')
      }
      return
    }

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="bg-navy text-white rounded-2xl p-6 shadow-lg mt-8">
          <p className="text-2xl font-bold">Ploutos</p>
          <p className="text-sm opacity-80 mt-1">See your money clearly.</p>
        </div>

        <IonCard className="mt-4">
          <IonCardContent>
            <p className="mb-2">Sign in to continue.</p>
            <IonButton expand="block" onClick={signInWithGoogle}>
              Sign in with Google
            </IonButton>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  )
}
