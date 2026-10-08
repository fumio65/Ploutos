import type { Session } from '@supabase/supabase-js'
import { IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/react'
import { ellipsisHorizontalOutline, homeOutline, swapHorizontalOutline, walletOutline } from 'ionicons/icons'
import { Navigate, Route } from 'react-router-dom'
import { AccountsPage } from '../pages/AccountsPage'
import { BudgetsPage } from '../pages/BudgetsPage'
import { CategoriesPage } from '../pages/CategoriesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DebtsPage } from '../pages/DebtsPage'
import { DevSyncTestPage } from '../pages/DevSyncTestPage'
import { GoalsPage } from '../pages/GoalsPage'
import { MorePage } from '../pages/MorePage'
import { RecurringPage } from '../pages/RecurringPage'
import { TransactionsPage } from '../pages/TransactionsPage'

export function Tabs({ session }: { session: Session }) {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="dashboard" element={<DashboardPage session={session} />} />
        <Route path="accounts" element={<AccountsPage session={session} />} />
        <Route path="transactions" element={<TransactionsPage session={session} />} />
        <Route path="more" element={<MorePage session={session} />} />
        <Route path="more/budgets" element={<BudgetsPage session={session} />} />
        <Route path="more/categories" element={<CategoriesPage session={session} />} />
        <Route path="more/goals" element={<GoalsPage session={session} />} />
        <Route path="more/recurring" element={<RecurringPage session={session} />} />
        <Route path="more/debts" element={<DebtsPage session={session} />} />
        <Route path="more/dev-sync-test" element={<DevSyncTestPage session={session} />} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
      </IonRouterOutlet>

      <IonTabBar slot="bottom">
        <IonTabButton tab="dashboard" href="/tabs/dashboard">
          <IonIcon icon={homeOutline} />
          <IonLabel>Dashboard</IonLabel>
        </IonTabButton>
        <IonTabButton tab="accounts" href="/tabs/accounts">
          <IonIcon icon={walletOutline} />
          <IonLabel>Accounts</IonLabel>
        </IonTabButton>
        <IonTabButton tab="transactions" href="/tabs/transactions">
          <IonIcon icon={swapHorizontalOutline} />
          <IonLabel>Transactions</IonLabel>
        </IonTabButton>
        <IonTabButton tab="more" href="/tabs/more">
          <IonIcon icon={ellipsisHorizontalOutline} />
          <IonLabel>More</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  )
}
