import { Component } from 'vue'
import {
  TFilterConfig as TFilterBaseConfig,
  TFilterFieldState as TFilterBaseState,
} from '@rx-filter/core'

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
 * vue 版本筛选项配置，从传入组件中提取 props 和 value 类型
 */
export type TFilterConfig<C extends Component> = TFilterBaseConfig<
  C,
  ComponentProps<C>,
  ComponentValue<C>
>

/**
 * vue 版本筛选项状态，从传入组件中提取 props 和 value 类型
 */
export type TFilterFieldState<C extends Component> = TFilterBaseState<
  ComponentProps<C>,
  ComponentValue<C>
>
