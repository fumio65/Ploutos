import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Navigate, Route } from 'react-router-dom'
import { seedDefaultCategoriesIfNeeded } from './lib/categories'
import { SyncProvider } from './lib/syncContext'
import { Tabs } from './navigation/Tabs'

export function AppShell({ session }: { session: Session }) {
  // Once per sign-in (not every sign-in — only if the user truly has none
  // yet), give them a starting set of categories so T012's transaction form
  // isn't a dead end with nothing to pick from.
  useEffect(() => {
    seedDefaultCategoriesIfNeeded(session)
  }, [session])

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
