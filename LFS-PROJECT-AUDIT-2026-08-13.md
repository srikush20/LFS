# LFS School App — Full Project Audit & Handoff

Date: 13 August 2026
Project: Little Flower School, Harraiya (LFS)
GitHub repository: `srikush20/LFS`
Default branch: `main`
Supabase project ref: `jzclpttnvaycutglohcu`

## 1. Purpose of this document

This is the handoff document for continuing the LFS web-app prototype. It records the architecture, work already completed, live database state observed during the audit, known bugs, fragile areas, previous failures, and the safest order for finishing the prototype.

Important: this repository is a single-page vanilla HTML/JS application with Supabase as the backend. The main UI is concentrated in `index.html`, which is large (about 512 KB in the current GitHub copy) and includes HTML, CSS, large Base64 image data, and substantial inline JavaScript. The current GitHub connector can return that file only as one very large line, so this audit did NOT claim a literal byte-by-byte review of every character. The separate JS files were inspected directly, and targeted HTML/CSS sections plus a previously saved known-good HTML version were compared.

## 2. Current repository structure

Current main files observed in GitHub:

- `index.html` — main application shell/UI, CSS, inline JavaScript, demo data, navigation, splash, dashboards, forms, and many interaction handlers.
- `supabase-auth.js` — browser authentication, Supabase client loading, login/logout, session restoration, registration UI and registration submission.
- `student-profile-sync.js` — real student-profile/class/assignment synchronization into the student UI.
- `student-profile-sync-fixed.js` — an older/fixed variant kept in the repo; verify that it is NOT loaded by the active HTML. This duplicate is dangerous because future edits can go to the wrong copy.
- `registration-approval.js` — reusable approval/notification data helpers.
- `registration-review-ui.js` — Admin/Teacher registration-review UI, live request rendering, approval/rejection, and realtime subscriptions.
- `registration-class-loader.js` — loads class/section options for registration through the `get_registration_class_sections` RPC.
- `class-teacher-admin.js` — Admin UI for assigning class teachers to class sections.
- `CHECKPOINT-2026-08-11.md` — existing checkpoint.
- `checkpoint read it` — older handoff/checkpoint notes.
- `README.md` — very small repository README.
- `.github/` — repository automation/config directory.

## 3. Core architecture

Frontend:

`index.html` is effectively the app. It contains:

- CSS tokens/theme
- device/phone frame
- splash screen
- topbar
- bottom navigation
- home screen
- login screen
- registration UI hooks
- role dashboards
- bottom sheets/modals
- demo arrays and demo CONTENT objects
- many inline event handlers/functions

Backend:

Supabase provides:

- Auth users
- profile/role information
- student records
- teacher records
- classes and class sections
- student/class assignments
- attendance
- marks
- exams
- homework
- notices
- fees
- notifications
- registration requests
- RLS policies
- RPCs/functions
- realtime database events

## 4. Authentication path

The working intended flow is:

Browser loads Supabase JS client → `supabase-auth.js` creates the client → session persists → login uses `signInWithPassword()` → profile is loaded from `public.profiles` → role is checked → UI routes to the role dashboard.

The Supabase client configuration uses the browser-safe publishable key. NEVER put a service-role/secret key into frontend files.

`supabase-auth.js` exposes shared globals used by dependent modules, including:

- `window.LFS_SUPABASE_READY`
- `window.LFS_SUPABASE_CLIENT`
- `window.LFS_SUPABASE`
- `window.LFS_CURRENT_PROFILE`

The student sync depends on the shared client and current authenticated session.

## 5. Student authentication/profile work completed

The original student dashboard had hardcoded demo identity such as:

- `Hi, Ananya Singh`
- `AS`
- `Class VIII · Roll No. 14`

That was changed to neutral placeholders, then runtime data was wired in.

The current student sync uses the real relationship:

`auth.users.id = profiles.id = students.id`

then:

