import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

export function DashboardPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Dashboard</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="opacity-70">Dashboard — coming in T013.</p>
      </IonContent>
    </IonPage>
  )
}
