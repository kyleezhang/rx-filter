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
  tap,
} from 'rxjs'
import {
  skip,
  distinctUntilChanged,
  map,
  switchMap,
  mergeMap,
  debounceTime,
  filter,
} from 'rxjs/operators'
import {
  TFilterConfig,
  TFilterGroupOptions,
  TFilterReaction,
  IFilterState,
  IFilterValue,
  FilterConfigArrayToMap,
} from './types'
import { UrlStateGroup } from './query'
import { RxInitialFilterGroup } from './initial'
import { mapValues, isEqual, debounce } from 'lodash-es'

export class RxFilterGroup<T extends Record<string, TFilterConfig<string, any, any, any>>> {
  private configMap: T
  private nodeMap: Partial<{
    [K in Extract<keyof T, string>]: BehaviorSubject<IFilterState<T>[K]>
  }> = {}
  private urlState: UrlStateGroup
  private finalStream$: Observable<IFilterState<T>> | undefined
  private finalValueStream$: Observable<IFilterValue<T>> | undefined
  private initPromise: Promise<Awaited<ReturnType<RxFilterGroup<any>['init']>>> | undefined
  private subscriptions: Set<ReturnType<Observable<any>['subscribe']>> = new Set()
  private timeout = 2000 // 接口超时配置

  /** 状态是否初始化完成 */
  loading = false
  /** 筛选项变更行为上报方法 */
  sendTeaEvent: TFilterGroupOptions['teaEvent']

