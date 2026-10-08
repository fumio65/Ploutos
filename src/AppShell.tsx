import type { Session } from '@supabase/supabase-js'
import { IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route } from 'react-router-dom'
import { SyncProvider } from './lib/syncContext'
import { Tabs } from './navigation/Tabs'

export function AppShell({ session }: { session: Session }) {
  return (
    <SyncProvider>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route path="/tabs/*" element={<Tabs session={session} />} />
          <Route path="/" element={<Navigate to="/tabs/dashboard" replace />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </SyncProvider>
  )
}
