<template>
  <div class="flex gap-2 w-full max-w-[320px] cabin-sketch-regular relative z-50">

    <div class="flex-1">
      <button
        :id="triggerId + '-day-trigger'"
        type="button"
        class="w-full h-14 bg-white/80 rounded-2xl border-2 transition-all flex items-center justify-center text-xl font-black focus:outline-none"
        :class="activeDropdown === 'day' ? 'border-secondary shadow-md text-secondary' : 'border-black/10 text-black/70 hover:border-black/30'"
      >
        {{ day || 'DD' }}
      </button>

      <ion-popover
        :trigger="triggerId + '-day-trigger'"
        dismiss-on-select
        @willPresent="onWillPresent('day')"
        @didDismiss="activeDropdown = null"
        class="date-picker-popover"
      >
        <div ref="dayContainer" class="max-h-48 overflow-y-auto py-2 bg-white">
          <button
            v-for="d in daysInMonth" :key="d"
            type="button"
            @click="selectDate('day', padZero(d))"
            class="w-full text-center py-2 text-lg font-black hover:bg-secondary/10 transition-colors"
            :class="day === padZero(d) ? 'text-secondary bg-secondary/5' : 'text-black/80'"
          >
            {{ padZero(d) }}
          </button>
        </div>
      </ion-popover>
    </div>

    <div class="flex-[1.5]">
      <button
        :id="triggerId + '-month-trigger'"
        type="button"
        class="w-full h-14 bg-white/80 rounded-2xl border-2 transition-all flex items-center justify-center text-xl font-black focus:outline-none"
        :class="activeDropdown === 'month' ? 'border-secondary shadow-md text-secondary' : 'border-black/10 text-black/70 hover:border-black/30'"
      >
        {{ month ? monthNames[parseInt(month) - 1] : 'MM' }}
      </button>

      <ion-popover
        :trigger="triggerId + '-month-trigger'"
        dismiss-on-select
        @willPresent="onWillPresent('month')"
        @didDismiss="activeDropdown = null"
        class="date-picker-popover"
      >
        <div ref="monthContainer" class="max-h-48 overflow-y-auto py-2 bg-white">
          <button
            v-for="(m, index) in monthNames" :key="m"
            type="button"
            @click="selectDate('month', padZero(index + 1))"
            class="w-full text-center py-2 text-lg font-black hover:bg-secondary/10 transition-colors"
            :class="month === padZero(index + 1) ? 'text-secondary bg-secondary/5' : 'text-black/80'"
          >
            {{ m }}
          </button>
        </div>
      </ion-popover>
    </div>

    <div class="flex-[1.5]">
      <button
        :id="triggerId + '-year-trigger'"
        type="button"
        class="w-full h-14 bg-white/80 rounded-2xl border-2 transition-all flex items-center justify-center text-xl font-black focus:outline-none"
        :class="activeDropdown === 'year' ? 'border-secondary shadow-md text-secondary' : 'border-black/10 text-black/70 hover:border-black/30'"
      >
        {{ year || 'YYYY' }}
      </button>

      <ion-popover
        :trigger="triggerId + '-year-trigger'"
        dismiss-on-select
        @willPresent="onWillPresent('year')"
        @didDismiss="activeDropdown = null"
        class="date-picker-popover"
      >
        <div ref="yearContainer" class="max-h-48 overflow-y-auto py-2 bg-white">
          <button
            v-for="y in yearsList" :key="y"
            type="button"
            @click="selectDate('year', y.toString())"
            class="w-full text-center py-2 text-lg font-black hover:bg-secondary/10 transition-colors"
            :class="year === y.toString() ? 'text-secondary bg-secondary/5' : 'text-black/80'"
          >
            {{ y }}
          </button>
        </div>
      </ion-popover>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { IonPopover } from '@ionic/vue';

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits(['update:modelValue']);

const triggerId = `date-picker-${Math.random().toString(36).slice(2, 9)}`;

const day = ref("");
const month = ref("");
const year = ref("");
const activeDropdown = ref<'day' | 'month' | 'year' | null>(null);

const dayContainer = ref<HTMLDivElement | null>(null);
const monthContainer = ref<HTMLDivElement | null>(null);
const yearContainer = ref<HTMLDivElement | null>(null);

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yearsList = computed(() => {
  const currentYear = new Date().getFullYear();
  const list = [];
  for (let i = currentYear; i >= 1910; i--) list.push(i);
  return list;
});

const daysInMonth = computed(() => {
  const y = year.value ? parseInt(year.value) : new Date().getFullYear();
  const m = month.value ? parseInt(month.value) : 1;
  return new Date(y, m, 0).getDate();
});

const padZero = (num: number) => (num < 10 ? `0${num}` : `${num}`);

// Instant, pre-render scrolling calculator
const onWillPresent = async (type: 'day' | 'month' | 'year') => {
  activeDropdown.value = type;
  await nextTick();

  let container: HTMLDivElement | null = null;
  let activeIndex = -1;

  // Approximate item height (padding + text height) to center perfectly
  const itemHeight = 44;
  const containerHeight = 192; // equivalent to max-h-48 (12rem)

  if (type === 'day' && day.value) {
    container = dayContainer.value;
    activeIndex = parseInt(day.value) - 1;
  } else if (type === 'month' && month.value) {
    container = monthContainer.value;
    activeIndex = parseInt(month.value) - 1;
  } else if (type === 'year' && year.value) {
    container = yearContainer.value;
    activeIndex = yearsList.value.indexOf(parseInt(year.value));
  }

  if (container && activeIndex >= 0) {
    // Math logic to position the selected row perfectly center frame
    const scrollOffset = (activeIndex * itemHeight) - (containerHeight / 2) + (itemHeight / 2);
    container.scrollTop = Math.max(0, scrollOffset);
  }
};

const selectDate = (type: 'day' | 'month' | 'year', value: string) => {
  if (type === 'day') day.value = value;
  if (type === 'month') month.value = value;
  if (type === 'year') year.value = value;

  if (day.value && parseInt(day.value) > daysInMonth.value) {
    day.value = padZero(daysInMonth.value);
  }

  updateModel();
};

const updateModel = () => {
  if (day.value && month.value && year.value) {
    emit('update:modelValue', `${year.value}-${month.value}-${day.value}`);
  } else {
    emit('update:modelValue', undefined);
  }
};

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    const parts = newVal.split('-');
    if (parts.length >= 3) {
      year.value = parts[0];
      month.value = parts[1];
      const rawDay = parts[2];
      day.value = rawDay.substring(0, 2);
      return;
    }
  }
  day.value = "";
  month.value = "";
  year.value = "";
}, { immediate: true });
</script>

<style scoped>
.date-picker-popover {
  --background: #ffffff;
  --box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  --border-radius: 16px;
  --width: 105px;
}

div::-webkit-scrollbar {
  display: none;
}
div {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>