`students.id -> student_class_assignments.student_id`

`student_class_assignments.class_section_id -> class_sections.id`

`class_sections.class_id -> classes.id`

The current `student-profile-sync.js` explicitly:

1. Gets Supabase client.
2. Gets active auth session.
3. Loads the profile by `profiles.id = auth.uid()`.
4. Rejects non-student/inactive profiles.
5. Loads the student by `students.id = profile.id`.
6. Loads the latest class assignment.
7. Loads `class_sections` and joined `classes(name)`.
8. Caches partial data if student/assignment/class queries fail.
9. Updates student greeting, avatar, profile card, and Digital ID.
10. Exposes `window.LFS_LOAD_STUDENT_PROFILE`.
11. Listens for Supabase auth-state changes.

The student dashboard currently works and the user's real name was confirmed to render as `Kushagra Srivastava`.

## 6. Important student-sync details

The active `student-profile-sync.js` is the file to protect. DO NOT blindly replace the entire file.

Its current `applyStudentData()` updates:

- the student greeting
- `#dash-student-name`
- `#dash-student-info`
- `#pfName`
- `#pfRole`
- `#pfAvatar`
- Digital ID text

The direct `#dash-student-name` and `#dash-student-info` updates were added because the dashboard initially showed `Student` even though `window.LFS_CURRENT_PROFILE.full_name` already contained `Kushagra Srivastava`.

That targeted fix worked.

## 7. Auth-session error that was fixed

An earlier error was:

`[LFS Student Sync] Auth Query Error: Auth session missing!`

This was appearing while the app was simply logged out. The behavior was changed so that a missing session is a normal logged-out state, not treated as a fatal application error.

Current intended behavior:

- logged out → student sync skips quietly and neutralizes student UI
- logged in as student → student sync runs and renders live student data

## 8. Student Supabase schema issue that was fixed

An earlier query incorrectly attempted:

`students.profile_id`

The database does not have that column. The actual relationship used by the working student dashboard is `students.id = profiles.id = auth.uid()`.

This was verified and the working code now queries `students.id` using the profile ID.

DO NOT reintroduce `students.profile_id`.

## 9. Registration workflow

The intended real registration flow is:

Student/Teacher registers → Supabase Auth user created → registration request created → request remains pending/inactive → school/Admin/appropriate teacher reviews → request approved/rejected → account becomes usable according to role.

The project already had registration infrastructure before this audit:

- `registration_requests` table
- registration approval RPCs
- notifications
- `registration-approval.js`
- `registration-review-ui.js`
- `registration-class-loader.js`

A database trigger/migration was added to ensure that an Auth signup for a student or teacher automatically creates a `registration_requests` row when one does not already exist.

The trigger is conceptually:

`auth.users AFTER INSERT -> public.create_registration_request_on_signup()`

It reads signup metadata including:

- full_name
- requested_role
- class_section_id
- academic_year

and creates a pending registration request.

## 10. Registration approval UI

`registration-approval.js` provides:

- pending registration query
- notification query
- mark-notification-read helper
- `review_registration_request` RPC wrapper
- role-based routing helper

`registration-review-ui.js` provides:

- Admin/Teacher registration review panel
- pending request cards
- approve/reject buttons
- class/section/roll display for students
- employee ID display for teachers
- realtime subscriptions to `notifications`
- realtime subscriptions to `registration_requests`
- Student Management interception hook

A known historical issue was that Admin → Students initially opened the old demo Student Management screen instead of the live request UI. The registration-review UI already contains a separate live `renderStudentManagement()` path that should be preserved and connected to the existing Admin Students entry point.

## 11. Class-teacher assignment

`class-teacher-admin.js` adds an Admin-only Class Teacher Assignment interface.

It:

- verifies active admin profile
- loads `class_sections`
- loads active teacher records
- lets an admin choose a class teacher per section
- saves through the `assign_class_teacher` RPC

