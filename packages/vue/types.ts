import { Component } from 'vue'
import {
  TFilterConfig,
  TFilterFieldState as TFilterBaseState,
  IFilterState,
  IFilterValue,
} from '@rx-filter/core'

export type { QueryTypeSchema } from '@rx-filter/core'

/**
 * 自动推导组件的 props 类型
 */
export type ComponentProps<C> =
  C extends Component<infer P>
    ? P extends { $props: any }
      ? P['$props']
      : Record<string, any>
    : Record<string, any>

/**
 * 自动推导组件的 value 类型
 */
export type ComponentValue<C> = ComponentProps<C> extends { value?: infer V } ? V : any

/**
 * 自动推导组件的 slots 类型
 */
export type ComponentSlots<C> = C extends new (...args: any[]) => infer Instance
  ? Instance extends { $slots: infer Slots }
    ? {
        [K in keyof Slots]: Slots[K] extends (props: infer Props) => any ? Props : never
      }
    : never
  : never

/**
 * vue 版本筛选项配置，从传入组件中提取 props 和 value 类型
 */
export type TFilterConfigVue<K extends string, C extends Component> = TFilterConfig<
  K,
  C,
  ComponentProps<C>,
  ComponentValue<C>
> & {
  /**
   * 插槽配置：包括默认的 `comprefix` 和 `comsuffix` 插槽
   * 以及动态推导的组件插槽
   */
  slots?: {
    comprefix?: (props?: any) => unknown
    comsuffix?: (props?: any) => unknown
  } & {
    [K in keyof ComponentSlots<C>]?: (props: ComponentSlots<C>[K]) => unknown
  }
}

/**
 * vue 版本筛选项状态，从传入组件中提取 props 和 value 类型
 */
export interface TFilterFieldStateVue<C extends Component>
  extends TFilterBaseState<ComponentProps<C>, ComponentValue<C>> {
  component: C
}

// ========== type utils ==========
export type IUseFiltersState<
  T extends Record<string, TFilterConfigVue<string, any>>,
  K extends Extract<keyof T, string> | undefined,
> = K extends undefined
  ? IFilterState<T>
  : K extends Extract<keyof T, string>
    ? Pick<IFilterState<T>, K>
    : never

export type IUseFiltersValue<
  T extends Record<string, TFilterConfigVue<string, any>>,
  K extends Extract<keyof T, string> | undefined,
> = K extends undefined
  ? IFilterValue<T>
  : K extends Extract<keyof T, string>
    ? Pick<IFilterValue<T>, K>
    : never