  constructor(configMap: T, options?: TFilterGroupOptions) {
    this.configMap = configMap
    this.urlState = new UrlStateGroup()
    this.timeout = options?.timeout ?? this.timeout
    this.sendTeaEvent = options?.teaEvent
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
  private initializeNode(key: Extract<keyof T, string>, initialValueMap: IFilterState<T>) {
    if (this.nodeMap?.[key]) {
      return this.nodeMap[key]
    }

    const config = this.configMap[key]
    const initialValue = initialValueMap[key]

    // 无依赖的基础节点
    if (!config.dependencies?.length) {
      const initialState: IFilterState<T>[Extract<keyof T, string>] = {
        name: config.name,
        visible: initialValue?.visible ?? config.visible ?? true,
        loading: false,
        value: initialValue?.value,
        componentProps: initialValue?.componentProps,
      } as IFilterState<T>[Extract<keyof T, string>]
      const node = new BehaviorSubject<IFilterState<T>[Extract<keyof T, string>]>(initialState)
      this.nodeMap[key] = node
      return node
    }

    // 收集依赖
    const dependencies = config.dependencies.reduce(
      (acc, dep) => {
        acc[dep] = this.initializeNode(dep as Extract<keyof T, string>, initialValueMap)!
        return acc
      },
      {} as Record<string, BehaviorSubject<IFilterState<T>[Extract<keyof T, string>]>>
    )

    return this.createAsyncNode(key, initialValueMap, dependencies)
  }

  private createAsyncNode(
    key: Extract<keyof T, string>,
    initialValueMap: IFilterState<T>,
    dependencies: Record<string, BehaviorSubject<IFilterState<T>[Extract<keyof T, string>]>>
  ): BehaviorSubject<IFilterState<T>[Extract<keyof T, string>]> {
    const initialValue = initialValueMap[key]
    const config = this.configMap[key]
    const node = new BehaviorSubject<IFilterState<T>[Extract<keyof T, string>]>(initialValue)

    const subscription = combineLatest(dependencies)
      .pipe(
        skip(1),
        distinctUntilChanged((prev, curr) => isEqual(prev, curr)),
        switchMap((depValues) => {
          if (Object.values(depValues).some((v) => v.loading)) {
            return of({ ...node.value, loading: true })
          }
          if (Array.isArray(config.reaction)) {
            from(config.reaction)
              .pipe(
                mergeMap((reaction) =>
                  from(
                    this.handleReaction(key, depValues, reaction) ??
                      Promise.resolve({ ...node.value, loading: false })
                  )
                )
              )
              .subscribe((value) => {
                node.next(value)
              })
          }
          if (typeof config.reaction === 'function') {
            return concat(
              of({ ...node.value, loading: true }),
              from(
                this.handleReaction(key, depValues, config.reaction) ??
                  Promise.resolve({
                    ...node.value,
                    loading: false,
                  })
              ).pipe(
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
  private handleReaction = debounce(
    async (
      name: Extract<keyof T, string>,
      dependencies: Record<string, IFilterState<T>[Extract<keyof T, string>]>,
      func: TFilterReaction<any, any>
    ): Promise<IFilterState<T>[Extract<keyof T, string>]> => {
      const reaction = func(dependencies)
      const resolvedReaction = await reaction
      const node = this.nodeMap[name]
      return {
        ...(node?.value || {}),
        ...resolvedReaction,
        componentProps: {
          ...(node?.value?.componentProps || {}),
          ...resolvedReaction?.componentProps,
        },
        loading: false,
      } as IFilterState<T>[Extract<keyof T, string>]
    },
    150 // debounce delay in milliseconds
  )

  private async _init(): Promise<IFilterState<T>> {
    // 初始化 URL 状态
    this.urlState.init(Object.values(this.configMap))

    // 获取初始状态
    const initialStream$ = new RxInitialFilterGroup(this.configMap, this.urlState).stream$
    const initialValues = await firstValueFrom(initialStream$)

    this.sendTeaEvent?.('rx_filter_initialized', {
      value: initialValues,
      path: window.location.pathname,
    })

    // 初始化每个节点
    Object.keys(this.configMap).forEach((key) =>
      this.initializeNode(key as Extract<keyof T, string>, initialValues)
    )

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
        [K in Extract<keyof T, string>]: BehaviorSubject<IFilterState<T>[K]>
      }
    ).pipe(
      skip(1),
      map((values) => values as unknown as IFilterState<T>),
      filter((values) => Object.values(values).every((v) => !v.loading)),
      distinctUntilChanged((prev, curr) => isEqual(prev, curr)),
      debounceTime(300),
      tap((values) => {
        this.sendTeaEvent?.('rx_filter_state_change', {
          value: values,
          path: window.location.pathname,
        })
      })
    )

    this.finalValueStream$ = combineLatest(
      completeNodeMap as {
        [K in Extract<keyof T, string>]: BehaviorSubject<IFilterState<T>[K]>
      }
    ).pipe(
      filter((values) => Object.values(values).every((v) => !v.loading)),
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
      distinctUntilChanged((prev, curr) => isEqual(prev, curr)),
      debounceTime(300),
      tap((values) => {
        this.sendTeaEvent?.('rx_filter_values_change', {
          value: values,
          path: window.location.pathname,
        })
      })
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
      // 异步更新 loading
      this.loading = false
    })
    return this.initPromise
  }

  /**
   * 获取字段配置
   */
  getFilterConfig<K extends Extract<keyof T, string>>(key: K): T[K] {
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
export const createRxFilterGroup = <T extends Record<string, TFilterConfig<string, any, any, any>>>(
  configMap: T,
  options?: TFilterGroupOptions
): RxFilterGroup<T> => new RxFilterGroup(configMap, options)

/** 支持 Array 创建 RxFilterGroup */
export const createRxFilterGroupByArray = <T extends TFilterConfig<string, any, any, any>[]>(
  configs: T,
  options?: TFilterGroupOptions
): RxFilterGroup<FilterConfigArrayToMap<T>> => {
  const configMap: Record<string, TFilterConfig<string, any, any, any>> = {}
  for (const config of configs) {
    configMap[config.name] = config
  }
  return new RxFilterGroup(configMap as FilterConfigArrayToMap<T>, options)
}