This is important for the intended routing workflow:

Student registration → chosen class section → class teacher receives/request can review → approval.

At audit time, the teachers table was empty, so full teacher-side testing could not be completed.

## 12. Live database observations

The Supabase project was audited using the live project reference `jzclpttnvaycutglohcu`.

The existing schema already contains the major school entities needed for a prototype. Previously observed record counts included:

- profiles: 2
- students: 1
- teachers: 0
- classes: 39
- class_sections: 39
- subjects: 17
- student_class_assignments: 1
- attendance: 0
- exams: 0
- marks: 0
- homework: 0
- notices: 0
- notifications: 1 at the time of the earlier count
- fee_records: 0 before prototype fee seeding
- fee_payments: 0

Prototype data was subsequently added for the student-facing notice/fee flow, including a notice and a prototype fee record. Do not treat those as production school data.

## 13. Security/RLS work

RLS was checked and enabled across public tables. Student-scoped policies exist for major student data areas. Admin management policies also exist.

Important rule:

- Student must not be able to read or write another student's private academic/financial data.
- Teacher must only manage the data they are authorized to manage.
- Admin can manage school-wide data.

The final security audit is NOT complete yet. Policy names existing is not enough; the exact `USING` and `WITH CHECK` expressions must still be inspected for every sensitive table.

## 14. Duplicate registration notification trigger issue

Two registration-related triggers existed on `registration_requests` and could result in duplicate notification behavior:

- `on_registration_request_created`
- `registration_request_route_notification`

The older duplicate trigger was removed, leaving the intended notification-routing trigger.

This was verified after the change.

## 15. Current splash-screen bug

The splash screen is one of the current high-priority frontend issues.

Important history:

- It worked before earlier syntax/HTML repairs.
- It later disappeared visually while the splash timing/background still worked.
- This means the splash mechanism itself is still running; the logo rendering/reference is the problem.

A previously saved known-good version `school-app-final-ready.html` shows the correct splash structure:

`#splash`

→ `.splash-glow`

→ `.splash-badge-wrap`

→ `<img class="splash-badge" src="data:image/png;base64,...">`

→ splash text

→ splash loader

The known-good version confirms the logo was embedded as Base64 directly in the HTML. It did NOT require an external `logo.png`. The current `index.html` contains a comment indicating the splash image was changed to use a provided `logo.png` file instead. That is a strong regression candidate because the project is supposed to remain a single-file HTML app.

Current diagnosis:

- splash container: working
- splash timing/transition: working
- Base64-logo architecture: intended
- current logo reference: likely wrong/missing

Fix strategy:

Restore the existing Base64 logo as the `src` of the splash `.splash-badge` image. Do NOT replace the entire 512 KB `index.html`.

## 16. Current frontend demo/static-data problem

The main `index.html` still contains large demo/static data structures. The previously saved project analysis identified arrays/objects such as:

- `SLIDES[]`
- `SECTIONS[]`
- `STUDENT_LINKS[]`
- `TEACHER_LINKS[]`
- `ADMIN_LINKS[]`
- `NOTICES[]`
- `GALLERY[]`
- large `CONTENT{}` object

Examples observed in the saved version include:

`NOTICES[]` containing five hardcoded notices.

Many Admin management CONTENT entries are explicitly tagged `Demo`.

This means many buttons are intentionally still demo/prototype behavior. The application is not yet a fully database-driven school ERP.

## 17. Notice screen problem

The Notice screen button works, but it was still displaying demo/unrelated notices.

Root cause found:

The frontend contains a hardcoded `NOTICES[]` array and a `buildNotices()` implementation that renders that array.

A Supabase-backed Notice query was attempted, but the live UI still rendered demo notices afterward, showing that another rendering path or later overwrite remains.

Next task:

Trace exactly which function writes to the Notice list after screen navigation. Make one source of truth:

`public.notices -> Notice UI`

