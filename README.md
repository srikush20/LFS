# Little Flower School (LFS) App

A vanilla HTML/CSS/JavaScript school-management web application for **Little Flower School, Harraiya**. The app supports separate Student, Teacher, and Admin experiences and uses **Supabase** for authentication, profiles, school data, registration approvals, and future academic modules.

> **Important:** This repository is a working prototype, not a finished production system. Some screens still contain legacy/demo frontend data and must be converted to live Supabase data.

## Repository

- GitHub: `srikush20/LFS`
- Default branch: `main`
- Frontend entry point: `index.html`
- Backend: Supabase project `jzclpttnvaycutglohcu`

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase Auth + Postgres + RLS + Realtime
- Supabase JavaScript client loaded in the browser
- Font Awesome for icons
- Google Fonts (Poppins + Inter)

No framework or build system is required for the current prototype.

## How the App Works

The application is intentionally simple at runtime:

```text
Browser
  |
  v
index.html
  |
  +--> supabase-auth.js
  |      |
  |      +--> Supabase Auth
  |      +--> profiles
  |      +--> role routing
  |
  +--> student-profile-sync.js
  |      |
  |      +--> profiles
  |      +--> students
  |      +--> student_class_assignments
  |      +--> class_sections
  |      +--> classes
  |
  +--> registration / admin modules
         |
         +--> registration_requests
         +--> notifications
         +--> approval RPCs
         +--> Realtime updates

  |
  v
Supabase Postgres + Auth
```

The current frontend is mostly a **single-page, multi-screen application**. Different dashboards are shown/hidden inside `index.html` rather than using a frontend routing framework.

## Important Identity Flow

Supabase Auth identifies the signed-in account. The LFS `profiles` table stores the application identity and role.

For students, the intended database relationship is:

```text
auth.users.id
    =
profiles.id
    =
students.id
    |
    +--> student_class_assignments.student_id
              |
              +--> class_section_id
                       |
                       +--> class_sections.id
                                  |
                                  +--> classes.id
```

This relationship powers the Student Dashboard identity, class/section information, roll number, and digital ID.

## Main Files

### `index.html`

The main application file. It contains:

- Home screen
- Splash screen
- Login UI
- Student dashboard
- Teacher dashboard
- Admin dashboard
- Modals and sheets
- CSS/theme definitions
- A large amount of inline JavaScript
- Some legacy/demo data arrays
- Embedded/Base64 visual assets in older/known-good versions

**Developer warning:** `index.html` is very large. Do not replace the entire file to fix a small feature. Make targeted edits because syntax mistakes in this file can break many unrelated buttons at once.

### `supabase-auth.js`

Responsible for:

- Creating the Supabase client
- Email/password login
- Logout
- Session restoration
- Registration
- Loading `profiles`
- Role validation
- Routing to `dash-student`, `dash-teacher`, or `dash-admin`

The browser uses only the public/publishable Supabase key. Never add a service-role/secret key to frontend code.

Shared client globals include:

```js
window.LFS_SUPABASE
window.LFS_SUPABASE_CLIENT
window.LFS_SUPABASE_READY
window.LFS_CURRENT_PROFILE
```

### `student-profile-sync.js`

Student-only synchronization module.

Responsibilities:

- Wait for the Supabase client
- Read the authenticated session
- Load the student's `profiles` record
- Load the `students` record
- Load the latest `student_class_assignments` row
- Load `class_sections` + joined `classes`
- Populate the student greeting
- Populate profile card
- Populate digital ID
- Keep neutral fallbacks when data is missing
- Cache partial data so one database failure does not continuously spam queries

Important public function:

```js
window.LFS_LOAD_STUDENT_PROFILE()
```

Do not make this module overwrite Teacher or Admin identity.

### `registration-approval.js`

Shared database helpers for registration approvals and notifications.

Exports:

```js
window.LFS_APPROVAL
```

Main operations:

- `getPendingRegistrationRequests()`
- `getMyNotifications()`
- `markNotificationRead(id)`
- `reviewRegistrationRequest(requestId, decision, rejectionReason)`
- `routeRegistrationRequest(request)`

### `registration-review-ui.js`

Creates the live Student/Teacher registration review UI for Admin/authorized Teacher users.

Features:

- Pending registrations
- Approve
- Reject
- Notifications
- Realtime refresh on registration/notification changes
- Student Management panel

### `registration-class-loader.js`

Loads registration class/section choices using the `get_registration_class_sections` RPC.

This keeps the registration form from hardcoding the class list.

### `class-teacher-admin.js`

Admin-only Class Teacher Assignment module.

It loads class sections and available teachers and calls the `assign_class_teacher` RPC to associate a teacher with each section.

### `student-profile-sync-fixed.js`

An older/backup student sync variant retained for troubleshooting/history. Do not automatically load this together with `student-profile-sync.js` unless you intentionally want both.

### `CHECKPOINT-2026-08-11.md`

Previous development checkpoint containing the project status and fixes made during the earlier debugging cycle.

### `LFS-PROJECT-AUDIT-2026-08-13.md`

Detailed project handoff/audit written for another developer. Read this before making major changes.

## Database / Supabase

The Supabase database already has a broad school-management schema, including tables for areas such as:

