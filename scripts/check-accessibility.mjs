import { readFileSync } from 'node:fs'

const required = [
  ['chrome-extension/popup.html', 'for="email"', 'extension email label'],
  ['chrome-extension/popup.html', 'role="status"', 'extension timer status'],
  ['chrome-extension/popup.html', 'role="alert"', 'extension error announcement'],
  ['chrome-extension/options.html', 'for="api"', 'extension API label'],
  ['chrome-extension/options.html', 'role="status"', 'extension settings status'],
  ['frontend/src/views/AuthView.vue', 'aria-label="Email"', 'web authentication email label'],
  ['frontend/src/views/AuthView.vue', 'aria-label="Password"', 'web authentication password label'],
  ['frontend/src/views/ItemsView.vue', '<legend>Active paths</legend>', 'item path selector legend'],
  ['frontend/src/views/PathsView.vue', 'aria-label="Filter path items"', 'path content filter label'],
  ['frontend/src/views/DashboardView.vue', 'aria-label="Search knowledge"', 'dashboard search label'],
  ['frontend/src/views/TimelineView.vue', 'aria-label="Activity type"', 'timeline activity filter label'],
  ['frontend/src/views/TimelineView.vue', 'aria-label="From date"', 'timeline start date label'],
  ['frontend/src/views/TimelineView.vue', 'aria-label="To date"', 'timeline end date label'],
  ['frontend/src/components/ProgressBar.vue', 'role="progressbar"', 'progress semantic role'],
  ['frontend/src/components/ProgressBar.vue', 'aria-valuenow', 'progress current value'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("auth.submit")', 'native authentication control identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("auth.email")', 'native authentication email identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("auth.password")', 'native authentication password identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("tab.paths")', 'native paths tab identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("paths.name")', 'native path name identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("paths.save")', 'native path save identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("items.add")', 'native item creation identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("items.title")', 'native item title identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("items.save")', 'native item save identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("item.note.title")', 'native item note title identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("item.note.save")', 'native item note save identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("timer.path")', 'native timer path selector identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("timer.item")', 'native timer item selector identifier'],
  ['ios/Know/KnowApp.swift', 'accessibilityIdentifier("timer.toggle")', 'native timer control identifier'],
  ['ios/KnowUITests/KnowUITests.swift', 'app.textFields["auth.email"]', 'native UI test email target'],
  ['ios/KnowUITests/KnowUITests.swift', 'app.secureTextFields["auth.password"]', 'native UI test password target'],
  ['ios/KnowUITests/KnowUITests.swift', 'app.buttons["auth.submit"]', 'native UI test submit target']
]

for (const [file, fragment, description] of required) {
  if (!readFileSync(file, 'utf8').includes(fragment)) throw new Error(`Missing ${description}: ${fragment}`)
}
console.log(`Accessibility contract passed (${required.length} checks)`)
