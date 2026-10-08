import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  IonAlert,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline, trashOutline } from 'ionicons/icons'
import { db, type Category } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'

const SWATCHES = ['#1e2a5a', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#64748b']

type FormState = {
  name: string
  kind: Category['kind']
  color: string
}

function blankForm(kind: Category['kind']): FormState {
  return { name: '', kind, color: SWATCHES[0] }
}

export function CategoriesPage({ session }: { session: Session }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [segment, setSegment] = useState<Category['kind']>('expense')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form, setForm] = useState<FormState>(blankForm('expense'))
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const refresh = async () => {
    // `name`/`kind` combo filtering happens client-side below; `deleted_at`
    // isn't filterable with a simple equals() since it's undefined for most
    // rows, so just pull everything for this user and filter in JS.
    const all = await db.categories.where('user_id').equals(session.user.id).toArray()
    const visible = all.filter((c) => !c.deleted_at)
    visible.sort((a, b) => a.name.localeCompare(b.name))
    setCategories(visible)
  }

  useEffect(() => {
    refresh()
  }, [])

  const visibleCategories = categories.filter((c) => c.kind === segment)

  const openCreateModal = () => {
    setEditingCategory(null)
    setForm(blankForm(segment))
    setModalOpen(true)
  }

  const openEditModal = (category: Category) => {
    setEditingCategory(category)
    setForm({ name: category.name, kind: category.kind, color: category.color ?? SWATCHES[0] })
    setModalOpen(true)
  }

  const saveCategory = async () => {
    const name = form.name.trim()
    if (!name) return
    const now = nowIso()

    if (editingCategory) {
      const updated: Category = { ...editingCategory, name, kind: form.kind, color: form.color, updated_at: now }
      await db.categories.put(updated)
      await queueChange('categories', updated.id)
    } else {
      const category: Category = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        name,
        kind: form.kind,
        color: form.color,
        created_at: now,
        updated_at: now,
      }
      await db.categories.put(category)
      await queueChange('categories', category.id)
    }

    setModalOpen(false)
    await refresh()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const now = nowIso()
    const updated: Category = { ...deleteTarget, deleted_at: now, updated_at: now }
    await db.categories.put(updated)
    await queueChange('categories', updated.id)
    setDeleteTarget(null)
    await refresh()
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Categories</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={segment} onIonChange={(e) => setSegment((e.detail.value as Category['kind']) ?? 'expense')}>
            <IonSegmentButton value="expense">
              <IonLabel>Expense</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="income">
              <IonLabel>Income</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {visibleCategories.length === 0 ? (
          <p className="opacity-70 ion-padding">No {segment} categories yet — tap + to add one.</p>
        ) : (
          <IonList>
            {visibleCategories.map((category) => (
              <IonItemSliding key={category.id}>
                <IonItem button onClick={() => openEditModal(category)}>
                  <div
                    slot="start"
                    style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category.color ?? '#999' }}
                  />
                  <IonLabel>{category.name}</IonLabel>
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => setDeleteTarget(category)}>
                    <IonIcon slot="icon-only" icon={trashOutline} />
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </IonList>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={openCreateModal}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        <IonAlert
          isOpen={deleteTarget !== null}
          onDidDismiss={() => setDeleteTarget(null)}
          header="Delete category?"
          message={deleteTarget ? `"${deleteTarget.name}" will be removed from the picker list.` : undefined}
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            { text: 'Delete', role: 'destructive', handler: confirmDelete },
          ]}
        />

        <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{editingCategory ? 'Edit category' : 'New category'}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonItem>
              <IonInput
                label="Name"
                labelPlacement="stacked"
                placeholder="e.g. Groceries"
                value={form.name}
                onIonInput={(e) => setForm((f) => ({ ...f, name: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem lines="none" className="ion-padding-top">
              <IonSegment
                value={form.kind}
                onIonChange={(e) => setForm((f) => ({ ...f, kind: (e.detail.value as Category['kind']) ?? 'expense' }))}
              >
                <IonSegmentButton value="expense">
                  <IonLabel>Expense</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="income">
                  <IonLabel>Income</IonLabel>
                </IonSegmentButton>
              </IonSegment>
            </IonItem>

            <div className="ion-padding-top">
              <p className="text-sm opacity-70 mb-2">Color</p>
              <div className="flex gap-2">
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: hex }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: hex,
                      border: form.color === hex ? '3px solid #000' : '1px solid rgba(0,0,0,0.2)',
                    }}
                    aria-label={`Choose color ${hex}`}
                  />
                ))}
              </div>
            </div>

            <IonButton expand="block" className="mt-6" onClick={saveCategory} disabled={!form.name.trim()}>
              {editingCategory ? 'Save changes' : 'Create category'}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