- `profiles`
- `students`
- `teachers`
- `classes`
- `class_sections`
- `student_class_assignments`
- `subjects`
- `attendance`
- `marks`
- `homework`
- `exams`
- `notices`
- `notifications`
- `fee_records`
- `fee_payments`
- `registration_requests`

The database was designed so that many dashboard modules can become fully live without creating a new frontend framework.

### Security

RLS is enabled on the public tables and the project contains role/record-scoped policies. Continue to audit policy `USING` and `WITH CHECK` clauses before production deployment.

### Registration flow

```text
LFS registration form
        |
        v
Supabase Auth user
        |
        v
automatic registration request
        |
        v
registration_requests (pending)
        |
        v
Admin / authorized reviewer
        |
        +--> approve
        |
        +--> reject
```

A database trigger was added so new Student/Teacher Auth signups can create a pending `registration_requests` row automatically.

## Local Development

Because this is currently a static frontend, you can run it without npm or a build tool.

From the repository folder:

```powershell
py -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

For testing from a phone on the same Wi-Fi:

```powershell
py -m http.server 5500 --bind 0.0.0.0
```

Then open the computer's LAN IP from the phone, for example:

```text
http://192.168.1.25:5500
```

## Git Collaboration

Do not have two developers modify the same large region of `index.html` at the same time.

Recommended split:

**Developer A**
- Supabase/database
- Student dashboard
- Student authentication/data
- Attendance
- Marks
- Fees
- RLS/security

**Developer B**
- Admin dashboard
- Teacher dashboard
- Notices UI
- Navigation/UI
- Removing frontend demo content

Use feature branches:

```bash
git checkout -b feature/name-of-task
git add .
git commit -m "Describe the change"
git push -u origin feature/name-of-task
```

Then open a Pull Request to `main` and review it before merging.

## Current Prototype Status

### Working / established

- Supabase project connected
- Email/password authentication
- Session restoration
- Role-based routing foundation
- Student profile loading
- Student name rendering
- Student class/roll rendering when assignment data exists
- Admin Console routing/loading
- Registration approval modules
- Class/teacher assignment module
- RLS foundation

### Still incomplete / needs live backend wiring

- Notice screen is still affected by legacy demo data
- Fee screen is not yet fully database-driven
- Attendance screen needs complete live data wiring
- Marks/results need complete live data wiring
- Homework needs complete live data wiring
- Exams need complete live data wiring
- Teacher workflow needs real teacher records and testing
- Admin statistics need to be connected to real counts/queries
- Remaining demo/static data should be removed or replaced with honest empty states
- Final RLS/security audit is still required
- Mobile/PWA/production deployment still needs final testing

## Known Splash-Screen Regression

The splash transition still runs, but a regression has affected the logo display.

The known-good version embedded the LFS logo directly as a Base64 image inside the `.splash-badge` `<img>` element. A later change introduced an external `logo.png` reference even though this project is designed to be usable as a single HTML file.

When repairing the splash, restore the embedded Base64 logo reference rather than replacing the entire `index.html`.

## Demo Data Warning

The repository still contains legacy/demo frontend structures such as a `NOTICES` array and a large `CONTENT` object. These are not the long-term source of truth.

The target architecture is:

```text
Supabase database
      |
      v
feature JS module
      |
      v
real UI
```

Do not make the prototype appear live by adding more hardcoded numbers, names, marks, notices, attendance, or fees.

## Debugging Rules

When a new problem appears:

1. Fix the **first** red console error before chasing secondary errors.
2. Fix JavaScript syntax before debugging database queries.
3. Confirm the Supabase client exists before diagnosing feature queries.
4. Confirm the authenticated profile and role.
5. Confirm the database relationship/query.
6. Only then change the UI rendering.
7. Make one targeted change at a time and test immediately.

A single syntax error in `index.html` can make many unrelated buttons stop responding because much of the app's JavaScript lives in that file.

## Safe Development Rules

- Never commit a Supabase service-role/secret key.
- Keep the publishable browser key only in the frontend configuration.
- Do not replace the complete `index.html` for a small fix.
- Do not create a second competing student-sync implementation without a deliberate migration plan.
- Do not change the `profiles.id = students.id = auth.uid()` student identity relationship.
- Do not seed fake production data just to make the UI look complete.
- Prefer migrations/RPCs for important database workflows.
- Verify RLS after adding new tables or policies.

## Project Goal

The final goal is a real school-management platform where:

```text
Student
  -> own academic/profile data

Teacher
  -> assigned classes/students and teaching workflows

Admin
  -> school-wide management and approvals

Supabase
  -> authentication, authorization, database, realtime updates
```

The prototype should remain simple, reliable, and database-driven rather than becoming a collection of hardcoded demo screens.

## Handoff

For a new developer joining the project, read these in order:

1. `README.md` (this file)
2. `LFS-PROJECT-AUDIT-2026-08-13.md`
3. `CHECKPOINT-2026-08-11.md`
4. `supabase-auth.js`
5. `student-profile-sync.js`
6. `registration-approval.js`
7. `registration-review-ui.js`
8. `class-teacher-admin.js`
9. `index.html`

Start with small feature-level changes and keep `main` stable.