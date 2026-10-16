import { Analytics } from '@hcengineering/analytics'
import core, {
  AccountRole,
  type AnyAttribute,
  type Attribute,
  type Class,
  type Client,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  generateId,
  getCurrentAccount,
  type Hierarchy,
  type MixinUpdate,
  type Ref,
  type RefTo,
  type Tx,
  type TxApplyIf,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxResult,
  type TxUpdateDoc
} from '@hcengineering/core'
import platform, { getResource, PlatformError, translate } from '@hcengineering/platform'
import { BasePresentationMiddleware, type PresentationMiddleware } from '@hcengineering/presentation'
import view, { type IAggregationManager } from '@hcengineering/view'
import notification from '@hcengineering/notification'
import { addNotification, NotificationSeverity } from '@hcengineering/ui'
import ReadOnlyNotification from './components/ReadOnlyNotification.svelte'
import ForbiddenNotification from './components/ForbiddenNotification.svelte'
import { getCurrentLanguage } from '@hcengineering/theme'

/**
 * @public
 */
export interface DocSubScriber<T extends Doc = Doc> {
  attributes: Array<Ref<AnyAttribute>>

  _class: Ref<Class<T>>
  query: DocumentQuery<T>
  options?: FindOptions<T>

  refresh: () => void
}

/**
 * @public
 */
export class AggregationMiddleware extends BasePresentationMiddleware implements PresentationMiddleware {
  mgrs: Map<Ref<Class<Doc>>, IAggregationManager<any>> = new Map<Ref<Class<Doc>>, IAggregationManager<any>>()
  docs: Doc[] | undefined

  subscribers: Map<string, DocSubScriber> = new Map<string, DocSubScriber>()
  private constructor (client: Client, next?: PresentationMiddleware) {
    super(client, next)
  }

  static create (client: Client, next?: PresentationMiddleware): AggregationMiddleware {
    return new AggregationMiddleware(client, next)
  }

  async notifyTx (...tx: Tx[]): Promise<void> {
    const promises: Array<Promise<void>> = []
    for (const [, value] of this.mgrs) {
      promises.push(value.notifyTx(...tx))
    }
    await Promise.all(promises)
    await this.provideNotifyTx(...tx)
  }

  async close (): Promise<void> {
    this.mgrs.forEach((mgr) => {
      mgr.close()
    })
    await this.provideClose()
  }

  async tx (tx: Tx): Promise<TxResult> {
    return await this.provideTx(tx)
  }

  private refreshSubscribers (): void {
    for (const s of this.subscribers.values()) {
      // TODO: Do something more smart and track if used component field is changed.
      s.refresh()
    }
  }

