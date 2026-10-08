import type { Session } from '@supabase/supabase-js'
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function MorePage({ session }: { session: Session }) {
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>More</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="mb-4 text-sm opacity-80">
          Signed in as <strong>{session.user.email}</strong>
        </p>

        <IonList>
          <IonItem button onClick={() => navigate('/tabs/more/budgets')}>
            <IonLabel>Budgets</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/categories')}>
            <IonLabel>Categories</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/goals')}>
            <IonLabel>Goals</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/recurring')}>
            <IonLabel>Recurring</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/debts')}>
            <IonLabel>Debts</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/reports')}>
            <IonLabel>Reports</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/ask-ai')}>
            <IonLabel>Ask AI</IonLabel>
          </IonItem>
          <IonItem button onClick={() => navigate('/tabs/more/dev-sync-test')}>
            <IonLabel>Dev: Sync layer test</IonLabel>
          </IonItem>
        </IonList>

        <IonButton expand="block" color="medium" className="mt-4" onClick={signOut}>
          Sign out
        </IonButton>
      </IonContent>
    </IonPage>
  )
}