The old demo `NOTICES[]` renderer should become a fallback/placeholder or be removed only after the live query is confirmed working.

## 18. Fees problem

The Fees interface was still demo-oriented.

Observed earlier demo text included a fixed fee amount and a `Pay Now (Demo)` button. The real database should instead use:

- `fee_records`
- `fee_payments`

and render the currently authenticated student's financial record.

Do not fabricate payment success. For a prototype, payment can be shown as a clear `Demo`/`Not connected` state until a real payment workflow is designed.

## 19. Other student feature buttons

Several dashboard cards/buttons were not connected to live database data at the time of the audit. Examples include:

- attendance
- marks/results
- homework
- exams
- fees
- transport
- notices
- gallery
- notifications
- timetable
- calendar/events
- messages

Some of these may intentionally open demo sheets/toasts. That is not the same as being broken JavaScript. They must be classified as:

1. working live
2. working demo
3. non-responsive/broken
4. not yet implemented

This classification should be completed feature-by-feature.

## 20. Admin dashboard issue

The Admin Console successfully opens and displays the school name.

However, some Admin management entries still route to demo content. The saved project analysis specifically notes that the old Student Management screen does not automatically display live pending registration requests unless the existing live registration-review UI is correctly connected.

Next Admin task:

`Admin -> Students -> live registration management`

and test:

`pending student -> Admin Students -> Approve -> student activated -> student can log in`

## 21. Teacher workflow status

At the time of the database audit, the `teachers` table had no teacher records. Therefore:

- teacher dashboard cannot be fully tested
- class teacher routing cannot be fully tested
- attendance marked_by constraints cannot be properly exercised
- marks entered_by constraints cannot be properly exercised

A real dedicated teacher test account should be created before declaring teacher workflow complete.

## 22. Splash/logo warning about current `index.html`

The biggest source of risk is `index.html`.

It is approximately 512 KB and contains Base64 image data plus large inline code. Several earlier attempts at automated/full-file rewriting caused severe regressions, including a situation where the file effectively became a one-line/truncated-looking version and the app stopped responding correctly.

Rules for future work:

- never replace the entire `index.html` blindly
- make small, targeted patches
- keep a copy/checkpoint before editing
- test after every significant frontend change
- do not copy a whole generated HTML file over the working local file unless the whole file has been independently verified

## 23. Known historical syntax problems

The project previously had:

- a missing `}` before `async function sync()` in `student-profile-sync.js`
- HTML `<script>` tag parsing errors because a script tag appeared to be inside/mixed into JavaScript
- `Unexpected token 'async'`
- `Expected token`/angle-bracket parser errors around the end of `index.html`
- `animateRing is not defined` in some login/student flows
- Supabase client initialization errors before globals were exposed correctly

The major syntax error was fixed and the student-sync file is currently syntactically coherent.

## 24. Current student sync file audit — `student-profile-sync.js`

Good:

- wrapped in IIFE
- strict mode
- client readiness fallback
- neutral logged-out behavior
- active student role check
- profile query
- student query
- assignment query
- class section query
- partial profile fallback
- cached result behavior
- explicit dashboard element updates
- auth state listener
- Digital ID refresh hook

Potential issues / cleanup:

- the repo contains both `student-profile-sync.js` and `student-profile-sync-fixed.js`; keep only the actually active version long-term, but do not delete the duplicate until the HTML script list has been verified.
- `getClient()` expects `window.LFS_SUPABASE_READY` to be awaitable. If another file changes that global from a Promise to a function, this becomes fragile. Standardize one contract.
- `authListenerAttached` is set after subscription creation. This is okay, but subscription failure should be handled explicitly.
- `start()` calls `neutralStudentUI()` before loading the session, which is correct for a placeholder, but the function should never touch teacher/admin UI.
- student sync should not run repeatedly on unnecessary DOM mutation; current version does not use a MutationObserver loop, which is safer than earlier versions.

