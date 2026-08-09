/* LFS — Real Student Dashboard Profile Sync
   Loads the authenticated student's profile and class assignment from Supabase.
   Uses the existing LFS Supabase client readiness promise.
*/
(function () {
  'use strict';

  async function getClient() {
    if (window.LFS_SUPABASE_READY) return await window.LFS_SUPABASE_READY;
    if (window.LFS_SUPABASE_CLIENT) return window.LFS_SUPABASE_CLIENT;
    throw new Error('Supabase client is not initialized.');
  }

  async function loadStudentDashboardProfile() {
    const sb = await getClient();
    const { data: { user }, error: userError } = await sb.auth.getUser();
    if (userError) throw userError;
    if (!user) return;

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'student') return;

    const { data: student, error: studentError } = await sb
      .from('students')
      .select('id, admission_number')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return;

    const { data: assignment, error: assignmentError } = await sb
      .from('student_class_assignments')
      .select('class_section_id, roll_number, academic_year')
      .eq('student_id', student.id)
      .order('academic_year', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assignmentError) throw assignmentError;

    let classLabel = '';
    if (assignment?.class_section_id != null) {
      const { data: classRow, error: classError } = await sb
        .from('classes')
        .select('name, section')
        .eq('id', assignment.class_section_id)
        .maybeSingle();
      if (classError) throw classError;
      if (classRow) classLabel = `${classRow.name || ''}${classRow.section ? ' · ' + classRow.section : ''}`.trim();
    }

    const name = profile.full_name || user.email?.split('@')[0] || 'Student';
    const dash = document.getElementById('dash-student');
    if (!dash) return;

    const greeting = dash.querySelector('.greet h2');
    if (greeting) greeting.textContent = `Hi, ${name}`;

    const greetSub = dash.querySelector('.greet p');
    if (greetSub) {
      const parts = [];
      if (classLabel) parts.push(`Class ${classLabel}`);
      if (assignment?.roll_number != null && assignment.roll_number !== '') parts.push(`Roll No. ${assignment.roll_number}`);
      greetSub.textContent = parts.join(' · ');
    }

    window.LFS_CURRENT_STUDENT = {
      profile,
      student,
      assignment,
      classLabel
    };
  }

  window.LFS_LOAD_STUDENT_PROFILE = loadStudentDashboardProfile;

  function run() {
    loadStudentDashboardProfile().catch(error => {
      console.error('LFS student dashboard sync error:', error);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();