import { IonButton, IonCard, IonCardContent, IonContent, IonPage } from '@ionic/react'
import { supabase } from '../lib/supabase'

export function SignInPage() {
  const signInWithGoogle = async () => {
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
          </IonCardContent>
        </IonCard>
      </IonContent>
    </IonPage>
  )
}