## 25. `supabase-auth.js` audit

Good:

- uses browser-safe publishable key
- lazy loads Supabase CDN
- persists sessions
- auto-refreshes tokens
- detects session in URL
- uses real `signInWithPassword`
- checks the requested role against `profiles.role`
- checks `profiles.is_active`
- routes by role
- supports logout
- supports session restore
- registration UI exists
- class section selection exists

Potential issues:

- the same project URL/publishable key is duplicated in several JS files. This is unnecessary duplication and creates configuration drift risk. Prefer a single shared client.
- `animateRing` is called only if it exists, which prevents a hard crash but hides missing UI integration. It should be standardized later.
- OTP login is still explicitly a placeholder message.
- biometric login is not a real biometric implementation; earlier versions used the same login path.
- registration UI injects CSS/DOM dynamically. This works but increases debugging complexity.
- `restoreSession()` signs out a session if its profile is inactive/missing. That's a product decision worth documenting.

## 26. `registration-approval.js` audit

Good:

- small focused helper module
- pending requests query
- notification query
- mark-read helper
- RPC wrapper for approve/reject
- role-based routing helper

Potential issue:

The client accessor only checks `window.LFS_SUPABASE`. Make the app-wide client contract consistent with `student-profile-sync.js` and `supabase-auth.js` so modules use one shared helper/source.

## 27. `registration-review-ui.js` audit

Good:

- escapes database/user data before injecting it into HTML
- admin/teacher role checks
- separate Student Management renderer
- approve/reject actions
- notifications
- realtime subscriptions
- event interception for the old Student Management entry

Risk:

This is currently a second UI layer on top of the older demo UI. The code intercepts clicks to replace/override the old path. Long-term, replace the old demo screen with a direct call into this live renderer instead of relying on capture-phase interception.

This module also throws/alerts if client/request data fails rather than always using the app's toast system. Standardize UX later.

## 28. `registration-class-loader.js` audit

Good:

- uses a security-definer RPC for pre-auth class selection
- retries if classes are not ready
- observes the registration modal

Potential issue:

It repeats the Supabase URL/publishable key and client creation logic. It should eventually use the shared client rather than creating another client instance.

## 29. `class-teacher-admin.js` audit

Good:

- admin verification
- section list
- teacher list
- assignment UI
- RPC save
- visibility based on active admin profile

Potential issue:

It also duplicates the Supabase configuration and client-loading logic. Standardize the client dependency later.

## 30. Database workflow currently intended

Recommended production-style relationship flow:

Student:

`auth.users`
→ `profiles`
→ `students`
→ `student_class_assignments`
→ `class_sections`
→ `classes`

Teacher:

`auth.users`
→ `profiles`
→ `teachers`
→ subject/class assignments

Student registration:

`auth.users insert`
→ `registration_requests`
→ routing notification
→ Admin/class teacher review
→ approval RPC
→ profile/student/teacher activation as designed

## 31. What the new owner should NOT do

- Do not create another `registration_requests` table.
- Do not create a second authentication system.
- Do not replace Supabase with a local JSON database.
- Do not expose a service-role key in frontend code.
- Do not overwrite `index.html` with a full generated file without a backup/checkpoint.
- Do not change `students.id = profiles.id` without redesigning all dependent queries.
- Do not reintroduce `students.profile_id`.
- Do not delete the current registration functions/triggers because the registration workflow depends on them.
- Do not assume a working demo button is a live backend feature.

## 32. Highest-priority remaining work

Priority 1 — restore the splash logo

- keep existing splash timing
- restore Base64 logo `src`
- do not require external `logo.png`
- verify logo appears visually

Priority 2 — connect Admin Students to live registrations

- remove/replace old demo Student Management route
- show pending real requests
- approve/reject through existing RPC
- verify activation

Priority 3 — make Notices live

- trace current demo renderer
- remove overwrite path
- query `public.notices`
- show empty state if no data

