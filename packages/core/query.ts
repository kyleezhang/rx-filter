import { QueryTypeSchema, TFilterConfig } from './types'
import { z } from 'zod'
import qs from 'qs'

// 基于 QueryTypeSchema 类型转换生成 zod Schema， 方便进行类型校验
function parseSchema(description: QueryTypeSchema): z.ZodTypeAny {
  switch (description.type) {
    case 'number': {
      let schema: z.ZodTypeAny = z.number()
      if (description.nullable) schema = schema.nullable()
      if (description.optional) schema = schema.optional()
      return schema
    }
    case 'string': {
      let schema: z.ZodTypeAny = z.string()
      if (description.nullable) schema = schema.nullable()
      if (description.optional) schema = schema.optional()
      return schema
    }
    case 'boolean': {
      let schema: z.ZodTypeAny = z.boolean()
      if (description.nullable) schema = schema.nullable()
      if (description.optional) schema = schema.optional()
      return schema
    }
    case 'array': {
      return z.array(parseSchema(description.items!))
    }
    case 'object': {
      const properties = Object.entries(description.properties!).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: parseSchema(value),
        }),
        {}
      )
      let schema: z.ZodTypeAny = z.object(properties)
      if (description.nullable) schema = schema.nullable()
      if (description.optional) schema = schema.optional()
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
  }> = []

  constructor() {
    this.queryStr = (location.search || '').substring(1)
    this.hashStr = window.location.hash ?? ''
  }

  private setUrl(queryValue: Record<string, unknown>, hashValue: Record<string, unknown>) {
    const currentQuery = qs.parse(window.location.search, { ignoreQueryPrefix: true })
    const newQuery = { ...currentQuery, ...queryValue }
    const newQueryString = qs.stringify(newQuery, { addQueryPrefix: true })

    const currentHash = qs.parse(window.location.hash.slice(1))
    const newHash = { ...currentHash, ...hashValue }
    const newHashString = qs.stringify(newHash)

    const newUrl = `${window.location.pathname}${newQueryString}#${newHashString}`
    window.history.replaceState({}, '', newUrl)
  }

  init<T extends TFilterConfig<string, any, any, any>[]>(configs: T) {
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
    if (!item) return undefined

    try {
      const value =
        item.mode === 'query'
          ? qs.parse(this.queryStr)[item.key]
          : qs.parse(this.hashStr.substring(1))[item.key]
      if (value === undefined) return undefined
      return item.schema.parse(item.type.type === 'number' ? Number(value) : value)
    } catch (err) {
      console.error('QueryError:', name, err)
      return undefined
    }
  }

  setQueryValues<T extends Record<string, unknown>>(values: T) {
    const queryValue: Record<string, unknown> = {}
    const hashValue: Record<string, unknown> = {}

    Object.entries(values).forEach(([k, v]) => {
      const item = this.queryItems.find((e) => e.key === k)
      if (item?.mode === 'query') {
        queryValue[k] = v
      } else if (item?.mode === 'hash') {
        hashValue[k] = v
      }
    })

    this.setUrl(queryValue, hashValue)
  }
}
