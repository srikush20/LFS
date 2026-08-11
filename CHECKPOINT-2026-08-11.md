# LFS School App — Checkpoint — 2026-08-11

## Current baseline

- Repository: `srikush20/LFS`
- Branch: `main`
- Local prototype: vanilla HTML/CSS/JS served from `localhost:5500`
- Backend: Supabase project `jzclpttnvaycutglohcu`
- Main frontend: `index.html`

## What was already fixed before this checkpoint

- Restored the main `index.html` after an earlier accidental corruption.
- Removed hardcoded demo student identity (`Ananya Singh`, `AS`, Class VIII / Roll 14) from the student dashboard.
- Fixed the `Unexpected token 'async'` syntax error in `student-profile-sync.js` caused by a missing closing brace.
- Fixed the malformed `<script>` tag problem in `index.html`.
- Fixed the student lookup schema mismatch: `students.profile_id` and `students.user_id` do not exist.
- Confirmed the real schema relationship is `profiles.id = students.id`, with `students.id -> student_class_assignments.student_id -> class_sections -> classes`.
- Confirmed the student account data currently in Supabase resolves to Kushagra Srivastava, Class 11th, Section A, Roll 56, academic year 2026-27.
- Confirmed the correct Supabase student queries return HTTP 200.

## New issue discovered from admin dashboard testing

The student synchronization script was using:

```js
document.querySelectorAll('.screen .greet')
```

That selector updates **every dashboard greeting**, not just the student dashboard.

When an admin logged in, `student-profile-sync.js` therefore replaced the admin dashboard greeting with:

```text
Hi, Student
Class not assigned
--
```

This is a frontend ownership/scope bug, not a Supabase schema problem.

## Fix applied in commit

`c55ed4d0558cfbe5386abd7b3ee6c2794dc90021`

### `student-profile-sync.js`

The script now:

- Updates only `#dash-student .greet`.
- Never overwrites teacher/admin dashboard greetings.
- Does not overwrite teacher/admin profile-card data.
- Explicitly skips non-student profiles.
- Keeps the real `students.id = profiles.id` lookup.
- Keeps the successful assignment/class-section lookup.
- Keeps the no-mutation-observer / cached approach to avoid page hangs and request loops.

## Database audit result

Relevant public schema:

```text
profiles
  id uuid PK -> auth.users.id

students
  id uuid PK -> profiles.id
  admission_number text

student_class_assignments
  student_id uuid -> students.id
  class_section_id bigint -> class_sections.id
  academic_year text
  roll_number text

class_sections
  id bigint PK
  class_id bigint -> classes.id
  section text
  stream text
  academic_year text

classes
  id bigint PK
  name text
  academic_year text
```

Current student record:

```text
Kushagra Srivastava
Class: 11th
Section: A
Roll: 56
Academic year: 2026-27
```

Current admin profile exists separately and has role `admin`; it must never be rendered by the student sync script.

## Supabase API verification

Recent logs confirm:

- Auth user lookup: HTTP 200
- Profiles lookup: HTTP 200
- Students lookup using `id=eq.<profile.id>`: HTTP 200
- Student class assignment lookup: HTTP 200
- Class section lookup: HTTP 200

Older HTTP 400 requests using `profile_id` and `user_id` are historical requests from the earlier broken versions and are not the correct current query.

## Security audit — remaining warnings

Supabase security advisors still report warnings around several exposed `SECURITY DEFINER` functions and leaked-password protection being disabled. These are separate from the admin/student dashboard bug and have **not** been changed blindly because they affect registration/admin authorization behavior.

Important functions flagged include:

- `get_registration_class_sections()`
- `handle_new_user()`
- `is_admin()`
- `notify_registration_request()`
- `review_registration_request(...)`
- `assign_class_teacher(...)`
- `rls_auto_enable()`
- `route_registration_request_notifications()`
- `set_updated_at()` search-path warning

These should be audited deliberately before production use.

## Known remaining prototype work

1. Test admin login after the student-sync scope fix.
2. Test student login and verify the student dashboard shows live data.
3. Verify teacher dashboard is not modified by student sync.
4. Verify logout clears only student-owned cached state.
5. Audit remaining browser console warnings/errors after a clean reload.
6. Audit `animateRing` and other optional UI functions separately if they still appear in the console.
7. Audit hardcoded demo statistics/cards and replace them with Supabase-backed values where required for the prototype.
8. Audit dashboard buttons and navigation one role at a time.
9. Review Supabase RLS/security-advisor warnings before treating the prototype as production-ready.

## Safe rollback point

A Git branch was created before the admin-dashboard fix:

`checkpoint-2026-08-11-before-admin-fix`

It points to the previous stable commit:

`6c17bf8b60e834c3aa96441f7aa4d2bcac757ebd`

## Rule for the next debugging session

Do not replace the whole `index.html` or `student-profile-sync.js` again unless the exact reason is established first. Make small, isolated changes, verify the browser console/network result, then move to the next issue.