  async subscribe<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options: FindOptions<T> | undefined,
    refresh: () => void
  ): Promise<{
      unsubscribe: () => void
      query?: DocumentQuery<T>
      options?: FindOptions<T>
    }> {
    const ret = await this.provideSubscribe(_class, query, options, refresh)
    const h = this.client.getHierarchy()

    const id = generateId()
    const s: DocSubScriber<T> = {
      _class,
      query,
      refresh,
      options,
      attributes: []
    }
    const statusFields: Array<Attribute<Doc>> = []
    const allAttrs = h.getAllAttributes(_class)

    const updatedQuery: DocumentQuery<T> = h.clone(ret.query ?? query)
    const finalOptions = h.clone(ret.options ?? options ?? {})

    await this.updateQueryOptions<T>(allAttrs, h, statusFields, updatedQuery, finalOptions, _class)

    if (statusFields.length > 0) {
      this.subscribers.set(id, s)
      return {
        unsubscribe: () => {
          ret.unsubscribe()
          this.subscribers.delete(id)
        },
        query: updatedQuery,
        options: finalOptions
      }
    }
    return { unsubscribe: ret.unsubscribe }
  }

  // TODO: rework notifications to avoid using Account and remove it
  private shouldAggregate (attrClass: Ref<Class<Doc>>, _class: Ref<Class<Doc>>): boolean {
    // TODO: FIXME
    // if (attrClass !== core.class.Account) {
    //   return true
    // }

    const h = this.client.getHierarchy()
    const skipAccountAggregation = [
      notification.class.BrowserNotification,
      notification.class.InboxNotification,
      notification.class.MentionInboxNotification,
      notification.class.CommonInboxNotification,
      notification.class.ActivityInboxNotification,
      notification.class.DocNotifyContext
    ]

    for (const skipClass of skipAccountAggregation) {
      if (_class === skipClass) {
        return false
      }

      if (h.isDerived(_class, skipClass)) {
        return false
      }
    }
    return true
  }

  private async getAggregationManager (_class: Ref<Class<Doc>>): Promise<IAggregationManager<any> | undefined> {
    let mgr = this.mgrs.get(_class)

    if (mgr === undefined) {
      const h = this.client.getHierarchy()
      const mixin = h.classHierarchyMixin(_class, view.mixin.Aggregation)
      if (
        mixin?.createAggregationManager !== undefined &&
        mixin?.setStoreFunc !== undefined &&
        mixin?.filterFunc !== undefined &&
        mixin?._class !== undefined
      ) {
        const f = await getResource(mixin.createAggregationManager)
        const storeFunc = await getResource(mixin.setStoreFunc)
        const filterFunc = await getResource(mixin.filterFunc)
        mgr = f(
          this.client,
          () => {
            this.refreshSubscribers()
          },
          storeFunc,
          filterFunc,
          _class
        )
        this.mgrs.set(_class, mgr)
      }
    }

    return mgr
  }

  async findAll<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T> | undefined
  ): Promise<FindResult<T>> {
    const docFields: Array<Attribute<Doc>> = []
    const h = this.client.getHierarchy()
    const allAttrs = h.getAllAttributes(_class)
    const finalOptions = h.clone(options ?? {})

    const fquery = h.clone(query ?? {})

    await this.updateQueryOptions<T>(allAttrs, h, docFields, fquery, finalOptions, _class)

    return await this.provideFindAll(_class, fquery, finalOptions)
  }

  private async updateQueryOptions<T extends Doc>(
    allAttrs: Map<string, AnyAttribute>,
    h: Hierarchy,
    docFields: Array<Attribute<Doc>>,
    query: DocumentQuery<T>,
    finalOptions: FindOptions<T>,
    _class: Ref<Class<T>>
  ): Promise<void> {
    for (const attr of allAttrs.values()) {
      try {
        if (attr.type._class !== core.class.RefTo) {
          continue
        }

        if (!this.shouldAggregate((attr.type as RefTo<Doc>).to, _class)) {
          continue
        }

        const mgr = await this.getAggregationManager((attr.type as RefTo<Doc>).to)
        if (mgr === undefined) {
          continue
        }
        if (h.isDerived((attr.type as RefTo<Doc>).to, mgr.getAttrClass())) {
          let target: Array<Ref<Doc>> = []
          let targetNin: Array<Ref<Doc>> = []
          docFields.push(attr)
          const v = (query as any)[attr.name]

          if (v != null) {
            // Only add filter if we have filer inside.
            if (typeof v === 'string') {
              target.push(v as Ref<Doc>)
            } else {
              if (v.$in !== undefined) {
                target.push(...v.$in)
              } else if (v.$nin !== undefined) {
                targetNin.push(...v.$nin)
              } else if (v.$ne !== undefined) {
                targetNin.push(v.$ne)
              }
            }

            // Find all similar name statues for same attribute name.
            target = await mgr.categorize(target, attr)
            targetNin = await mgr.categorize(targetNin, attr)
            if (target.length > 0 || targetNin.length > 0) {
              ;(query as any)[attr.name] = {}
              if (target.length > 0) {
                ;(query as any)[attr.name].$in = target
              }
              if (targetNin.length > 0) {
                ;(query as any)[attr.name].$nin = targetNin
              }
            }
          }
          if (finalOptions.lookup !== undefined) {
            // Remove lookups by status field
            if ((finalOptions.lookup as any)[attr.name] !== undefined) {
              const { [attr.name]: _, ...newLookup } = finalOptions.lookup as any
              finalOptions.lookup = newLookup
            }
          }

          // Update sorting if defined.
          if (mgr.updateSorting !== undefined) {
            await mgr.updateSorting(finalOptions, attr)
          }
        }
      } catch (err: any) {
        Analytics.handleError(err)
        console.error(err)
      }
    }
  }
}

// servone: ref and enum fields whose new value is sent; free-text fields (title, description) only appear by name.
const TRACKED_VALUES = new Set(['status', 'priority', 'assignee'])

