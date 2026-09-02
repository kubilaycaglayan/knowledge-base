You are building a production-quality personal knowledge, learning, and activity tracking application.

Your goal is not to create a mockup, scaffold, demo, or proof of concept. Continue working incrementally until the following three usable applications exist and work together:

1. Web application
2. Native iOS application
3. Chrome extension for time tracking

The first production deployment will run on an Ubuntu Server and be exposed through a rented domain over HTTPS.

## Core Product Idea

The application is a personal knowledge and learning history system.

It should allow a person to record, organize, track, and review:

* learning paths
* books
* courses
* projects
* articles
* movies
* exercises
* hobbies
* notes
* progress
* study/activity sessions
* time spent
* historical activity

The central idea is:

```text
User
  → Paths
      → Items
          → Activities
          → Notes
          → Progress
          → Time Entries
```

Do not make the data model unnecessarily rigid.

A resource may belong to multiple learning paths.

Example:

```text
Kafka Streams Project

Paths:
- Java
- Distributed Systems

Tags:
- kafka
- stream-processing
- apache
- backend
```

## Preferred Technology Stack

Use this stack unless there is a strong technical reason not to:

### Backend

* Java
* Spring Boot
* PostgreSQL
* Gradle
* Spring Data JPA or another appropriate persistence layer
* Flyway or Liquibase for database migrations
* REST API initially

Keep the backend as a modular monolith.

Do not introduce microservices unless there is a concrete requirement that justifies them.

### Web

* Vue 3
* TypeScript
* Vite
* Vue Router
* Pinia if application-level state management is needed

The UI must be responsive and usable on desktop and mobile browsers.

### iOS

Build a real native iOS application using:

* Swift
* SwiftUI

The iOS application must communicate with the same backend used by the web application.

Do not create a WebView wrapper around the website.

### Chrome Extension

Build a Manifest V3 Chrome extension.

Its scope for the initial product is intentionally limited to time tracking.

The extension should communicate with the same backend API.

## Architecture

Use approximately this architecture:

```text
                  ┌───────────────┐
                  │ Vue Web App   │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │               │
┌──────────────┐  │ Spring Boot   │
│ SwiftUI iOS  ├──► API           │
└──────────────┘  │               │
                  └───────┬───────┘
                          │
                  ┌───────▼───────┐
                  │ PostgreSQL    │
                  └───────────────┘
                          ▲
                          │
                  ┌───────┴───────┐
                  │ Chrome        │
                  │ Extension     │
                  └───────────────┘
```

All clients must use the same canonical domain model and backend.

Avoid duplicating business logic between clients.

## Core Domain Model

Start from the following concepts, but improve the exact schema where appropriate.

### User

Represents an application user.

Design authentication and ownership correctly even if the first deployment initially has only one primary user.

### Path

A long-lived area of learning, interest, or activity.

Examples:

* Generative AI
* Algorithms and Data Structures
* Java
* Deep Learning
* Distributed Systems
* Movies
* Literature

Suggested fields:

```text
id
user_id
name
description
status
created_at
updated_at
archived_at
```

### Item

A resource or thing being tracked.

Possible types:

```text
BOOK
COURSE
PROJECT
ARTICLE
MOVIE
EXERCISE
HOBBY
VIDEO
PAPER
CUSTOM
```

Suggested fields:

```text
id
user_id
title
type
description
status
progress
started_at
completed_at
estimated_duration
parent_item_id
metadata
created_at
updated_at
```

Possible statuses:

```text
PLANNED
ACTIVE
PAUSED
COMPLETED
ABANDONED
```

Do not force type-specific information into dozens of nullable columns.

Use an extensible design for optional metadata when appropriate.

### PathItem

Items and paths have a many-to-many relationship.

An item may appear in multiple paths.

### Tag

Items should support arbitrary tags.

Tags should eventually allow cross-path discovery.

### Note

Users can attach notes to:

* paths
* items
* activities

At minimum support:

```text
title
content
created_at
updated_at
```

Markdown support is desirable.

### TimeEntry

Time tracking must be a first-class domain object.

Suggested fields:

```text
id
user_id
path_id
item_id
started_at
ended_at
duration
description
source
created_at
```

Possible sources:

```text
WEB
IOS
CHROME_EXTENSION
MANUAL
IMPORT
```

A running timer should be represented safely so duplicate active timers and inconsistent durations cannot occur.

### ProgressEntry

Do not only save the latest progress value.

Keep historical progress changes.

Example:

```text
2026-08-25
31% → 37%
```

This allows progress graphs and historical analysis later.

### Activity

The timeline is assembled from purpose-specific history sources rather than a
single activity table. Time entries represent sessions and their duration,
progress entries represent progress changes, notes represent knowledge, and
item events represent lifecycle events.

Examples:

