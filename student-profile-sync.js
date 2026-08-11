/* LFS — Real Student Dashboard Profile Sync
   Loads the authenticated student's real profile/class data and keeps the
   student dashboard, profile card, and digital ID from falling back to demo identity values.
*/
(function () {
  'use strict';

  let cached = null;
  let applying = false;

  async function getClient() {
    if (window.LFS_SUPABASE_READY) return await window.LFS_SUPABASE_READY;
    if (window.LFS_SUPABASE_CLIENT) return window.LFS_SUPABASE_CLIENT;
    throw new Error('Supabase client is not initialized.');
  }

async function readStudentData() {
  console.log('[LFS Student Sync] Starting student data read...');

  let sb;

  try {
    sb = await getClient();
    console.log('[LFS Student Sync] Supabase client ready.');
  } catch (error) {
    console.warn('[LFS Student Sync] Supabase client unavailable:', error);
    return null;
  }

  const { data: { user }, error: userError } = await sb.auth.getUser();

  if (userError) {
    if (
      userError.name === 'AuthSessionMissingError' ||
      userError.message?.toLowerCase().includes('auth session missing')
    ) {
      console.warn(
        '[LFS Student Sync] No Supabase auth session found. User is not logged in.'
      );
      return null;
    }

    console.error(
      '[LFS Student Sync] Failed while getting authenticated user:',
      userError
    );
    throw userError;
  }

  if (!user) {
    console.warn('[LFS Student Sync] No authenticated user found.');
    return null;
  }

  console.log('[LFS Student Sync] Authenticated user:', user.id);

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      '[LFS Student Sync] profiles query failed:',
      profileError
    );
    throw profileError;
  }

  if (!profile) {
    console.warn('[LFS Student Sync] Profile not found.');
    return null;
  }

  if (profile.role !== 'student') {
    console.warn(
      '[LFS Student Sync] Profile is not a student. Role:',
      profile.role
    );
    return null;
  }

  if (!profile.is_active) {
    console.warn('[LFS Student Sync] Student profile is inactive.');
    return null;
  }

  console.log('[LFS Student Sync] Student profile found:', profile.full_name);

  const { data: student, error: studentError } = await sb
    .from('students')
    .select('id, admission_number')
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (studentError) {
    console.error(
      '[LFS Student Sync] students query failed:',
      studentError
    );
    throw studentError;
  }

  if (!student) {
    console.warn(
      '[LFS Student Sync] No matching student record found for profile:',
      profile.id
    );
    return null;
  }

  console.log('[LFS Student Sync] Student record found:', student.id);

  const { data: assignment, error: assignmentError } = await sb
    .from('student_class_assignments')
    .select('id, class_section_id, roll_number, academic_year')
    .eq('student_id', student.id)
    .order('academic_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    console.error(
      '[LFS Student Sync] student_class_assignments query failed:',
      assignmentError
    );
    throw assignmentError;
  }

  if (!assignment) {
    console.warn(
      '[LFS Student Sync] No class assignment found for student:',
      student.id
    );
  } else {
    console.log(
      '[LFS Student Sync] Class assignment found:',
      assignment
    );
  }

  let className = '';
  let section = '';

  if (assignment?.class_section_id != null) {
    const { data: classSection, error: classSectionError } = await sb
      .from('class_sections')
      .select('id, section, academic_year, classes(name)')
      .eq('id', assignment.class_section_id)
      .maybeSingle();

    if (classSectionError) {
      console.error(
        '[LFS Student Sync] class_sections query failed:',
        classSectionError
      );
      throw classSectionError;
    }

    if (!classSection) {
      console.warn(
        '[LFS Student Sync] No matching class section found:',
        assignment.class_section_id
      );
    } else {
      className = classSection?.classes?.name || '';
      section = classSection?.section || '';

      console.log(
        '[LFS Student Sync] Class section loaded:',
        className,
        section
      );
    }
  }

  cached = {
    profile,
    student,
    assignment,
    className,
    section,
    name: profile.full_name || user.email?.split('@')[0] || 'Student'
  };

  window.LFS_CURRENT_STUDENT = cached;

  console.log('[LFS Student Sync] Student data loaded successfully:', cached);

  return cached;
}
  function initials(name) {
    return String(name || 'Student').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  function applyStudentData(data) {
    if (!data || applying) return;
    applying = true;
    try {
      const name = data.name;
      const classText = data.className
        ? `Class ${data.className}${data.section ? ' · ' + data.section : ''}`
        : '';
      const rollText = data.assignment?.roll_number != null && data.assignment.roll_number !== ''
        ? `Roll No. ${data.assignment.roll_number}`
        : '';
      const subtitle = classText || rollText
        ? [classText, rollText].filter(Boolean).join(' · ')
        : 'Class not assigned';
      const avatar = initials(name);

      const roots = [
        document.getElementById('dash-student'),
        ...document.querySelectorAll('.screen')
      ].filter(Boolean);

      const seen = new Set();
      roots.forEach(root => {
        if (seen.has(root)) return;
        seen.add(root);
        const greet = root.querySelector('.greet');
        if (!greet) return;
        const heading = greet.querySelector('h2');
        const sub = greet.querySelector('p');
        const av = greet.querySelector('.avatar');
        if (heading) heading.textContent = `Hi, ${name}`;
        if (sub) sub.textContent = subtitle;
        if (av) av.textContent = avatar;
      });

      const pfName = document.getElementById('pfName');
      const pfRole = document.getElementById('pfRole');
      const pfAvatar = document.getElementById('pfAvatar');
      if (pfName) pfName.textContent = name;
      if (pfRole) pfRole.textContent = `Student${classText ? ' · ' + classText : ''}`;
      if (pfAvatar) pfAvatar.textContent = avatar;

      if (window.LFS_CURRENT_STUDENT) {
        const idCard = document.querySelector('#sheetBody .idcard');
        if (idCard) {
          const body2 = idCard.querySelector('.body2');
          const nameEl = body2?.querySelector('b');
          const infoEl = body2?.querySelector('span');
          if (nameEl) nameEl.textContent = name;
          if (infoEl) infoEl.textContent = subtitle;
        }
      }
    } finally {
      applying = false;
    }
  }

  async function sync() {
    try {
      const data = cached || await readStudentData();
      applyStudentData(data);
    } catch (error) {
      console.error('LFS student dashboard sync error:', error);
    }
  }

  window.LFS_LOAD_STUDENT_PROFILE = async function () {
    cached = await readStudentData();
    applyStudentData(cached);
    return cached;
  };

  function start() {
    sync();
    [100, 400, 1000, 2000, 4000].forEach(ms => setTimeout(sync, ms));

    const observer = new MutationObserver(() => {
      if (cached) applyStudentData(cached);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener('lfs:student-dashboard-ready', sync);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
