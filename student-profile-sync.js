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
    const sb = await getClient();
    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'student' || !profile.is_active) return null;

    const { data: student, error: studentError } = await sb
      .from('students')
      .select('id, admission_number')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return null;

    const { data: assignment, error: assignmentError } = await sb
      .from('student_class_assignments')
      .select('class_section_id, roll_number, academic_year')
      .eq('student_id', student.id)
      .order('academic_year', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignmentError) throw assignmentError;

    let className = '';
    let section = '';
    if (assignment?.class_section_id != null) {
      const { data: classRow, error: classError } = await sb
        .from('classes')
        .select('name, section')
        .eq('id', assignment.class_section_id)
        .maybeSingle();
      if (classError) throw classError;
      className = classRow?.name || '';
      section = classRow?.section || '';
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
      const subtitle = [classText, rollText].filter(Boolean).join(' · ');
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
        if (sub && subtitle) sub.textContent = subtitle;
        if (av) av.textContent = avatar;
      });

      const pfName = document.getElementById('pfName');
      const pfRole = document.getElementById('pfRole');
      const pfAvatar = document.getElementById('pfAvatar');
      if (pfName) pfName.textContent = name;
      if (pfRole) pfRole.textContent = `Student${classText ? ' · ' + classText : ''}`;
      if (pfAvatar) pfAvatar.textContent = avatar;
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

  const originalSetProfileFor = window.setProfileFor;
  if (typeof originalSetProfileFor === 'function') {
    window.setProfileFor = function (role) {
      const result = originalSetProfileFor.apply(this, arguments);
      if (role === 'student') {
        [0, 50, 250, 750].forEach(ms => setTimeout(sync, ms));
      }
      return result;
    };
  }

  const originalShowIdCard = window.showIdCard;
  if (typeof originalShowIdCard === 'function') {
    window.showIdCard = function () {
      const result = originalShowIdCard.apply(this, arguments);
      setTimeout(() => {
        if (!cached) return;
        const idCard = document.querySelector('#sheetBody .idcard');
        if (!idCard) return;
        const body2 = idCard.querySelector('.body2');
        const nameEl = body2?.querySelector('b');
        const infoEl = body2?.querySelector('span');
        if (nameEl) nameEl.textContent = cached.name;
        const classText = cached.className
          ? `Class ${cached.className}${cached.section ? ' · ' + cached.section : ''}`
          : '';
        const rollText = cached.assignment?.roll_number != null ? `Roll No. ${cached.assignment.roll_number}` : '';
        if (infoEl) infoEl.textContent = [classText, rollText].filter(Boolean).join(' · ');
      }, 0);
      return result;
    };
  }

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