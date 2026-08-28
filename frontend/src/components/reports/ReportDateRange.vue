<script setup lang="ts">
import { ref, watch } from "vue";
import { VueDatePicker, type PresetDate } from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import { endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks, subYears } from "date-fns";

export type DateRange = { startDate: string; endDate: string };
const props = defineProps<{ modelValue: DateRange }>();
const emit = defineEmits<{ "update:modelValue": [value: DateRange]; previous: []; next: [] }>();
const dates = ref<Date[]>([parseISO(props.modelValue.startDate), parseISO(props.modelValue.endDate)]);
function updateDates(value: Date[]) {
  if (value?.length !== 2 || !value[0] || !value[1]) return;
  dates.value = value;
  const startDate = format(value[0], "yyyy-MM-dd");
  const endDate = format(value[1], "yyyy-MM-dd");
  if (startDate !== props.modelValue.startDate || endDate !== props.modelValue.endDate) emit("update:modelValue", { startDate, endDate });
}
watch(() => [props.modelValue.startDate, props.modelValue.endDate], ([startDate, endDate]) => {
  if (format(dates.value[0], "yyyy-MM-dd") !== startDate || format(dates.value[1], "yyyy-MM-dd") !== endDate) dates.value = [parseISO(startDate), parseISO(endDate)];
});
const currentDate = new Date();
const presets: PresetDate[] = [
  { label: "Today", value: [currentDate, currentDate] },
  { label: "Yesterday", value: [subDays(currentDate, 1), subDays(currentDate, 1)] },
  { label: "This week", value: [startOfWeek(currentDate, { weekStartsOn: 1 }), endOfWeek(currentDate, { weekStartsOn: 1 })] },
  { label: "Last week", value: [startOfWeek(subWeeks(currentDate, 1), { weekStartsOn: 1 }), endOfWeek(subWeeks(currentDate, 1), { weekStartsOn: 1 })] },
  { label: "Past two weeks", value: [subDays(currentDate, 13), currentDate] },
  { label: "This month", value: [startOfMonth(currentDate), endOfMonth(currentDate)] },
  { label: "Last month", value: [startOfMonth(subMonths(currentDate, 1)), endOfMonth(subMonths(currentDate, 1))] },
  { label: "This year", value: [startOfYear(currentDate), endOfYear(currentDate)] },
  { label: "Last year", value: [startOfYear(subYears(currentDate, 1)), endOfYear(subYears(currentDate, 1))] },
];
const formats = { input: (value: Date[]) => value?.length === 2 ? `${format(value[0], "dd/MM/yyyy")} – ${format(value[1], "dd/MM/yyyy")}` : "Select a range" };
</script>

<template>
  <div class="report-date-range">
    <VueDatePicker :model-value="dates" :multi-calendars="{ count: 2, static: true }" :preset-dates="presets" :formats="formats" :range="{ partialRange: false, maxRange: 366 }" :action-row="{ showCancel: false, showSelect: false, showNow: false, showPreview: false }" :config="{ closeOnAutoApply: true }" :input-attrs="{ clearable: false }" :time-config="{ enableTimePicker: false }" auto-apply week-start="1" aria-label="Report date range" @update:model-value="updateDates" />
    <button class="range-arrow" type="button" aria-label="Previous date range" @click="emit('previous')"><span aria-hidden="true">‹</span></button>
    <button class="range-arrow" type="button" aria-label="Next date range" @click="emit('next')"><span aria-hidden="true">›</span></button>
  </div>
</template>
