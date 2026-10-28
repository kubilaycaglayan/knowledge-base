<template>
  <div class="report-visualization-loading" role="status" aria-live="polite">
    <span class="visually-hidden">Loading time flow chart…</span>
    <div class="report-skeleton-chart" aria-hidden="true">
      <span class="skeleton-chart-y skeleton-chart-y-one"></span>
      <span class="skeleton-chart-y skeleton-chart-y-two"></span>
      <div class="skeleton-chart-bars">
        <span
          v-for="height in [38, 58, 46, 76, 52, 68, 42]"
          :key="height"
          class="skeleton-chart-bar"
          :style="{ height: `${height}%` }"
        ></span>
      </div>
      <div class="skeleton-chart-x">
        <span
          v-for="label in 7"
          :key="label"
          class="skeleton-chart-label"
        ></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-visualization-loading {
  height: 390px;
  overflow: hidden;
}

.report-skeleton-chart {
  margin-top: 0;
}

@media (max-width: 700px) {
  .report-visualization-loading {
    height: 310px;
  }

  .report-skeleton-chart {
    height: 280px;
  }
}
</style>
