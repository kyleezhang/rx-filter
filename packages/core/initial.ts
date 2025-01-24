/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { BehaviorSubject, Observable, combineLatest, from, of, forkJoin } from 'rxjs'
import { switchMap, timeout, catchError, take, debounceTime } from 'rxjs/operators'
import { TFilterConfig, IFilterState } from './types'
import { UrlStateGroup } from './query'
import { merge } from 'lodash-es'

// 请求超时配置
const TIME_STAMP = 2000

export class RxInitialFilterGroup<T extends Record<string, TFilterConfig<string, any, any, any>>> {
  private configMap: T
  private nodeMap: Partial<{ [K in Extract<keyof T, string>]: Observable<IFilterState<T>[K]> }> = {}
  private initialStram$: Observable<IFilterState<T>>
  private urlState: UrlStateGroup

  constructor(configMap: T, urlState: UrlStateGroup) {
    this.configMap = configMap
    this.urlState = urlState
    const nodeMapEntries = Object.keys(configMap).reduce(
      (acc, key) => {
        // 将 key 明确为字符串类型后再强制转换为合法的 keyof T 类型
        acc[key as Extract<keyof T, string>] = this.initialFieldState(
          key as Extract<keyof T, string>
        )
        return acc
      },
      {} as { [K in Extract<keyof T, string>]: Observable<IFilterState<T>[K]> }
    )
    this.initialStram$ = forkJoin(nodeMapEntries) as Observable<IFilterState<T>>
  }

  get stream$() {
    return this.initialStram$
  }

  private getInitialValue(key: Extract<keyof T, string>) {
    const config = this.configMap[key]
    const queryValue = this.urlState.getQueryValue(key as Extract<keyof T, string>)
    const storageValue = config.isSaveStorage
      ? JSON.parse(localStorage.getItem(config.name) || 'null')
      : undefined
    return queryValue || storageValue
  }

  private resolveDependencies(
    key: Extract<keyof T, string>
  ): Record<string, Observable<IFilterState<T>[typeof key]>> {
    const config = this.configMap[key]
    const dependencies = (config.initialDependcies ?? []) as Extract<keyof T, string>[]
    if (dependencies.length === 0) {
      return {} as Record<string, Observable<IFilterState<T>[typeof key]>>
    }
    return dependencies.reduce<
      Record<Extract<keyof T, string>, Observable<IFilterState<T>[typeof key]>>
    >(
      (prev, cur) => ({
        ...prev,
        [cur]: this.nodeMap[cur] || this.initialFieldState(cur),
      }),
      {} as Record<Extract<keyof T, string>, Observable<IFilterState<T>[typeof key]>>
    )
  }

  private createAsyncNode(
    key: Extract<keyof T, string>,
    fieldState: IFilterState<T>[typeof key],
    dependenciesValue?: Record<string, IFilterState<T>[typeof key]>
  ): Observable<IFilterState<T>[typeof key]> {
    const config = this.configMap[key]
    return from(
      new Promise<IFilterState<T>[typeof key]>((resolve) => {
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

  private initialFieldState(
    key: Extract<keyof T, string>
  ): Observable<IFilterState<T>[typeof key]> {
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
    } as unknown as IFilterState<T>[typeof key]

    if (!config.initialQuery) {
      const subject = new BehaviorSubject(fieldState).pipe(take(1))
      this.nodeMap[key] = subject
      return subject
    }
    // 收集依赖
    const dependenciesNode = this.resolveDependencies(key)
    // 创建异步节点
    const node =
      Object.keys(dependenciesNode).length > 0
        ? combineLatest(dependenciesNode).pipe(
            debounceTime(100),
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
