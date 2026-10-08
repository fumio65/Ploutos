import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

export function AccountsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Accounts</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="opacity-70">Accounts — coming in T009.</p>
      </IonContent>
    </IonPage>
  )
}
