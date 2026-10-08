import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'

export function TransactionsPage() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Transactions</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="opacity-70">Transactions — coming in T012.</p>
      </IonContent>
    </IonPage>
  )
}