```text
Completed Exercism exercise "Lasagna"

Read 40 pages of a book

Tracked 55 minutes on a Deep Learning course

Added a note about activation functions

Changed course progress from 31% to 37%

Completed a project
```

The timeline is a core part of the product.

Where reasonable, significant application actions should automatically generate
records in the table that owns that history. Session descriptions and timing
must not be copied into a second timeline table.

The application should not require the user to manually duplicate information in both the entity and timeline.

## Important Conceptual Separation

Preserve the distinction between:

### Resource

"What am I learning from or interacting with?"

Example:

```text
Designing Data-Intensive Applications
```

### Activity

"What did I do?"

Example:

```text
Read pages 120-145 for 55 minutes.
```

### Knowledge

"What did I learn?"

Example:

```text
Consistent hashing distributes keys across a hash ring...
```

Notes primarily represent the knowledge layer.

This distinction is important for the long-term usefulness of the application.

# Web Application

Implement the following major areas.

## Dashboard

Show useful information such as:

```text
Today
5h 12m tracked

Active Paths

Generative AI      42%
Algorithms         28%
Java               67%
Deep Learning      19%

This Week

Generative AI      8h 30m
Algorithms         4h 10m
Java               6h 45m

Recent Activity
...
```

Do not hardcode these values.

Everything must come from persisted application data.

## Paths

Users can:

* create paths
* edit paths
* archive paths
* soft-delete paths with frontend confirmation
* inspect path history
* view associated items
* see accumulated time
* see recent activity
* see progress
* filter path content

## Items

Users can:

* create items
* edit items
* change status
* update progress
* attach them to one or more paths
* add tags
* add notes
* track time
* mark them complete
* inspect their history

## Timeline

Build a chronological activity view.

Support useful filtering including:

* date range
* path
* item
* activity type

Examples:

```text
Last 7 days
Last 30 days
Custom date range
Java only
Courses only
Completed items
Notes
```

A user should be able to answer:

"What was I doing last week?"

without manually reconstructing their history.

## Notes

Provide a clean note-taking interface.

Notes should be easy to associate with the correct item or path.

Search should eventually allow knowledge to be retrieved across the application.

## Timer

Provide a persistent time tracker.

Starting a timer should allow selection of:

```text
Path
Item
Optional description
```

Example:

```text
Path:
Generative AI

Item:
Hugging Face LLM Course

Description:
Chapter 4
```

Support:

* start
* stop
* cancel
* manual time entry
* editing historical entries

Display the currently active timer prominently.

Timer state must survive page refreshes and reconnects because the canonical timer state lives on the server.

## Statistics

At minimum provide:

* time tracked today
* time tracked this week
* time tracked this month
* time by path
* time by item
* completion counts
* recent progress changes

Avoid meaningless vanity charts.

Every visualization should answer a useful question.

# iOS Application

Create a native SwiftUI application.

The iOS app should provide the most useful everyday functionality of the web application.

At minimum:

* authentication
* dashboard
* paths
* items
* item details
* notes
* timeline
* timer
* progress updates

Timer functionality is particularly important on mobile.

The iOS application and website must stay synchronized through the backend.

Do not maintain a separate iOS-only source of truth.

Design networking cleanly.

Use appropriate Swift models and API abstractions rather than scattering HTTP calls throughout SwiftUI views.

Handle:

* loading
* errors
* authentication expiry
* empty states
* offline/reconnection situations reasonably

Do not copy another application's UI.

Create an original, modern interface.

# Chrome Extension

The Chrome extension is only for time tracking in the first version.

Keep its responsibilities small.

It should provide:

* authentication
* current timer state
* start timer
* stop timer
* select path
* select item
* optional description

Later it may recognize websites such as:

```text
leetcode.com
exercism.org
coursera.org
huggingface.co
youtube.com
```

and suggest relevant items.

However, do not build invasive browser-history tracking in the first version.

The user should explicitly start tracking unless a later feature clearly introduces opt-in automation.

The extension must not collect unnecessary browser data.

# Authentication and Security

Build real authentication.

Do not rely on hidden URLs, hardcoded users, or client-side-only protection.

Choose an appropriate authentication mechanism for:

* web
* iOS
* Chrome extension

Design it so all three clients can authenticate against the same backend.

Store credentials/tokens safely.

Never commit:

* passwords
* API keys
* secrets
* private keys
* production tokens
* server IP addresses when avoidable
* personal information

Use environment variables or appropriate secret management.

Validate authorization on the backend.

A user must never be able to access another user's data merely by changing an ID in a request.

Use appropriate:

* input validation
* CSRF strategy where relevant
* CORS policy
* secure cookies or token handling
* password hashing
* rate limiting where useful
* security headers

# API

Design a coherent versioned API.

For example:

