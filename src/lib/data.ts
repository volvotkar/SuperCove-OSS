import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Thin typed helpers over Supabase + React Query.
 * Single-user, low-volume data: fetch whole tables, invalidate by table name.
 *
 * Offline: mutations use keyed defaults (registered below) instead of inline
 * functions, so writes made while offline are persisted as paused mutations
 * and resume after reload/reconnect. Invalidation lives in the defaults'
 * onSettled — component-level callbacks (closing modals etc.) only run for
 * live mutations, which is the behavior we want.
 */

/** Every user-data table. Also the export manifest for backups. */
export const TABLES = [
  'projects',
  'finance_categories',
  'expenses',
  'payments',
  'todo_lists',
  'todos',
  'contacts',
  'kanban_columns',
  'kanban_cards',
  'notes',
  'attachments',
  'inventory_products',
  'inventory_sales',
  'key_dates',
  'time_logs',
  'inbox_items',
  'habits',
  'habit_checks',
  'weekly_reviews',
  'scrapbooks',
  'scrapbook_items',
  'push_subscriptions',
] as const

export type TableName = (typeof TABLES)[number]

/** Tables whose DB triggers write into other tables — invalidate those too. */
const TOUCHES: Partial<Record<TableName, TableName[]>> = {
  inventory_sales: ['inventory_products', 'payments'],
  projects: ['kanban_columns'],
}

export function registerMutationDefaults(qc: QueryClient) {
  for (const table of TABLES) {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: [table] })
      for (const t of TOUCHES[table] ?? []) qc.invalidateQueries({ queryKey: [t] })
    }
    qc.setMutationDefaults(['insert', table], {
      mutationFn: async (row: Record<string, unknown>) => {
        const { data, error } = await supabase.from(table).insert(row as never).select().single()
        if (error) throw error
        return data
      },
      onSettled: invalidate,
    })
    qc.setMutationDefaults(['update', table], {
      mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
        const { data, error } = await supabase
          .from(table)
          .update(patch as never)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      },
      onSettled: invalidate,
    })
    qc.setMutationDefaults(['delete', table], {
      mutationFn: async (id: string) => {
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      },
      onSettled: invalidate,
    })
  }
}

export function useRows<T>(table: TableName | string, order?: { column: string; ascending?: boolean }) {
  return useQuery({
    queryKey: [table],
    queryFn: async (): Promise<T[]> => {
      let q = supabase.from(table).select('*')
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true })
      const { data, error } = await q
      if (error) throw error
      return data as T[]
    },
  })
}

export function useInsert<T extends object>(table: TableName | string) {
  return useMutation<T, Error, Partial<T>>({ mutationKey: ['insert', table] })
}

export function useUpdate<T extends object>(table: TableName | string) {
  return useMutation<T, Error, { id: string; patch: Partial<T> }>({ mutationKey: ['update', table] })
}

export function useDelete(table: TableName | string) {
  return useMutation<void, Error, string>({ mutationKey: ['delete', table] })
}
