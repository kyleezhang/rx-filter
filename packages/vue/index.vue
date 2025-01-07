<template>
  <div v-if="visible" :class="['rx-filter-field', extraClass ]">
    <slot name="prefix"></slot>
    <component :key="name" :is="comp" v-bind="{ ...attrs, ...compProps }" :loading="isLoading" :value="fieldValue" v-on="on" @change="onChange" />
    <slot name="suffix"></slot>
  </div>
</template>

<script setup lang='ts'>
import { defineOptions, computed, toRefs, useAttrs } from 'vue';
import { useFieldState } from './hooks'
import { TFilterConfig } from './types'
import { RxFilterGroup } from '@rx-filter/core'

defineOptions({
  name: 'RxFilterComponent',
})

const props = withDefaults(
  defineProps<{
    name: string,
    group: RxFilterGroup<Record<string, TFilterConfig<any>>>,
    extraClass?: string
  }>(),
  {},
)

const { name, group } = toRefs(props)

const emits = defineEmits<{
  (e: 'change', v: any): void,
  // 转发注入的动态组件事件
  (e: string, ...v: any[]): void
}>()

const attrs = useAttrs()
// 处理转发的事件：筛选以 "on" 开头的事件
const on = Object.fromEntries(
  Object.entries(attrs).filter(([key]) => key.startsWith('on') && key !== 'onChange')
);
// 转发事件
Object.entries(on).forEach(([key, handler]) => {
  const eventName = key.slice(2).toLowerCase(); // 处理事件名
  emits(eventName, handler); // 转发给父组件
});

const state = useFieldState(group.value, name.value)
const comp = computed(() => group.value.getFilterConfig(name.value).component)
const compProps = computed(() => state.value?.componentProps)
const fieldValue = computed(() => state.value?.value)
const visible = computed(() => state.value?.visible)
const isLoading = computed(() => state.value?.loading)
const onChange = (val: any) => {
  group.value.setFieldState(name.value, { value: val })
  emits('change', val)
}
</script>
