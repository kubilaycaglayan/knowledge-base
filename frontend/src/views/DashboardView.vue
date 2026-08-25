<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../lib/api'

type Path = { id: string; name: string; status: string }
type Item = { id: string; title: string }
type Timer = { id: string; startedAt: string; description?: string }
type Entry = { id: string; pathId?: string; itemId?: string; startedAt: string; endedAt?: string; durationSeconds?: number; description?: string }
type ProgressChange = { itemId: string; previousProgress: number; newProgress: number; changedAt: string }
type Stats = { todaySeconds: number; weekSeconds: number; monthSeconds: number; todayByPath: Record<string, number>; todayByItem: Record<string, number>; completedItems: number; activeItems: number; recentProgressChanges: ProgressChange[] }
type Result = { kind: string; id: string; title: string; detail?: string }

const paths = ref<Path[]>([]), items = ref<Item[]>([]), timer = ref<Timer | null>(null), stats = ref<Stats | null>(null), history = ref<Entry[]>([]), results = ref<Result[]>([])
const pathId = ref(''), itemId = ref(''), description = ref(''), query = ref(''), error = ref(''), startedAt = ref(''), endedAt = ref('')
const format = (seconds: number) => { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m` }
const timerNow = ref(Date.now())
const elapsed = () => timer.value ? Math.max(0, Math.floor((timerNow.value - Date.parse(timer.value.startedAt)) / 1000)) : 0
const clock = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const pathName = (id: string) => paths.value.find(path => path.id === id)?.name || id
const itemName = (id: string) => items.value.find(item => item.id === id)?.title || id
const activePaths = computed(() => paths.value.filter(path => path.status === 'ACTIVE'))
async function load() { try { [paths.value, items.value, timer.value, stats.value, history.value] = await Promise.all([api<Path[]>('/paths'), api<Item[]>('/items'), api<Timer | null>('/timers/current'), api<Stats>('/statistics'), api<Entry[]>('/time-entries')]) } catch { error.value = 'Unable to load your workspace.' } }
async function toggle() { try { if (timer.value) { await api('/timers/stop', { method: 'POST', body: '{}' }); timer.value = null } else { timer.value = await api<Timer>('/timers', { method: 'POST', body: JSON.stringify({ pathId: pathId.value || null, itemId: itemId.value || null, description: description.value || null }) }) } } catch { error.value = 'Could not update the timer. Only one timer can run at a time.' } }
async function cancel() { try { await api('/timers/cancel', { method: 'POST', body: '{}' }); timer.value = null } catch { error.value = 'Could not cancel the timer.' } }
async function manual() { try { await api('/time-entries', { method: 'POST', body: JSON.stringify({ pathId: pathId.value || null, itemId: itemId.value || null, startedAt: new Date(startedAt.value).toISOString(), endedAt: new Date(endedAt.value).toISOString(), description: description.value || null }) }); startedAt.value = ''; endedAt.value = ''; await load() } catch { error.value = 'Enter a valid start and end time.' } }
async function search() { if (!query.value.trim()) { results.value = []; return }; try { results.value = await api<Result[]>(`/search?q=${encodeURIComponent(query.value)}`) } catch { error.value = 'Search failed.' } }
async function editEntry(entry: Entry) { const start = prompt('Start (ISO time)', entry.startedAt); const end = prompt('End (ISO time)', entry.endedAt || ''); if (!start || !end) return; try { await api(`/time-entries/${entry.id}`, { method: 'PUT', body: JSON.stringify({ pathId: entry.pathId || null, itemId: entry.itemId || null, startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), description: entry.description || null }) }); await load() } catch { error.value = 'Could not edit time entry.' } }
let timerTicker: number | undefined
onMounted(() => { void load(); timerTicker = window.setInterval(() => { timerNow.value = Date.now() }, 1000) })
onUnmounted(() => { if (timerTicker) window.clearInterval(timerTicker) })
</script>

<template>
  <section class="hero"><p class="eyebrow">PERSONAL KNOWLEDGE SYSTEM</p><h1>Make your learning<br><em>visible.</em></h1><p class="lede">A calm place to collect what you’re learning, track the work, and remember the journey.</p></section>
  <section class="stats"><article class="card"><p class="eyebrow">TODAY</p><h2>{{ format(stats?.todaySeconds || 0) }}</h2></article><article class="card"><p class="eyebrow">THIS WEEK</p><h2>{{ format(stats?.weekSeconds || 0) }}</h2></article><article class="card"><p class="eyebrow">THIS MONTH</p><h2>{{ format(stats?.monthSeconds || 0) }}</h2></article><article class="card"><p class="eyebrow">COMPLETED ITEMS</p><h2>{{ stats?.completedItems || 0 }}</h2><p class="muted">{{ stats?.activeItems || 0 }} active</p></article></section>
  <section class="breakdowns"><article class="card"><p class="eyebrow">TIME BY PATH TODAY</p><p v-for="(seconds, id) in stats?.todayByPath" :key="id">{{ pathName(id) }} <strong>{{ format(seconds) }}</strong></p><p v-if="!Object.keys(stats?.todayByPath || {}).length" class="muted">No path time yet.</p></article><article class="card"><p class="eyebrow">TIME BY ITEM TODAY</p><p v-for="(seconds, id) in stats?.todayByItem" :key="id">{{ itemName(id) }} <strong>{{ format(seconds) }}</strong></p><p v-if="!Object.keys(stats?.todayByItem || {}).length" class="muted">No item time yet.</p></article></section>
  <section class="grid"><article class="card focus"><p class="eyebrow">FOCUS TODAY</p><strong>{{ timer ? clock(elapsed()) : '00:00:00' }}</strong><p>{{ timer?.description || 'Choose a path or item to begin.' }}</p><div v-if="!timer" class="timer-fields"><select v-model="pathId" aria-label="Timer path"><option value="">Choose a path</option><option v-for="path in activePaths" :key="path.id" :value="path.id">{{ path.name }}</option></select><select v-model="itemId" aria-label="Timer item"><option value="">Choose an item</option><option v-for="item in items" :key="item.id" :value="item.id">{{ item.title }}</option></select><input v-model="description" placeholder="What are you working on?" aria-label="Timer description"></div><div class="item-actions"><button class="primary" @click="toggle">{{ timer ? 'Stop session' : 'Start a session' }}</button><button v-if="timer" class="text-button danger" @click="cancel">Cancel</button></div></article><article class="card"><p class="eyebrow">MANUAL TIME</p><p class="muted">Add a completed session from your history.</p><input v-model="startedAt" type="datetime-local" aria-label="Started at"><input v-model="endedAt" type="datetime-local" aria-label="Ended at"><button class="primary" @click="manual">Save time</button></article></section>
  <section class="card"><p class="eyebrow">RECENT PROGRESS CHANGES</p><p v-for="change in stats?.recentProgressChanges || []" :key="change.itemId + change.changedAt" class="history-row"><span>{{ itemName(change.itemId) }}</span><span class="muted">{{ change.previousProgress }}% → {{ change.newProgress }}%</span></p><p v-if="!stats?.recentProgressChanges?.length" class="muted">No progress changes yet.</p></section>
  <section class="card history-box"><p class="eyebrow">RECENT TIME ENTRIES</p><div v-for="entry in history.slice(0, 8)" :key="entry.id" class="history-row"><span>{{ entry.description || 'Tracked session' }}</span><span class="muted">{{ entry.durationSeconds || 0 }}s</span><button class="text-button" @click="editEntry(entry)">Edit</button></div><p v-if="!history.length" class="muted">No recorded sessions yet.</p></section>
  <section class="card search-box"><p class="eyebrow">RETRIEVE KNOWLEDGE</p><form class="add" @submit.prevent="search"><input v-model="query" placeholder="Search paths, items, notes, and activity" aria-label="Search knowledge"><button class="primary">Search</button></form><div v-for="result in results" :key="result.kind + result.id" class="search-result"><span class="pill">{{ result.kind.toLowerCase() }}</span><strong>{{ result.title }}</strong><span class="muted">{{ result.detail }}</span></div></section>
  <p v-if="error" class="notice" role="alert">{{ error }}</p>
</template>
