/* LFS — Real Student Dashboard Profile Sync
   Loads the authenticated student's real profile/class data and keeps the
   student dashboard, profile card, and digital ID from falling back to demo identity values.
*/
(function () {
  'use strict';

  let cached = null;
  let applying = false;

  async function getClient() {
    if (window.LFS_SUPABASE_READY) {
      return await window.LFS_SUPABASE_READY;
    }

    if (window.LFS_SUPABASE_CLIENT) {
      return window.LFS_SUPABASE_CLIENT;
    }

    throw new Error('Supabase client is not initialized.');
  }

  async function readStudentData() {
    const sb = await getClient();

    console.log('[LFS Student Sync] Starting student data read...');

    const {
      data: { user },
      error: userError
    } = await sb.auth.getUser();

    if (userError) {
      console.error(
        '[LFS Student Sync] Auth Query Error:',
        userError.message,
        userError.details,
        userError.hint
      );

      throw userError;
    }

    if (!user) {
      console.warn(
        '[LFS Student Sync] No authenticated user/session found.'
      );

      return null;
    }

    console.log(
      '[LFS Student Sync] Authenticated user:',
      user.id
    );

    // ---------------------------------------------------------
    // PROFILE
    // ---------------------------------------------------------

    const {
      data: profile,
      error: profileError
    } = await sb
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        '[LFS Student Sync] Profile Query Error:',
        profileError.message,
        profileError.details,
        profileError.hint
      );

      throw profileError;
    }

    if (!profile) {
      console.warn(
        '[LFS Student Sync] Profile not found.'
      );

      return null;
    }

    if (
      profile.role !== 'student' ||
      !profile.is_active
    ) {
      console.warn(
        '[LFS Student Sync] Profile is not an active student:',
        {
          role: profile.role,
          is_active: profile.is_active
        }
      );

      return null;
    }

    console.log(
      '[LFS Student Sync] Profile loaded:',
      profile.full_name
    );

    // ---------------------------------------------------------
    // PARTIAL DATA BASE
    // ---------------------------------------------------------
    // From this point onward, even if the students table or
    // assignment queries fail, we still have the real name.

    const partialData = {
      profile,
      student: null,
      assignment: null,
      className: '',
      section: '',
      name:
        profile.full_name ||
        user.email?.split('@')[0] ||
        'Student'
    };

    // ---------------------------------------------------------
    // STUDENTS
    // ---------------------------------------------------------

    const {
      data: student,
      error: studentError
    } = await sb
      .from('students')
      .select('id, admission_number')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (studentError) {
      console.error(
        '[LFS Student Sync] Query Error:',
        studentError.message,
        studentError.details,
        studentError.hint
      );

      console.warn(
        '[LFS Student Sync] Students query failed. Using profile data only.'
      );

      // IMPORTANT:
      // Cache partial data so future sync() calls don't repeatedly
      // execute the broken students query.
      cached = partialData;

      window.LFS_CURRENT_STUDENT = cached;

      return cached;
    }

    if (!student) {
      console.warn(
        '[LFS Student Sync] No matching student record found for profile:',
        profile.id
      );

      // We still have the real profile name.
      cached = partialData;

      window.LFS_CURRENT_STUDENT = cached;

      return cached;
    }

    partialData.student = student;

    console.log(
      '[LFS Student Sync] Student record loaded:',
      student.id
    );

    // ---------------------------------------------------------
    // STUDENT CLASS ASSIGNMENT
    // ---------------------------------------------------------

    const {
      data: assignment,
      error: assignmentError
    } = await sb
      .from('student_class_assignments')
      .select(
        'id, class_section_id, roll_number, academic_year'
      )
      .eq('student_id', student.id)
      .order('academic_year', {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error(
        '[LFS Student Sync] Query Error:',
        assignmentError.message,
        assignmentError.details,
        assignmentError.hint
      );

      console.warn(
        '[LFS Student Sync] Class assignment query failed. Using profile name only.'
      );

      cached = partialData;

      window.LFS_CURRENT_STUDENT = cached;

      return cached;
    }

    if (!assignment) {
      console.warn(
        '[LFS Student Sync] No class assignment found for student:',
        student.id
      );

      cached = partialData;

      window.LFS_CURRENT_STUDENT = cached;

      return cached;
    }

    partialData.assignment = assignment;

    console.log(
      '[LFS Student Sync] Class assignment loaded:',
      assignment
    );

    // ---------------------------------------------------------
    // CLASS SECTION
    // ---------------------------------------------------------

    if (assignment.class_section_id != null) {
      const {
        data: classSection,
        error: classSectionError
      } = await sb
        .from('class_sections')
        .select(
          'id, section, academic_year, classes(name)'
        )
        .eq(
          'id',
          assignment.class_section_id
        )
        .maybeSingle();

      if (classSectionError) {
        console.error(
          '[LFS Student Sync] Class Section Query Error:',
          classSectionError.message,
          classSectionError.details,
          classSectionError.hint
        );

        console.warn(
          '[LFS Student Sync] Class section could not be loaded. Showing profile name only.'
        );

        cached = partialData;

        window.LFS_CURRENT_STUDENT = cached;

        return cached;
      }

      partialData.className =
        classSection?.classes?.name || '';

      partialData.section =
        classSection?.section || '';

      console.log(
        '[LFS Student Sync] Class section loaded:',
        {
          className: partialData.className,
          section: partialData.section
        }
      );
    }

    // ---------------------------------------------------------
    // COMPLETE DATA
    // ---------------------------------------------------------

    cached = partialData;

    window.LFS_CURRENT_STUDENT = cached;

    console.log(
      '[LFS Student Sync] Student data loaded successfully:',
      cached
    );

    return cached;
  }

  // ---------------------------------------------------------
  // INITIALS
  // ---------------------------------------------------------

  function initials(name) {
    return String(name || 'Student')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(x => x[0])
      .join('')
      .toUpperCase();
  }

  // ---------------------------------------------------------
  // APPLY DATA TO UI
  // ---------------------------------------------------------

  function applyStudentData(data) {
    if (!data || applying) return;

    applying = true;

    try {
      const name =
        data.name || 'Student';

      const classText =
        data.className
          ? `${data.className}${
              data.section
                ? ' · ' + data.section
                : ''
            }`
          : '';

      const rollText =
        data.assignment?.roll_number != null &&
        data.assignment.roll_number !== ''
          ? `Roll No. ${data.assignment.roll_number}`
          : '';

      const subtitle =
        classText || rollText
          ? [classText, rollText]
              .filter(Boolean)
              .join(' · ')
          : 'Class not assigned';

      const avatar =
        initials(name);

      // -------------------------------------------------------
      // STUDENT DASHBOARD
      // -------------------------------------------------------

      const roots = [
        document.getElementById('dash-student'),
        ...document.querySelectorAll('.screen')
      ].filter(Boolean);

      const seen = new Set();

      roots.forEach(root => {
        if (seen.has(root)) return;

        seen.add(root);

        const greet =
          root.querySelector('.greet');

        if (!greet) return;

        const heading =
          greet.querySelector('h2');

        const sub =
          greet.querySelector('p');

        const av =
          greet.querySelector('.avatar');

        if (heading) {
          heading.textContent =
            `Hi, ${name}`;
        }

        if (sub) {
          sub.textContent =
            subtitle;
        }

        if (av) {
          av.textContent =
            avatar;
        }
      });

      // -------------------------------------------------------
      // PROFILE CARD
      // -------------------------------------------------------

      const pfName =
        document.getElementById('pfName');

      const pfRole =
        document.getElementById('pfRole');

      const pfAvatar =
        document.getElementById('pfAvatar');

      if (pfName) {
        pfName.textContent =
          name;
      }

      if (pfRole) {
        pfRole.textContent =
          `Student${
            classText
              ? ' · ' + classText
              : ''
          }`;
      }

      if (pfAvatar) {
        pfAvatar.textContent =
          avatar;
      }

      // -------------------------------------------------------
      // DIGITAL ID CARD
      // -------------------------------------------------------

      if (window.LFS_CURRENT_STUDENT) {
        const idCard =
          document.querySelector(
            '#sheetBody .idcard'
          );

        if (idCard) {
          const body2 =
            idCard.querySelector(
              '.body2'
            );

          const nameEl =
            body2?.querySelector('b');

          const infoEl =
            body2?.querySelector('span');

          if (nameEl) {
            nameEl.textContent =
              name;
          }

          if (infoEl) {
            infoEl.textContent =
              subtitle;
          }
        }
      }

    } finally {
      applying = false;
    }
  }

  // ---------------------------------------------------------
  // SYNC
  // ---------------------------------------------------------

  async function sync() {
    try {
      // IMPORTANT:
      // Once readStudentData() has returned partial data because
      // of a database error, cached will contain that data.
      // Therefore subsequent sync() calls DO NOT repeat the
      // failing Supabase query.

      const data =
        cached ||
        await readStudentData();

      if (!data) {
        console.warn(
          '[LFS Student Sync] No student data available. Keeping neutral UI.'
        );

        return;
      }

      applyStudentData(data);

    } catch (error) {
      console.error(
        '[LFS Student Sync] Sync failed:',
        error.message,
        error.details,
        error.hint
      );
    }
  }

  // ---------------------------------------------------------
  // PUBLIC LOAD FUNCTION
  // ---------------------------------------------------------

  window.LFS_LOAD_STUDENT_PROFILE =
    async function () {
      // Don't unnecessarily re-query if we already
      // have cached data.
      if (!cached) {
        cached =
          await readStudentData();
      }

      if (cached) {
        applyStudentData(cached);
      }

      return cached;
    };

  // ---------------------------------------------------------
  // setProfileFor HOOK
  // ---------------------------------------------------------

  const originalSetProfileFor =
    window.setProfileFor;

  if (
    typeof originalSetProfileFor ===
    'function'
  ) {
    window.setProfileFor =
      function (role) {
        const result =
          originalSetProfileFor.apply(
            this,
            arguments
          );

        if (role === 'student') {
          [0, 50, 250, 750].forEach(
            ms =>
              setTimeout(
                sync,
                ms
              )
          );
        }

        return result;
      };
  }

  // ---------------------------------------------------------
  // DIGITAL ID CARD HOOK
  // ---------------------------------------------------------

  const originalShowIdCard =
    window.showIdCard;

  if (
    typeof originalShowIdCard ===
    'function'
  ) {
    window.showIdCard =
      function () {
        const result =
          originalShowIdCard.apply(
            this,
            arguments
          );

        setTimeout(() => {
          if (!cached) return;

          const idCard =
            document.querySelector(
              '#sheetBody .idcard'
            );

          if (!idCard) return;

          const body2 =
            idCard.querySelector(
              '.body2'
            );

          const nameEl =
            body2?.querySelector('b');

          const infoEl =
            body2?.querySelector('span');

          if (nameEl) {
            nameEl.textContent =
              cached.name ||
              'Student';
          }

          const classText =
            cached.className
              ? `${cached.className}${
                  cached.section
                    ? ' · ' +
                      cached.section
                    : ''
                }`
              : '';

          const rollText =
            cached.assignment
              ?.roll_number != null
              ? `Roll No. ${
                  cached.assignment
                    .roll_number
                }`
              : '';

          if (infoEl) {
            infoEl.textContent =
              [classText, rollText]
                .filter(Boolean)
                .join(' · ') ||
              'Class not assigned';
          }

        }, 0);

        return result;
      };
  }

  // ---------------------------------------------------------
  // START
  // ---------------------------------------------------------

  function start() {
    sync();

    // These are now safe because cached partial data
    // prevents repeated database queries after an error.
    [100, 400, 1000, 2000, 4000]
      .forEach(
        ms =>
          setTimeout(
            sync,
            ms
          )
      );

    const observer =
      new MutationObserver(() => {
        if (cached) {
          applyStudentData(cached);
        }
      });

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
        characterData: true
      }
    );

    window.addEventListener(
      'lfs:student-dashboard-ready',
      sync
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }

})();