```text
/api/v1/paths
/api/v1/items
/api/v1/notes
/api/v1/time-entries
/api/v1/timers
/api/v1/activities
/api/v1/statistics
```

Do not blindly use this exact structure if a better REST design emerges.

Keep API contracts explicit.

Generate or maintain OpenAPI documentation.

The API must be usable by all three clients.

# Database

Use PostgreSQL.

Use proper migrations.

Never rely on Hibernate automatically mutating the production database schema.

Development should make it easy to rebuild a database from migrations.

Use appropriate:

* foreign keys
* indexes
* unique constraints
* check constraints
* timestamps
* transactions

Pay particular attention to timer consistency and ownership boundaries.

# Search

Implement basic application search once the primary CRUD and tracking flows work.

Users should eventually be able to search:

```text
Kafka
```

and discover:

* paths
* resources
* notes
* related activity

PostgreSQL full-text search is acceptable for the initial implementation.

Do not introduce Elasticsearch merely because search exists.

# Deployment

The first deployment target is an Ubuntu Server.

The application should be accessible through a rented domain.

Prepare production deployment using Docker.

A reasonable deployment architecture is:

```text
Internet
   │
   ▼
Domain
   │
   ▼
HTTPS reverse proxy
   │
   ├── Vue frontend
   │
   └── Spring Boot API
            │
            ▼
       PostgreSQL
```

Use either Caddy, nginx, or another justified reverse proxy.

HTTPS must be enabled.

Use Let's Encrypt or equivalent automatic certificate management.

Do not expose PostgreSQL publicly.

Only expose ports that are actually necessary.

Provide:

* Dockerfiles
* docker-compose.yml or equivalent
* production environment configuration template
* health checks
* restart policies
* persistent PostgreSQL volume
* database backup procedure
* deployment documentation

The same repository should make local development straightforward.

# Repository Structure

Choose a clean monorepo layout similar to:

```text
/
├── backend/
├── web/
├── ios/
├── chrome-extension/
├── deployment/
├── docs/
├── docker-compose.yml
├── AGENTS.md
└── README.md
```

You may improve this structure if necessary.

# Engineering Standards

This is a real application.

Do not:

* create fake implementations
* leave primary features as TODOs
* substitute static mock data for implemented APIs
* pretend functionality works when it does not
* implement buttons that do nothing
* create placeholder screens and call them complete
* copy another application's source code
* copy another application's design pixel-for-pixel

Use mock data only in tests or explicitly isolated development fixtures.

When a feature is considered complete, it must work end-to-end.

Example:

```text
Vue UI
→ API request
→ Spring service
→ PostgreSQL
→ API response
→ UI updated
```

# Testing

Implement automated tests as the system develops.

Backend:

* unit tests where useful
* service tests
* repository/integration tests
* API tests
* security/authorization tests

Web:

* important component tests
* important application-flow tests

iOS:

* unit tests for important models/services
* UI tests for critical flows where practical

Chrome extension:

* test core state/API logic

Also maintain at least a small end-to-end smoke-test path covering critical functionality.

Prioritize tests around:

* authentication
* ownership
* timer behavior
* progress changes
* activity generation
* path/item relationships

# Code Quality

Prefer straightforward code over abstraction-heavy code.

Follow ecosystem conventions.

For Java:

* use clear domain/service/repository boundaries
* avoid unnecessary interfaces
* avoid giant controllers
* avoid giant service classes
* use records where appropriate
* use enums for stable domain concepts
* use transactions intentionally
* do not hide important business behavior inside entity setters

For Vue:

* use Composition API
* use TypeScript
* build reusable components where reuse actually exists
* keep API access out of presentation-only components

For Swift:

* separate networking/domain/view concerns
* use Swift concurrency appropriately
* keep views reasonably small

# Git Workflow

Commit regularly.

Use semantic, focused commits.

Examples:

```text
feat(paths): add path creation API

feat(timer): persist active time tracking sessions

feat(web): add weekly activity timeline

feat(ios): implement path list

feat(extension): add timer controls

fix(auth): reject cross-user item access

test(timer): cover duplicate active timer prevention
```

Do not accumulate the entire application into one massive commit.

Before committing:

* inspect the diff
* remove accidental files
* remove debug artifacts
* verify secrets are not present
* verify personal names, local IPs, credentials, tokens, or private paths are not leaking
* run relevant tests

Do not commit `.env` files containing secrets.

# Documentation

Keep documentation synchronized with the implementation.

At minimum maintain:

```text
README.md
docs/architecture.md
docs/domain-model.md
docs/api.md
docs/deployment.md
docs/development.md
```

The README should allow another developer to understand how to run the project.

Do not document features as implemented before they actually exist.

# Development Strategy

Work incrementally.

Do not attempt to generate the entire application in one pass.

Use roughly this order.

## Phase 1: Foundation

