import { mapValues } from 'lodash-es'
import { computed, onBeforeUnmount, ref, Ref } from 'vue'
import { filter, debounceTime } from 'rxjs/operators'
import {
  createRxFilterGroupByArray,
  type TRxFilterGroup,
  type IFilterState,
  type TFilterGroupOptions,
  type AnyRxFilterGroup,
  IFilterValue,
} from '@rx-filter/core'
import { TFilterConfig } from './types'

type IGroupState = {
  state: Ref<IFilterState<Record<string, TFilterConfig<any>>> | undefined>
  value: Ref<IFilterValue<Record<string, TFilterConfig<any>>> | undefined>
}

export const getFilterGroup = <T extends TFilterConfig<any>[]>(
  configs: T,
  options?: TFilterGroupOptions
) => {
  const group = createRxFilterGroupByArray(configs, options)

  onBeforeUnmount(() => {
    group.destroy()
  })
  return group
}

// 用于缓存 group 与 state 的映射关系
const groupStateCache = new WeakMap<AnyRxFilterGroup, IGroupState>()

function useGroupState<T extends Record<string, TFilterConfig<any>>>(
  group: TRxFilterGroup<T>
): IGroupState {
  // 检查缓存
  if (groupStateCache.has(group as AnyRxFilterGroup)) {
    return groupStateCache.get(group as AnyRxFilterGroup)!
  }
  const state = ref<IFilterState<T>>()
  const value = ref<IFilterValue<T>>()
  groupStateCache.set(group as AnyRxFilterGroup, { state, value })

  group.init().then((initialState) => {
    if (!group.filterGroupStream || !group.filterGroupValueStream) {
      return {}
    }

    const stateSubscription = group.filterGroupStream
      .pipe(
        filter((v) => Object.values(v).every((item) => !item.loading)),
        debounceTime(400)
      )
      .subscribe((updatedState) => {
        state.value = updatedState
      })

    const valueSubscription = group.filterGroupValueStream.subscribe((updatedValue) => {
      value.value = updatedValue
    })

    onBeforeUnmount(() => {
      stateSubscription.unsubscribe()
      valueSubscription.unsubscribe()
    })

    if (!state.value) {
      state.value = initialState // 初始化状态
      value.value = mapValues(initialState.value, (v) =>
        v?.loading || !v?.visible ? undefined : v.value
      )
    }
  })

  return { state, value }
}

function setFieldNodeState<T extends Record<string, TFilterConfig<any>>>(group: TRxFilterGroup<T>) {
  return (name: Extract<keyof T, string>, state: Partial<IFilterState<T>[typeof name]>) => {
    group.setFieldState(name, state)
  }
}

/**
 * 获取筛选字段状态
 * @param group 筛选项分组 group 实例，可通过 getFilterGroup 方法获取
 * @param name 筛选字段名称，不传则返回所有字段
 * @returns 筛选字段所有状态
 */
export function useFilters<
  T extends Record<string, TFilterConfig<any>>,
  K extends Extract<keyof T, string> | undefined,
>(group: TRxFilterGroup<T>, name?: K | K[]) {
  const { state } = useGroupState(group)

  const filteredState = computed(() => {
    if (!state.value) {
      return {} as { [K in keyof T]: IFilterState<T>[K] }
    }
    if (!name) {
      return state.value
    }

    const names = Array.isArray(name) ? name : [name]
    return Object.fromEntries(
      Object.entries(state.value).filter(([key]) => names.includes(key as K))
    ) as { [K in keyof T]: IFilterState<T>[K] }
  })

  return {
    state: filteredState,
    setFieldState: setFieldNodeState(group),
  }
}

/**
 * 获取筛选字段值
 * @param group 筛选项分组 group 实例，可通过 getFilterGroup 方法获取
 * @param name 筛选字段名称，不传则返回所有字段
 * @returns 筛选字段值
 */
export function useFiltersValue<
  T extends Record<string, TFilterConfig<any>>,
  K extends Extract<keyof T, string> | undefined,
>(group: TRxFilterGroup<T>, name?: K | K[]) {
  const { value } = useGroupState(group)
  const filteredValue = computed(() => {
    if (!value.value) {
      return {} as IFilterValue<T>
    }
    if (!name) {
      return value
    }

    const names = Array.isArray(name) ? name : [name]

    return Object.fromEntries(
      Object.entries(value.value).filter(([key]) => names.includes(key as K))
    ) as { [K in keyof T]: IFilterState<T>[K] }
  })

  return {
    value: filteredValue,
    setFieldState: setFieldNodeState(group),
  }
}

/**
 * 获取筛选字段对应节点
 * @param group 筛选项分组 group 实例，可通过 getFilterGroup 方法获取
 * @param name 筛选字段名称，不传则返回所有字段
 * @returns 筛选字段对应节点
 */
export function useFieldState<
  T extends Record<string, TFilterConfig<any>>,
  K extends Extract<keyof T, string>,
>(group: TRxFilterGroup<T>, name: K) {
  const state = ref<IFilterState<T>[typeof name]>()

  group.init().then((initialState) => {
    if (initialState) {
      const node = group.getFieldNode(name)
      if (node) {
        // 添加空值检查
        const subscription = node.subscribe((v) => {
          state.value = {
            ...v,
          }
        })

        onBeforeUnmount(() => {
          subscription.unsubscribe()
        })
      }
    }
  })

  return state
}
