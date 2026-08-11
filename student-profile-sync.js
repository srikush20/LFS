/* LFS — Real Student Dashboard Profile Sync
   Uses the real Supabase relationship:
   profiles.id = students.id = auth.uid()
   students.id -> student_class_assignments.student_id
   student_class_assignments.class_section_id -> class_sections.id
   class_sections.class_id -> classes.id

   IMPORTANT: this file owns ONLY student-specific UI.
   It must never overwrite teacher/admin dashboard greetings or profile data.
*/
(function () {
  'use strict';

  let cached = null;
  let started = false;
  let authListenerAttached = false;

  async function getClient() {
    if (window.LFS_SUPABASE_READY) return await window.LFS_SUPABASE_READY;
    if (window.LFS_SUPABASE_CLIENT) return window.LFS_SUPABASE_CLIENT;
    throw new Error('Supabase client is not initialized.');
  }

  function initials(name) {
    return String(name || 'Student')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'ST';
  }

  function getStudentGreeting() {
    return document.querySelector('#dash-student .greet');
  }

  function neutralStudentUI() {
    const greet = getStudentGreeting();
    if (greet) {
      const heading = greet.querySelector('h2');
      const sub = greet.querySelector('p');
      const avatar = greet.querySelector('.avatar');
      if (heading) heading.textContent = 'Hi, Student';
      if (sub) sub.textContent = 'Class not assigned';
      if (avatar) avatar.textContent = '--';
    }

    const role = window.LFS_CURRENT_PROFILE?.role;
    if (role && role !== 'student') return;

    const pfName = document.getElementById('pfName');
    const pfRole = document.getElementById('pfRole');
    const pfAvatar = document.getElementById('pfAvatar');
    if (pfName) pfName.textContent = 'Student';
    if (pfRole) pfRole.textContent = 'Student';
    if (pfAvatar) pfAvatar.textContent = '--';
  }

  function applyStudentData(data) {
    if (!data) {
      neutralStudentUI();
      return;
    }

    const name = data.name || data.profile?.full_name || 'Student';
    const classText = data.className
      ? `${data.className}${data.section ? ' · ' + data.section : ''}`
      : '';
    const rollText = data.assignment?.roll_number != null && data.assignment.roll_number !== ''
      ? `Roll No. ${data.assignment.roll_number}`
      : '';
    const subtitle = [classText, rollText].filter(Boolean).join(' · ') || 'Class not assigned';
    const avatar = initials(name);

    const greet = getStudentGreeting();
    if (greet) {
      const heading = greet.querySelector('h2');
      const sub = greet.querySelector('p');
      const av = greet.querySelector('.avatar');
      if (heading) heading.textContent = `Hi, ${name}`;
      if (sub) sub.textContent = subtitle;
      if (av) av.textContent = avatar;
    }

    const pfName = document.getElementById('pfName');
    const pfRole = document.getElementById('pfRole');
    const pfAvatar = document.getElementById('pfAvatar');
    if (pfName) pfName.textContent = name;
    if (pfRole) pfRole.textContent = `Student${classText ? ' · ' + classText : ''}`;
    if (pfAvatar) pfAvatar.textContent = avatar;

    const idCard = document.querySelector('#sheetBody .idcard');
    if (idCard) {
      const body = idCard.querySelector('.body2');
      const nameEl = body?.querySelector('b');
      const infoEl = body?.querySelector('span');
      if (nameEl) nameEl.textContent = name;
      if (infoEl) infoEl.textContent = subtitle;
    }
  }

  async function readStudentData() {
    const sb = await getClient();
    console.log('[LFS Student Sync] Starting student data read...');

    const { data: { session } = {}, error: sessionError } = await sb.auth.getSession();

    if (sessionError) {
      console.warn('[LFS Student Sync] Auth session query failed; skipping until authentication is available:', sessionError.message);
      return null;
    }

    const user = session?.user;

    if (!user) {
      console.log('[LFS Student Sync] No active session — skipping student sync.');
      return null;
    }

    console.log('[LFS Student Sync] Authenticated user:', user.id);

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[LFS Student Sync] Profile Query Error:', profileError.message, profileError.details, profileError.hint);
      return null;
    }

    if (!profile) {
      console.warn('[LFS Student Sync] Profile not found.');
      return null;
    }

    if (profile.role !== 'student' || !profile.is_active) {
      console.log('[LFS Student Sync] Skipping non-student/inactive profile:', {
        role: profile.role,
        is_active: profile.is_active
      });
      return null;
    }

    window.LFS_CURRENT_PROFILE = profile;

    const partial = {
      profile,
      student: null,
      assignment: null,
      className: '',
      section: '',
      name: profile.full_name || user.email?.split('@')[0] || 'Student'
    };

    console.log('[LFS Student Sync] Profile loaded:', partial.name);

    const { data: student, error: studentError } = await sb
      .from('students')
      .select('id, admission_number')
      .eq('id', profile.id)
      .maybeSingle();

    if (studentError) {
      console.error('[LFS Student Sync] Students Query Error:', studentError.message, studentError.details, studentError.hint);
      console.warn('[LFS Student Sync] Using profile data only; student lookup failed.');
      cached = partial;
      window.LFS_CURRENT_STUDENT = cached;
      return cached;
    }

    if (!student) {
      console.warn('[LFS Student Sync] No student record found for profile:', profile.id);
      cached = partial;
      window.LFS_CURRENT_STUDENT = cached;
      return cached;
    }

    partial.student = student;
    console.log('[LFS Student Sync] Student record loaded:', student.id);

    const { data: assignment, error: assignmentError } = await sb
      .from('student_class_assignments')
      .select('id, class_section_id, roll_number, academic_year')
      .eq('student_id', student.id)
      .order('academic_year', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error('[LFS Student Sync] Assignment Query Error:', assignmentError.message, assignmentError.details, assignmentError.hint);
      console.warn('[LFS Student Sync] Using profile/student data only; assignment lookup failed.');
      cached = partial;
      window.LFS_CURRENT_STUDENT = cached;
      return cached;
    }

    if (!assignment) {
      console.warn('[LFS Student Sync] No class assignment found for student:', student.id);
      cached = partial;
      window.LFS_CURRENT_STUDENT = cached;
      return cached;
    }

    partial.assignment = assignment;
    console.log('[LFS Student Sync] Assignment loaded:', assignment);

    if (assignment.class_section_id != null) {
      const { data: classSection, error: classSectionError } = await sb
        .from('class_sections')
        .select('id, section, academic_year, classes(name)')
        .eq('id', assignment.class_section_id)
        .maybeSingle();

      if (classSectionError) {
        console.error('[LFS Student Sync] Class Section Query Error:', classSectionError.message, classSectionError.details, classSectionError.hint);
        console.warn('[LFS Student Sync] Using profile/student/assignment data only.');
        cached = partial;
        window.LFS_CURRENT_STUDENT = cached;
        return cached;
      }

      partial.className = classSection?.classes?.name || '';
      partial.section = classSection?.section || '';
      console.log('[LFS Student Sync] Class section loaded:', {
        className: partial.className,
        section: partial.section
      });
    }

    cached = partial;
    window.LFS_CURRENT_STUDENT = cached;
    console.log('[LFS Student Sync] Student data loaded successfully:', cached);
    return cached;
  }

  async function sync(force = false) {
    try {
      const data = force ? await readStudentData() : (cached || await readStudentData());
      cached = data || null;
      if (cached) {
        window.LFS_CURRENT_STUDENT = cached;
        applyStudentData(cached);
      } else {
        window.LFS_CURRENT_STUDENT = null;
        neutralStudentUI();
      }
      return cached;
    } catch (error) {
      console.error('[LFS Student Sync] Sync failed:', error.message, error.details, error.hint);
      return cached;
    }
  }

  window.LFS_LOAD_STUDENT_PROFILE = function () {
    return sync(true);
  };

  function attachHooks() {
    if (typeof window.setProfileFor === 'function' && !window.setProfileFor.__lfsStudentSyncWrapped) {
      const original = window.setProfileFor;
      const wrapped = function (role) {
        const result = original.apply(this, arguments);
        if (role === 'student') setTimeout(() => sync(true), 0);
        return result;
      };
      wrapped.__lfsStudentSyncWrapped = true;
      window.setProfileFor = wrapped;
    }

    if (typeof window.showIdCard === 'function' && !window.showIdCard.__lfsStudentSyncWrapped) {
      const original = window.showIdCard;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        setTimeout(() => {
          if (cached) applyStudentData(cached);
        }, 0);
        return result;
      };
      wrapped.__lfsStudentSyncWrapped = true;
      window.showIdCard = wrapped;
    }
  }

  async function attachAuthListener() {
    if (authListenerAttached) return;
    try {
      const sb = await getClient();
      if (!sb?.auth?.onAuthStateChange) return;

      sb.auth.onAuthStateChange((event, session) => {
        console.log('[LFS Student Sync] Auth state changed:', event);

        if (!session?.user) {
          cached = null;
          window.LFS_CURRENT_STUDENT = null;
          neutralStudentUI();
          return;
        }

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
          setTimeout(() => sync(true), 0);
        }
      });

      authListenerAttached = true;
    } catch (error) {
      console.error('[LFS Student Sync] Auth listener setup failed:', error);
    }
  }

  async function start() {
    if (started) return;
    started = true;
    attachHooks();
    neutralStudentUI();
    await attachAuthListener();
    await sync(false);

    setTimeout(attachHooks, 250);
    setTimeout(attachHooks, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
