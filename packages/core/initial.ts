import { BehaviorSubject, Observable, combineLatest, from, of, forkJoin } from 'rxjs'
import { switchMap, timeout, catchError, take } from 'rxjs/operators'
import { TFilterConfig, TFilterFieldState, IFilterState } from './types'
import { UrlStateGroup } from './query'
import { merge } from 'lodash-es'

// 请求超时配置
const TIME_STAMP = 2000

export class RxInitialFilterGroup<T extends Record<string, TFilterConfig<any, any, any>>> {
  private configMap: T
  private nodeMap: Partial<{ [K in keyof T]: Observable<IFilterState<T>[K]> }> = {}
  private initialStram$: Observable<IFilterState<T>>
  private urlState: UrlStateGroup

  constructor(configMap: T, urlState: UrlStateGroup) {
    this.configMap = configMap
    this.urlState = urlState
    const nodeMapEntries = Object.entries(configMap).reduce<{
      [K in keyof T]: Observable<IFilterState<T>[K]>
    }>(
      (acc, [key]) => {
        acc[key as keyof T] = this.initialFieldState(key as Extract<keyof T, string>)
        return acc
      },
      {} as { [K in keyof T]: Observable<IFilterState<T>[K]> }
    )
    this.initialStram$ = forkJoin(nodeMapEntries) as Observable<IFilterState<T>>
  }

  get stream$() {
    return this.initialStram$
  }

  private getInitialValue(key: keyof T) {
    const config = this.configMap[key]
    const queryValue = this.urlState.getQueryValue(key as Extract<keyof T, string>)
    const storageValue = config.isSaveStorage
      ? JSON.parse(localStorage.getItem(config.name) || 'null')
      : undefined
    return queryValue || storageValue
  }

  private resolveDependencies(
    key: keyof T
  ): Record<string, Observable<IFilterState<T>[typeof key]>> {
    const config = this.configMap[key]
    const dependencies = config.initialDependcies ?? []
    if (dependencies.length === 0) {
      return {} as Record<string, Observable<IFilterState<T>[typeof key]>>
    }
    return dependencies.reduce<Record<string, Observable<IFilterState<T>[typeof key]>>>(
      (prev, cur) => ({
        ...prev,
        [cur]: this.nodeMap[cur] || this.initialFieldState(cur),
      }),
      {}
    )
  }

  private createAsyncNode(
    key: keyof T,
    fieldState: IFilterState<T>[typeof key],
    dependenciesValue?: Record<string, IFilterState<T>[typeof key]>
  ) {
    const config = this.configMap[key]
    return from(
      new Promise<TFilterFieldState>((resolve) => {
        const result = config.initialQuery && config.initialQuery(dependenciesValue)
        if (result instanceof Promise) {
          result.then((res) => resolve(merge(fieldState, res)))
        } else {
          resolve(merge(fieldState, result))
        }
      })
    ).pipe(
      timeout(TIME_STAMP),
      catchError(() => {
        console.error('Initial Value request timeout')
        return of(merge(fieldState, { value: config.initialValue }))
      })
    )
  }

  private initialFieldState(key: keyof T): Observable<IFilterState<T>[typeof key]> {
    if (this.nodeMap[key]) {
      return this.nodeMap[key]
    }
    const config = this.configMap[key]
    const value = this.getInitialValue(key)
    const fieldState = {
      name: key,
      visible: config.visible ?? true,
      loading: false,
      value: value ?? config.initialValue,
      componentProps: config.componentProps,
    } as IFilterState<T>[typeof key]

    // 如果从 url 或 storage 获取到 value 或者没有异步查询，则立即返回同步节点
    if (value || !config.initialQuery) {
      const subject = new BehaviorSubject(fieldState)
      this.nodeMap[key] = subject
      return subject
    }
    // 收集依赖
    const dependenciesNode = this.resolveDependencies(key)
    // 创建异步节点
    const node =
      Object.keys(dependenciesNode).length > 0
        ? combineLatest(dependenciesNode).pipe(
            switchMap((dependenciesValue) =>
              this.createAsyncNode(key, fieldState, dependenciesValue)
            ),
            take(1)
          )
        : this.createAsyncNode(key, fieldState)
    this.nodeMap[key] = node

    return node
  }
}
