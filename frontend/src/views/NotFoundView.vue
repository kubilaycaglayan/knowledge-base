<template>
  <section class="not-found-view" aria-labelledby="not-found-title">
    <p class="eyebrow">404</p>
    <h1 id="not-found-title">Page not found</h1>
    <p>This address doesn’t match a Knowledge Base page.</p>
    <RouterLink class="primary-action" to="/">Go to Sessions</RouterLink>
  </section>
</template>

<style scoped>
.not-found-view {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  max-width: 36rem;
  margin: 4rem auto;
  padding: 1.5rem;
}

.not-found-view .eyebrow {
  margin: 0;
  color: var(--text-muted, #687078);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.not-found-view h1,
.not-found-view p {
  margin: 0;
}

.not-found-view a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: var(--workspace-accent);
  color: var(--workspace-on-accent);
  text-decoration: none;
}

.not-found-view a:hover {
  background: var(--workspace-accent-hover);
}
</style>