* repository structure
* Spring Boot backend
* PostgreSQL
* migrations
* Vue application
* authentication
* Docker development environment
* basic deployment foundation

## Phase 2: Core Domain

* paths
* items
* many-to-many path/item relationships
* tags
* notes
* statuses
* progress history

## Phase 3: Activity History

* item event model for non-session lifecycle history
* automatic activity generation
* timeline
* filtering

## Phase 4: Time Tracking

* timer API
* time entries
* many-to-many time-entry/item relationships
* one duration per time entry regardless of item count
* active timer rules
* web timer UI
* statistics

## Phase 5: Web Product Completion

* dashboard
* polished paths
* item views
* notes
* search
* statistics
* responsive UI
* validation/error states

At this point the website should be genuinely usable.

## Phase 6: Production Deployment

* production Docker configuration
* reverse proxy
* HTTPS
* domain configuration documentation
* backups
* monitoring/logging basics
* health checks

Deploy the working web application to the Ubuntu Server.

## Phase 7: iOS

Build the native SwiftUI client against the production-compatible API.

Implement:

* login
* dashboard
* paths
* items
* notes
* timeline
* progress
* timer

## Phase 8: Chrome Extension

Implement the Manifest V3 timer extension.

Use the existing backend.

Keep its scope focused on time tracking.

## Phase 9: Hardening

* security audit
* UX cleanup
* error handling
* performance review
* database indexes
* end-to-end testing
* accessibility review
* documentation verification
* backup/restore test

# Definition of Done

Do not interpret "done" as "the repository was scaffolded."

The goal is complete only when all three deliverables exist:

### 1. Website

A real working website where the user can:

* authenticate
* create learning paths
* create resources/items
* organize items into multiple paths
* add tags
* take notes
* update progress
* start and stop timers
* manually add time
* see timelines
* inspect historical activity
* see useful statistics
* search their data

and the application persists everything in PostgreSQL.

### 2. iOS Application

A native SwiftUI application that can access the same account and perform the core daily workflows against the same backend.

### 3. Chrome Extension

A working Chrome extension allowing the user to start and stop time tracking against paths/items stored in the same application.

All three clients must operate against the same backend and persisted data.

# Long-Term Product Direction

Design the system so it can eventually answer questions such as:

```text
What did I study last week?

How much time did I spend learning Java before starting my first Java project?

Show everything I have learned about Kafka.

Which topics do I repeatedly start but fail to complete?

How has my focus changed over the last two years?

What books, courses and projects contributed to my knowledge of distributed systems?
```

Do not build an AI layer merely to claim these capabilities today.

Instead, preserve enough structured historical data that such capabilities can be implemented properly later.

The long-term objective is to build a structured history of:

```text
what the user consumes
+
what the user does
+
what the user learns
+
how those things change over time
```

# Decision-Making Authority

You are allowed to make ordinary engineering decisions without asking for approval.

Examples:

* package structure
* library selection
* naming
* database indexes
* component organization
* test frameworks
* reverse proxy selection
* minor UI decisions

Prefer Java/Spring Boot, PostgreSQL, Vue 3/TypeScript, SwiftUI, and Manifest V3 unless there is a concrete reason to deviate.

When choosing a dependency:

1. Prefer mature, maintained libraries.
2. Avoid unnecessary dependencies.
3. Prefer standard platform capabilities where reasonable.
4. Document important architectural choices.

If an implementation decision is reversible and low risk, make the decision and continue rather than stopping to ask.

# Working Behavior

At the beginning of work:

1. Inspect the repository.
2. Read `AGENTS.md` and existing documentation.
3. Inspect current implementation and git history.
4. Determine the next incomplete milestone.
5. Continue from there.

Maintain a task document such as:

```text
.agents/task.md
```

Use it as the persistent implementation roadmap.

Update it as work progresses.

Do not mark tasks complete until they actually work.

At the end of each meaningful work session:

1. Run relevant tests.
2. Run formatting/linting.
3. Inspect the diff.
4. Verify no secrets/private information leaked.
5. Commit completed coherent work.
6. Update the task roadmap.
7. Record what remains.

Continue working toward the full product rather than stopping after scaffolding or after completing only the website.

The ultimate target remains:

```text
Website
+
Native iOS application
+
Chrome time-tracking extension
+
Shared production backend
+
Ubuntu Server deployment through a rented HTTPS domain
```

# Test Environment Cleanup

Agents must clean disposable Docker test environments after smoke/integration runs. Do not leave `knowledge-base-*` smoke images, stopped containers, unused volumes, or BuildKit cache from this repository accumulating on the host. Legacy `try-know-be` production resources are compatibility-sensitive and must not be removed by smoke cleanup. Prefer updating the smoke/test scripts so cleanup is automatic, scoped to this project, and does not affect unrelated Docker workloads.
