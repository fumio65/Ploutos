import type { Session } from '@supabase/supabase-js'
import { db, type Category } from './db'
import { nowIso, queueChange } from './sync'

// ----------------------------------------------------------------------------
// Default category set (T010). Seeded once per user, the first time
// AppShell mounts for them and they have no categories yet — not on every
// sign-in, so a user who deletes all their categories doesn't have them
// silently reappear.
// ----------------------------------------------------------------------------

const DEFAULT_CATEGORIES: Array<{ name: string; kind: Category['kind']; color: string }> = [
  { name: 'Salary', kind: 'income', color: '#10b981' },
  { name: 'Business', kind: 'income', color: '#10b981' },
  { name: 'Gifts', kind: 'income', color: '#10b981' },
  { name: 'Other Income', kind: 'income', color: '#10b981' },
  { name: 'Food', kind: 'expense', color: '#ef4444' },
  { name: 'Transportation', kind: 'expense', color: '#f59e0b' },
  { name: 'Utilities', kind: 'expense', color: '#6366f1' },
  { name: 'Rent', kind: 'expense', color: '#1e2a5a' },
  { name: 'Shopping', kind: 'expense', color: '#ef4444' },
  { name: 'Entertainment', kind: 'expense', color: '#f59e0b' },
  { name: 'Health', kind: 'expense', color: '#6366f1' },
  { name: 'Education', kind: 'expense', color: '#64748b' },
  { name: 'Other Expense', kind: 'expense', color: '#64748b' },
]

/** Seeds the default category set for this user if they have none yet. */
export async function seedDefaultCategoriesIfNeeded(session: Session) {
  const existing = await db.categories.where('user_id').equals(session.user.id).count()
  if (existing > 0) return

  const now = nowIso()
  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    id: crypto.randomUUID(),
    user_id: session.user.id,
    name: c.name,
    kind: c.kind,
    color: c.color,
    created_at: now,
    updated_at: now,
  }))

  await db.categories.bulkPut(categories)
  for (const category of categories) {
    await queueChange('categories', category.id)
  }
}
