/* eslint-disable @typescript-eslint/consistent-type-assertions */
import { pick, mapValues } from 'lodash-es'
import { computed, ComputedRef, onBeforeUnmount, ref } from 'vue'
import { filter, debounceTime } from 'rxjs/operators'
import {
  createRxFilterGroupByArray,
  RxFilterGroup,
  type IFilterState,
  type TFilterGroupOptions,
  IFilterValue,
} from '@rx-filter/core'
import { type TFilterConfigVue, type IUseFiltersState, type IUseFiltersValue } from './types'

export const getFilterGroup = <T extends TFilterConfigVue<string, any>[]>(
  configs: T,
  options?: TFilterGroupOptions
) => {
  const group = createRxFilterGroupByArray(configs, options)

  onBeforeUnmount(() => {
    group.destroy()
  })
  return group
}

function setFieldNodeState<T extends Record<string, TFilterConfigVue<string, any>>>(
  group: RxFilterGroup<T>
) {
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
  T extends Record<string, TFilterConfigVue<string, any>>,
  K extends Extract<keyof T, string> | undefined,
>(
  group: RxFilterGroup<T>,
  name?: K | K[]
): {
  state: ComputedRef<IUseFiltersState<T, K> | undefined>
  setFieldState: (
    name: Extract<keyof T, string>,
    state: Partial<IFilterState<T>[typeof name]>
  ) => void
} {
  const state = ref<IFilterState<T>>()

  group.init().then((initialState) => {
    if (!group.filterGroupStream) {
      state.value = initialState
    } else {
      group.filterGroupStream
        .pipe(
          filter((v) => Object.values(v).every((item) => !item.loading)),
          debounceTime(200)
        )
        .subscribe((v) => {
          state.value = v
        })
    }
  })

  const filteredState = computed(() => {
    if (!name) {
      return state.value as IUseFiltersState<T, K>
    }

    const names = Array.isArray(name) ? name : [name]
    return pick(state.value, names as Extract<keyof T, string>[]) as IUseFiltersState<T, K>
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
  T extends Record<string, TFilterConfigVue<string, any>>,
  K extends Extract<keyof T, string> | undefined,
>(
  group: RxFilterGroup<T>,
  name?: K | K[]
): {
  values: ComputedRef<IUseFiltersValue<T, K> | undefined>
  setFieldState: (
    name: Extract<keyof T, string>,
    state: Partial<IFilterState<T>[typeof name]>
  ) => void
} {
  const values = ref<IFilterValue<T>>()
  group.init().then((v) => {
    if (!group.filterGroupValueStream) {
      values.value = mapValues(v, (item) => item.value) as IFilterValue<T>
    } else {
      group.filterGroupValueStream.subscribe((v) => {
        values.value = v
      })
    }
  })

  const filteredValue = computed(() => {
    if (!name) {
      return values.value as IUseFiltersValue<T, K>
    }

    const names = Array.isArray(name) ? name : [name]

    return pick(values.value, names as Extract<keyof T, string>[]) as IUseFiltersValue<T, K>
  })

  return {
    values: filteredValue,
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
  T extends Record<string, TFilterConfigVue<string, any>>,
  K extends Extract<keyof T, string>,
>(group: RxFilterGroup<T>, name: K) {
  const state = ref<IFilterState<T>[K]>()

  group.init().then((initialState) => {
    if (initialState) {
      const node = group.getFieldNode(name)
      if (node) {
        // 添加空值检查
        const subscription = node.subscribe((v) => {
          state.value = {
            ...v,
          } as unknown as IFilterState<T>[K]
        })

        onBeforeUnmount(() => {
          subscription.unsubscribe()
        })
      }
    }
  })

  return state
}