function describeChanges (changes: DocumentUpdate<Doc> | MixinUpdate<Doc, Doc>): Record<string, string | number | string[] | null> {
  const changed: string[] = []
  const described: Record<string, string | number | string[] | null> = { changed }
  for (const [key, op] of Object.entries(changes)) {
    // `$push`, `$inc`, `$unset` and friends hold the field names one level down.
    changed.push(...(key.startsWith('$') ? Object.keys(op) : [key]))
    if (TRACKED_VALUES.has(key) && (typeof op === 'string' || typeof op === 'number' || op === null)) described[key] = op
  }
  return described
}

/**
 * @public
 */
export class AnalyticsMiddleware extends BasePresentationMiddleware implements PresentationMiddleware {
  private constructor (client: Client, next?: PresentationMiddleware) {
    super(client, next)
  }

  async notifyTx (...tx: Tx[]): Promise<void> {
    await this.provideNotifyTx(...tx)
  }

  async close (): Promise<void> {
    await this.provideClose()
  }

  static create (client: Client, next?: PresentationMiddleware): AnalyticsMiddleware {
    return new AnalyticsMiddleware(client, next)
  }

  async tx (tx: Tx): Promise<TxResult> {
    this.handleTx(tx)
    try {
      return await this.provideTx(tx)
    } catch (err) {
      // servone: the pipeline above turns write errors into a status toast, so this is the last place a failed save is visible.
      Analytics.handleEvent('doc_failed', { object_class: (tx as TxCUD<Doc>).objectClass ?? tx._class })
      throw err
    }
  }

  private handleTx (...txes: Tx[]): void {
    for (const etx of txes) {
      if (etx._class === core.class.TxApplyIf) {
        const applyIf = etx as TxApplyIf
        this.handleTx(...applyIf.txes)
      }
      if (TxProcessor.isExtendsCUD(etx._class)) {
        const cud = etx as TxCUD<Doc>
        if (cud.objectClass === core.class.BenchmarkDoc) continue
        const _class = this.client.getHierarchy().getClass(cud.objectClass)
        if (_class.label !== undefined) {
          // servone: stable names with class and field ids; `Update ${label}` mixed languages and said nothing about what changed.
          const target = {
            object_class: cud.objectClass,
            object_id: cud.objectId,
            space: cud.objectSpace,
            attached_to_class: cud.attachedToClass,
            collection: cud.collection
          }
          if (cud._class === core.class.TxCreateDoc) {
            Analytics.handleEvent('doc_created', target)
          } else if (cud._class === core.class.TxUpdateDoc) {
            Analytics.handleEvent('doc_updated', { ...target, ...describeChanges((cud as TxUpdateDoc<Doc>).operations) })
          } else if (cud._class === core.class.TxMixin) {
            const mixinTx = cud as TxMixin<Doc, Doc>
            Analytics.handleEvent('doc_updated', { ...target, mixin: mixinTx.mixin, ...describeChanges(mixinTx.attributes) })
          } else if (cud._class === core.class.TxRemoveDoc) {
            Analytics.handleEvent('doc_deleted', target)
          }
        }
      }
    }
  }
}

/**
 * @public
 */
export class ReadOnlyAccessMiddleware extends BasePresentationMiddleware implements PresentationMiddleware {
  private constructor (client: Client, next?: PresentationMiddleware) {
    super(client, next)
  }

  async notifyTx (...tx: Tx[]): Promise<void> {
    await this.provideNotifyTx(...tx)
  }

  async close (): Promise<void> {
    await this.provideClose()
  }

  static create (client: Client, next?: PresentationMiddleware): ReadOnlyAccessMiddleware {
    return new ReadOnlyAccessMiddleware(client, next)
  }

  async tx (tx: Tx): Promise<TxResult> {
    if (getCurrentAccount()?.role === AccountRole.ReadOnlyGuest) {
      addNotification(
        await translate(view.string.ReadOnlyWarningTitle, {}, getCurrentLanguage()),
        await translate(view.string.ReadOnlyWarningMessage, {}, getCurrentLanguage()),
        ReadOnlyNotification,
        undefined,
        NotificationSeverity.Info,
        'readOnlyNotification'
      )
      return {}
    }
    try {
      return await this.provideTx(tx)
    } catch (err: any) {
      if (err instanceof PlatformError && err.status.code === platform.status.Forbidden) {
        addNotification(
          await translate(view.string.PermissionWarningTitle, {}, getCurrentLanguage()),
          await translate(view.string.PermissionWarningMessage, {}, getCurrentLanguage()),
          ForbiddenNotification,
          {
            onClose: () => {}
          },
          NotificationSeverity.Info
        )
        return {}
      } else {
        throw err
      }
    }
  }
}