Priority 4 — make Fees live

- query current student's `fee_records`
- show payment state from DB
- leave payment itself clearly marked as not connected unless a real gateway is implemented

Priority 5 — live student academic data

- attendance
- marks
- exams
- homework

Priority 6 — create teacher test workflow

- teacher account
- teacher profile/record
- class teacher assignment
- teacher login
- attendance/marks/homework testing

Priority 7 — remove/reclassify demo content

- `NOTICES[]`
- `GALLERY[]`
- `CONTENT{}` demo entries
- fixed dashboard numbers
- demo sheets/toasts

Priority 8 — final security/RLS audit

Inspect actual `USING` and `WITH CHECK` clauses on sensitive tables.

Priority 9 — mobile/PWA-style testing

Keep the single HTML app model and validate it on a phone over local network or a proper hosted environment.

## 33. Suggested division of work for two developers

Developer A — backend/student:

- Supabase/RLS
- student sync
- attendance
- marks
- homework
- fees
- database correctness

Developer B — frontend/admin/teacher:

- Admin UI
- Teacher UI
- Notices UI
- navigation/button wiring
- remove demo rendering
- splash/logo

Shared:

- review
- testing
- release checkpoints

Avoid having both developers edit the same large `index.html` regions at the same time.

## 34. Local development

Current known local setup:

`py -m http.server 5500`

Open:

`http://localhost:5500/`

Keep the CMD/PowerShell window running while testing.

Supabase Auth configuration was previously set to:

Site URL: `http://localhost:5500`

Redirect URL: `http://localhost:5500/**`

Email confirmation for the student registration flow was previously verified to return to the local app.

## 35. Important known harmless console issue

A previous test showed:

`GET http://localhost:5500/favicon.ico 404 (File not found)`

This is a missing favicon request, not the main app/backend failure. It can be fixed later by adding a favicon or changing the head markup.

## 36. Current prototype quality

The app is best described as:

**Real authentication + real student profile/class flow + real Supabase foundation + partially live registration backend + large amount of legacy/demo frontend content.**

It is NOT yet a finished school ERP.

The core student identity pipeline is now a stable success and should be treated as a protected subsystem.

## 37. Recommended first 60-minute handoff plan

1. Clone/open repo.
2. Run local app.
3. Verify student login and live name.
4. Verify Supabase project connection.
5. Fix splash logo without touching authentication.
6. Fix Admin Students live registration view.
7. Test registration -> pending -> approval.
8. Fix Notice data source.
9. Fix Fees data source.
10. Commit/checkpoint.

## 38. Final transfer instruction

The safest mental model for this project is:

`index.html = presentation + many legacy demo behaviors`

`separate JS = real backend integrations`

`Supabase = source of truth`

The long-term goal is to turn the current architecture into:

`Supabase data -> small dedicated JS module -> existing UI`

rather than:

`hardcoded demo array -> UI`

When replacing demo behavior, preserve the existing UI and wire its existing containers to the backend one feature at a time.

## 39. Current known-good checkpoint

At the latest stable point:

- Student login works.
- Student dashboard can display `Kushagra Srivastava` from Supabase.
- Student class/roll pipeline works.
- Logged-out student sync no longer treats a missing session as a fatal error.
- Admin Console opens.
- Registration backend infrastructure exists.
- RLS foundation exists.
- Duplicate registration notification trigger was cleaned up.

Current visible breakages:

- splash logo not visible even though splash background/timing runs
- notice UI still shows demo notices
- fees and other feature panels are not fully live
- many demo values still exist in the main HTML
- teacher workflow cannot be fully tested until teacher data exists
- favicon 404 is harmless but unclean

## 40. One-sentence handoff

**Do not rebuild LFS: preserve the working Supabase authentication/student pipeline, restore the Base64 splash logo, replace legacy demo renderers with live Supabase queries one feature at a time, and always make small reversible changes to the huge `index.html`.**
