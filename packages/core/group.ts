import {
  BehaviorSubject,
  Observable,
  combineLatest,
  of,
  concat,
  from,
  timeout,
  catchError,
  firstValueFrom,
} from 'rxjs'
import { skip, distinctUntilChanged, map, switchMap, mergeMap } from 'rxjs/operators'
import {
  TRxFilterGroup,
  TFilterConfig,
  TFilterGroupOptions,
  TFilterReaction,
  IFilterState,
  IFilterValue,
  FilterConfigArrayToMap,
} from './types'
import { UrlStateGroup } from './query'
import { RxInitialFilterGroup } from './initial'
import { mapValues, isEqual } from 'lodash-es'

export class RxFilterGroup<T extends Record<string, TFilterConfig<any, any, any>>>
  implements TRxFilterGroup<T>
{
  private configMap: T
  private nodeMap: Partial<{
    [K in keyof T]: BehaviorSubject<IFilterState<T>[K]>
  }> = {}
  private urlState: UrlStateGroup
  private finalStream$: Observable<IFilterState<T>> | undefined
  private finalValueStream$: Observable<IFilterValue<T>> | undefined
  private loading = false
  private initPromise: Promise<Awaited<ReturnType<RxFilterGroup<any>['init']>>> | undefined
  private subscriptions: Set<ReturnType<Observable<any>['subscribe']>> = new Set()
  private timeout = 2000 // 接口超时配置

  constructor(configMap: T, options?: TFilterGroupOptions) {
    this.configMap = configMap
    this.urlState = new UrlStateGroup()
    this.timeout = options?.timeout ?? this.timeout
  }

  get filterGroupStream(): Observable<IFilterState<T>> | undefined {
    return this.finalStream$
  }

  get filterGroupValueStream(): Observable<IFilterValue<T>> | undefined {
    return this.finalValueStream$
  }

  get filterKeys(): string[] {
    // RxFilterGroup 没有保留利用 array 配置时的顺序，这里重新用 for-in 抽了一次
    const keys: string[] = []
    // eslint-disable-next-line guard-for-in
    for (const key in this.configMap) {
      keys.push(key)
    }
    return keys
  }

  /**
   * 筛选节点初始化
   * @param key 筛选字段key
   * @param initialValue 筛选字段初始状态
   */
  private initializeNode(key: keyof T, initialValueMap: IFilterState<T>) {
    if (this.nodeMap?.[key]) {
      return this.nodeMap[key]
    }

    const config = this.configMap[key]
    const initialValue = initialValueMap[key]

    // 无依赖的基础节点
    if (!config.dependencies?.length) {
      const node = new BehaviorSubject<IFilterState<T>[keyof T]>({
        name: config.name,
        visible: initialValue?.visible ?? config.visible ?? true,
        loading: false,
        value: initialValue?.value ?? null,
        componentProps: initialValue?.componentProps ?? {},
      } as IFilterState<T>[keyof T])
      this.nodeMap[key] = node
      return node
    }

    // 收集依赖
    const dependencies = config.dependencies.reduce(
      (acc, dep) => {
        acc[dep] = this.initializeNode(dep as keyof T, initialValueMap)
        return acc
      },
      {} as Record<string, BehaviorSubject<IFilterState<T>[keyof T]>>
    )

    return this.createAsyncNode(key, initialValueMap, dependencies)
  }

  private createAsyncNode(
    key: keyof T,
    initialValueMap: IFilterState<T>,
    dependencies: Record<string, BehaviorSubject<IFilterState<T>[keyof T]>>
  ): BehaviorSubject<IFilterState<T>[keyof T]> {
    const initialValue = initialValueMap[key]
    const config = this.configMap[key]
    const node = new BehaviorSubject<IFilterState<T>[keyof T]>(initialValue)

    const subscription = combineLatest(dependencies)
      .pipe(
        skip(1),
        switchMap((depValues) => {
          if (Object.values(depValues).some((v) => v.loading)) {
            return of({ ...node.value, loading: true })
          }
          if (Array.isArray(config.reaction)) {
            from(config.reaction)
              .pipe(mergeMap((reaction) => from(this.handleReaction(key, depValues, reaction))))
              .subscribe((value) => {
                node.next(value)
              })
          }
          if (typeof config.reaction === 'function') {
            return concat(
              of({ ...node.value, loading: true }),
              from(this.handleReaction(key, depValues, config.reaction)).pipe(
                timeout(this.timeout),
                catchError(() => of({ ...node.value, loading: false }))
              )
            )
          }
          return of({ ...node.value, loading: false })
        })
      )
      .subscribe((state) => node.next(state))

    this.subscriptions.add(subscription)
    this.nodeMap[key] = node
    return node
  }

  /**
   * 处理 Reaction 逻辑
   */
  private async handleReaction(
    name: keyof T,
    dependencies: Record<string, IFilterState<T>[keyof T]>,
    func: TFilterReaction<any, any>
  ): Promise<IFilterState<T>[keyof T]> {
    const reaction = func(dependencies)
    const resolvedReaction = reaction instanceof Promise ? await reaction : reaction
    const node = this.nodeMap[name]
    return {
      ...(node?.value || {}),
      ...resolvedReaction,
      componentProps: {
        ...(node?.value?.componentProps || {}),
        ...resolvedReaction?.componentProps,
      },
      loading: false,
    } as IFilterState<T>[keyof T]
  }

  private async _init(): Promise<IFilterState<T>> {
    // 初始化 URL 状态
    this.urlState.init(Object.values(this.configMap))

    // 获取初始状态
    const initialStream$ = new RxInitialFilterGroup(this.configMap, this.urlState).stream$
    const initialValues = await firstValueFrom(initialStream$)

    // 初始化每个节点
    Object.keys(this.configMap).forEach((key: keyof T) => this.initializeNode(key, initialValues))

    // 确保所有的字段都已初始化
    const completeNodeMap = Object.keys(this.configMap).reduce((acc, key) => {
      if (!this.nodeMap[key]) {
        const node = this.initializeNode(key as Extract<keyof T, string>, initialValues)
        this.nodeMap = { ...this.nodeMap, [key]: node }
      }
      return this.nodeMap
    }, this.nodeMap)

    this.finalStream$ = combineLatest(
      completeNodeMap as {
        [K in keyof T]: BehaviorSubject<IFilterState<T>[K]>
      }
    ).pipe(
      map((values) => values as unknown as IFilterState<T>),
      distinctUntilChanged((prev, curr) => isEqual(prev, curr))
    )

    this.finalValueStream$ = combineLatest(
      completeNodeMap as {
        [K in keyof T]: BehaviorSubject<IFilterState<T>[K]>
      }
    ).pipe(
      map(
        (states) =>
          Object.entries(states).reduce(
            (acc, [key, state]) => ({
              ...acc,
              [key]: state.value, // 提取每个筛选字段中的value字段
            }),
            {}
          ) as IFilterValue<T>
      ),
      distinctUntilChanged((prev, curr) => isEqual(prev, curr))
    )

    const subscription = this.finalStream$.subscribe((values) => {
      this.urlState.setQueryValues(mapValues(values, (v) => v.value))
    })
    this.subscriptions.add(subscription)

    return initialValues
  }

  /**
   * 初始化筛选组
   */
  async init(): Promise<IFilterState<T>> {
    if (this.loading && this.initPromise) {
      return this.initPromise
    }
    this.loading = true

    this.initPromise = this._init()
    this.initPromise.then(() => {
      // 异步更新 loadin
      this.loading = false
    })
    return this.initPromise
  }

  /**
   * 获取字段配置
   */
  getFilterConfig<K extends keyof T>(key: K): T[K] {
    return this.configMap[key]
  }

  /**
   * 设置字段值
   */
  setFieldState(key: Extract<keyof T, string>, state: Partial<IFilterState<T>[typeof key]>): void {
    const node = this.getFieldNode(key)
    if (!node) {
      console.warn(`Field ${key} does not exist.`)
      return
    }
    node.next({
      ...node.value,
      ...state,
      componentProps: {
        ...(node.value.componentProps || {}),
        ...(state.componentProps || {}),
      },
    })
  }

  /**
   * 获取字段节点
   */
  getFieldNode(
    key: Extract<keyof T, string>
  ): BehaviorSubject<IFilterState<T>[typeof key]> | undefined {
    return this.nodeMap[key]
  }

  /**
   * 清理订阅
   */
  destroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe())
    this.subscriptions.clear()
  }
}

/** 原始 RxFilterGroup 工厂方法 */
export const createRxFilterGroup = <T extends Record<string, TFilterConfig<any, any, any>>>(
  configMap: T,
  options?: TFilterGroupOptions
): RxFilterGroup<T> => new RxFilterGroup(configMap, options)

/** 支持 Array 创建 RxFilterGroup */
export const createRxFilterGroupByArray = <T extends TFilterConfig<any, any, any>[]>(
  configs: T,
  options?: TFilterGroupOptions
): RxFilterGroup<FilterConfigArrayToMap<T>> => {
  const configMap: Record<string, TFilterConfig<any, any, any>> = {}
  for (const config of configs) {
    configMap[config.name] = config
  }
  return new RxFilterGroup(configMap as FilterConfigArrayToMap<T>, options)
}
