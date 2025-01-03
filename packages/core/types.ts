import { RxFilterGroup } from './group'

/**
 * @cn 筛选字段状态
 * @en Filter field state
 */
export interface TFilterFieldState<P = any, V = any> {
  name: string // 唯一标识
  visible: boolean
  loading: boolean // 标识当前筛选字段是否在加载中
  value: V | undefined // 组件 value
  componentProps: P // 组件参数
}

export interface TFilterGroupOptions {
  /** 接口超时配置 */
  timeout?: number
}

/**
 * @cn 筛选字段 url 状态结构描述
 * @en Filter field url state structure description
 */
export type QueryTypeSchema =
  | { type: 'number'; optional?: boolean; nullable?: boolean } // 基础类型：number
  | { type: 'string'; optional?: boolean; nullable?: boolean } // 基础类型：string
  | { type: 'boolean'; optional?: boolean; nullable?: boolean } // 基础类型：boolean
  | { type: 'array'; items: QueryTypeSchema } // 数组类型
  | {
      type: 'object' // 对象类型
      properties: Record<string, QueryTypeSchema>
      optional?: boolean
      nullable?: boolean
    }

/**
 * @cn 联动响应函数，当 dependencies 状态发生变更时调用接口更新当前字段状态
 * @en Reaction function, when the dependencies state changes, the interface updates the current field state
 */
export type TFilterReaction<V, P> = (
  dependciesValue: Record<string, TFilterFieldState>
) => Partial<TFilterFieldState<V, P>> | Promise<Partial<TFilterFieldState<V, P>>>

/**
 * @cn 筛选项配置
 * @en Filter option configuration
 */
export type TFilterConfig<C, P, V> = {
  /**
   * 筛选项唯一标识
   */
  name: string
  /**
   * 筛选项是否展示，默认为true
   */
  visible?: boolean
  /**
   * 筛选字段对应的展示组件
   */
  component: C
  /**
   * 展示组件对应的组件参数
   */
  componentProps: P
  /**
   * 筛选字段对应 URL 中的 key，默认为筛选配置中的 name
   */
  queryKey?: string
  /**
   * 筛选项同步到URL的方式，默认是 hash 模式
   */
  queryMode?: 'hash' | 'query'
  /**
   * 筛选项同步到 URL 的结构类型，如果没有声明 queryType 则不会同步到URL
   */
  queryType?: QueryTypeSchema
  /**
   * 是否需要将筛选状态同步到浏览器本地，storage 中的 key 是 name 字段
   */
  isSaveStorage?: boolean
  /**
   * 筛选字段初始值
   */
  initialValue?: V
  /**
   * 初始化值获取依赖项
   */
  initialDependcies?: string[]
  /**
   * 初始值计算
   */
  initialQuery?: (
    dependciesValue?: Record<string, TFilterFieldState>
  ) => Partial<TFilterFieldState<V, P>> | Promise<Partial<TFilterFieldState<V, P>>> // 获取组件初始状态
} & (
  | {
      /**
       * 联动逻辑依赖项
       */
      dependencies: string[]
      /**
       * 联动逻辑
       */
      reaction: TFilterReaction<V, P> | TFilterReaction<V, P>[]
    }
  | {
      dependencies?: never
      reaction?: never
    }
)

export type IFilterState<T extends Record<string, TFilterConfig<any, any, any>>> = {
  [K in keyof T]: T[K] extends TFilterConfig<any, infer P, infer V>
    ? TFilterFieldState<P, V>
    : never
}

export type IFilterValue<T extends Record<string, TFilterConfig<any, any, any>>> = {
  [K in keyof T]: T[K] extends TFilterConfig<any, any, infer V> ? V : never
}

/** 任意 AnyRxFilterGroup => 作为 extends 目标好用 */
export type AnyRxFilterGroup = RxFilterGroup<Record<string, TFilterConfig<any, any, any>>>

// ========== type utils ==========
export type GetGroupConfig<G> = G extends RxFilterGroup<infer ConfigMap> ? ConfigMap : undefined

export type GetConfig<K extends string, T extends TFilterConfig<any, any, any>[]> = T extends [
  infer F extends TFilterConfig<any, any, any>,
  ...infer U extends TFilterConfig<any, any, any>[],
]
  ? K extends F['name']
    ? F
    : GetConfig<K, U>
  : never

export type FilterConfigArrayToMap<T extends TFilterConfig<any, any, any>[]> = {
  [K in T[number]['name']]: GetConfig<K, T>
}
