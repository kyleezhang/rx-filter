import { QueryTypeSchema, TFilterConfig } from './types'
import { pickBy } from 'lodash-es'
import { z } from 'zod'
import qs from 'qs'

// 基于 QueryTypeSchema 类型转换生成 zod Schema， 方便进行类型校验
function parseSchema(description: QueryTypeSchema): z.ZodTypeAny {
  switch (description.type) {
    case 'number': {
      let schema: z.ZodTypeAny = z.number()
      if (description.nullable) {
        schema = schema.nullable()
      }
      if (description.optional) {
        schema = schema.optional()
      }
      return schema
    }
    case 'string': {
      let schema: z.ZodTypeAny = z.string()
      if (description.nullable) {
        schema = schema.nullable()
      }
      if (description.optional) {
        schema = schema.optional()
      }
      return schema
    }
    case 'boolean': {
      let schema: z.ZodTypeAny = z.boolean()
      if (description.nullable) {
        schema = schema.nullable()
      }
      if (description.optional) {
        schema = schema.optional()
      }
      return schema
    }
    case 'array': {
      return z.array(parseSchema(description.items))
    }
    case 'object': {
      const properties = Object.entries(description.properties).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: parseSchema(value),
        }),
        {}
      )
      let schema: z.ZodTypeAny = z.object(properties)
      if (description.nullable) {
        schema = schema.nullable()
      }
      if (description.optional) {
        schema = schema.optional()
      }
      return schema
    }
    default:
      throw new Error(`QueryError: Unsupported type: ${(description as any).type}`)
  }
}

export class UrlStateGroup {
  private queryStr = ''
  private hashStr = ''
  private queryItems: Array<{
    key: string
    mode: 'hash' | 'query'
    type: QueryTypeSchema
    schema: z.ZodTypeAny
  }> = [] // 保存页面内所有筛选项的query配置信息

  constructor() {
    this.queryStr = (location.search || '').substring(1)
    this.hashStr = window.location.hash ?? ''
  }

  private setQuery(queryValue: Record<string, unknown>) {
    const currentQuery = qs.parse(window.location.search, { ignoreQueryPrefix: true })
    const newQuery = {
      ...currentQuery,
      ...queryValue,
    }
    // 序列化为新的 query string
    const newQueryString = qs.stringify(newQuery, { addQueryPrefix: true }) // 自动添加 `?`

    // 更新 URL
    const newUrl = `${window.location.pathname}${newQueryString}${window.location.hash}`
    window.history.replaceState({}, '', newUrl)
  }

  private setHash(hashValue: Record<string, unknown>) {
    const currentHash = qs.parse(window.location.hash.slice(1))
    const newHash = {
      ...currentHash,
      ...hashValue,
    }
    const newHashString = qs.stringify(newHash)
    window.history.replaceState({}, '', `${location.href.split('#')[0]}#${newHashString}`)
  }

  init<T extends TFilterConfig<any, any, any>[]>(configs: T) {
    this.queryItems = configs
      .filter((config) => config.queryType)
      .map((config) => ({
        key: config.queryKey || config.name,
        mode: config.queryMode || 'hash',
        type: config.queryType!,
        schema: parseSchema(config.queryType!),
      }))
  }

  getQueryValue(name: string) {
    this.queryStr = (window.location.search || '').substring(1)
    this.hashStr = window.location.hash ?? ''
    const item = this.queryItems.find((e) => e.key === name)
    if (!item) {
      return undefined
    }
    try {
      if (item?.mode === 'hash') {
        return item.schema.parse(qs.parse(this.queryStr)[item.key])
      } else {
        return item?.schema.parse(qs.parse(this.hashStr.substring(1))[item.key])
      }
    } catch (err) {
      console.error('QueryError:', name, err)
    }
  }

  setQueryValues<T extends Record<string, unknown>>(values: T) {
    const queryValue = pickBy(values, (v, k) => {
      const item = this.queryItems.find((e) => e.key === k)
      return item?.mode === 'query'
    })
    this.setQuery(queryValue)

    const hashValue = pickBy(values, (v, k) => {
      const item = this.queryItems.find((e) => e.key === k)
      return item?.mode === 'hash'
    })
    this.setHash(hashValue)
  }
}
