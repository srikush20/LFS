/* LFS — Supabase Authentication Integration
   Uses the browser-safe publishable key only.
   Do not place a Supabase secret/service-role key in this file.
*/
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jzclpttnvaycutglohcu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_d-0ikMYsdmDKILP45TdI1Q_jhmjtxRt';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  let client = null;
  let clientPromise = null;

  function loadSupabase() {
    if (client) return Promise.resolve(client);
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        resolve(client);
        return;
      }
      const script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.async = true;
      script.onload = () => {
        try {
          client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
          });
          resolve(client);
        } catch (error) { reject(error); }
      };
      script.onerror = () => reject(new Error('Could not load Supabase JavaScript library.'));
      document.head.appendChild(script);
    });
    return clientPromise;
  }

  function setLoggedInRole(role) {
    try { loggedInRole = role; } catch (_) { window.loggedInRole = role; }
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || error || 'Authentication failed.');
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(message)) return 'Please confirm your email before logging in.';
    if (/user already registered|already registered/i.test(message)) return 'An account with this email already exists.';
    if (/too many requests/i.test(message)) return 'Too many attempts. Please wait a moment and try again.';
    if (/password.*6 characters/i.test(message)) return 'Password must be at least 6 characters.';
    return message;
  }

  function getLoginValues() {
    return {
      email: document.getElementById('idInput')?.value.trim() || '',
      password: document.getElementById('passInput')?.value || ''
    };
  }

  async function loadProfileAndRoute(user, expectedRole) {
    const sb = await loadSupabase();
    const { data: profile, error } = await sb.from('profiles')
      .select('id, full_name, email, role, is_active, phone, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile) throw new Error('Your account profile was not found. Please contact the school administrator.');
    if (!profile.is_active) throw new Error('Your account is awaiting school approval.');
    if (expectedRole && profile.role !== expectedRole) {
      throw new Error(`This account is registered as ${profile.role}, not ${expectedRole}. Please choose the correct login role.`);
    }

    setLoggedInRole(profile.role);
    window.LFS_CURRENT_PROFILE = profile;

    const fullName = profile.full_name || user.email?.split('@')[0] || 'User';
    const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(part => part[0].toUpperCase()).join('') || 'U';

    const roleLabels = { student: 'Student', teacher: 'Teacher', admin: 'Administrator' };
    const pfName = document.getElementById('pfName');
    const pfRole = document.getElementById('pfRole');
    const pfAvatar = document.getElementById('pfAvatar');
    if (pfName) pfName.textContent = fullName;
    if (pfRole) pfRole.textContent = roleLabels[profile.role] || profile.role;
    if (pfAvatar) pfAvatar.textContent = initials;

    const dashName = document.querySelector(`#dash-${profile.role} .greet h2`);
    if (dashName) dashName.textContent = profile.role === 'admin' ? 'Admin Console' : `Hi, ${fullName}`;

    if (typeof goScreen === 'function') goScreen('dash-' + profile.role);
    if (profile.role === 'student' && typeof animateRing === 'function') animateRing(0.92);
  }

  async function realLogin() {
    if (typeof authMode !== 'undefined' && authMode === 'otp') {
      toast('OTP login will be connected after email/password authentication is verified.');
      return;
    }

    const { email, password } = getLoginValues();
    const idField = document.getElementById('fieldId');
    const passField = document.getElementById('fieldPass');
    idField?.classList.toggle('invalid', !email);
    passField?.classList.toggle('invalid', !password);
    if (!email || !password) return;

    const overlay = document.getElementById('loading-ov');
    overlay?.classList.add('show');
    try {
      const sb = await loadSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Authentication succeeded but no user was returned.');

      await loadProfileAndRoute(data.user, window.LFS_EXPECTED_ROLE || null);
      if (typeof launchConfetti === 'function') launchConfetti();
      if (typeof toast === 'function') toast('Welcome back!');
    } catch (error) {
      console.error('LFS Supabase login error:', error);
      if (typeof toast === 'function') toast(friendlyAuthError(error));
    } finally {
      overlay?.classList.remove('show');
    }
  }

  async function submitRegistration({ fullName, email, password, role, classSectionId = null, rollNumber = '', employeeId = '' }) {
    const sb = await loadSupabase();
    if (!fullName || !email || !password || !role) throw new Error('Please complete all required fields.');
    if (!['student', 'teacher'].includes(role)) throw new Error('Only student and teacher registration is available.');
    if (role === 'student' && !classSectionId) throw new Error('Please select your class and section.');

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          requested_role: role,
          class_section_id: classSectionId || null,
          roll_number: rollNumber || null,
          employee_id: employeeId || null
        }
      }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Registration could not be completed.');

    return {
      user: data.user,
      requiresEmailConfirmation: !data.session
    };
  }

  async function realLogout() {
    try {
      const sb = await loadSupabase();
      const { error } = await sb.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('LFS Supabase logout error:', error);
      if (typeof toast === 'function') toast('Logout failed. Please try again.');
      return;
    }
    setLoggedInRole(null);
    window.LFS_CURRENT_PROFILE = null;
    if (typeof goScreen === 'function') goScreen('home');
    if (typeof toast === 'function') toast('Logged out');
  }

  async function restoreSession() {
    try {
      const sb = await loadSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) return;
      const { data: profile, error } = await sb.from('profiles')
        .select('role, is_active').eq('id', session.user.id).maybeSingle();
      if (error || !profile || !profile.is_active) {
        await sb.auth.signOut();
        return;
      }
      setLoggedInRole(profile.role);
      await loadProfileAndRoute(session.user, null);
    } catch (error) {
      console.error('LFS session restore error:', error);
    }
  }

  function prepareLoginUI() {
    const label = document.getElementById('idLabel');
    const input = document.getElementById('idInput');
    if (label) label.textContent = 'Email address';
    if (input) {
      input.type = 'email';
      input.autocomplete = 'username';
      input.placeholder = 'Enter email address';
    }
    const pass = document.getElementById('passInput');
    if (pass) pass.autocomplete = 'current-password';
  }

  function injectRegistrationUI() {
    if (document.getElementById('lfs-register-btn') || !document.getElementById('idInput')) return;

    const style = document.createElement('style');
    style.textContent = `
      #lfs-register-btn{width:100%;margin-top:10px;padding:12px 14px;border-radius:14px;background:var(--surface,#fff);color:var(--primary,#1565C0);border:1.5px solid var(--line,#D7E6FA);font:700 13px Inter,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(13,71,161,.08)}
      #lfs-register-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.6);backdrop-filter:blur(5px)}
      #lfs-register-modal.show{display:flex}
      .lfs-reg-card{width:min(420px,100%);max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--ink,#0B2545);border-radius:24px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      .lfs-reg-card h2{margin:0 0 5px;font:800 20px Poppins,sans-serif}.lfs-reg-card p{margin:0 0 16px;color:var(--ink-soft,#4C6178);font-size:12px}.lfs-reg-card label{display:block;margin:10px 0 5px;font-size:11px;font-weight:700}.lfs-reg-card input,.lfs-reg-card select{width:100%;padding:11px 12px;border:1px solid var(--line,#D7E6FA);border-radius:11px;background:var(--bg,#EEF5FF);color:var(--ink,#0B2545);outline:none}.lfs-reg-actions{display:flex;gap:9px;margin-top:16px}.lfs-reg-actions button{flex:1;padding:11px;border-radius:12px;font-weight:700;cursor:pointer}.lfs-reg-primary{background:linear-gradient(120deg,var(--primary,#1565C0),var(--accent,#42A5F5));color:#fff}.lfs-reg-secondary{background:var(--bg-2,#E2EEFC);color:var(--primary,#1565C0)}.lfs-reg-status{margin-top:12px;font-size:12px;line-height:1.45}
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'lfs-register-btn';
    btn.type = 'button';
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create a new account';
    btn.onclick = openRegistration;

    const passField = document.getElementById('fieldPass');
    const anchor = passField?.parentElement || document.getElementById('passInput')?.parentElement;
    if (anchor?.parentElement) anchor.parentElement.appendChild(btn);
    else document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'lfs-register-modal';
    modal.innerHTML = `
      <div class="lfs-reg-card">
        <h2>Create school account</h2>
        <p>Submit your details. Your account will remain inactive until the school approves your registration.</p>
        <label>Account type</label>
        <select id="lfs-reg-role"><option value="student">Student</option><option value="teacher">Teacher</option></select>
        <label>Full name</label><input id="lfs-reg-name" autocomplete="name" placeholder="Full name">
        <label>Email address</label><input id="lfs-reg-email" type="email" autocomplete="email" placeholder="Email address">
        <label>Password</label><input id="lfs-reg-password" type="password" autocomplete="new-password" placeholder="At least 6 characters">
        <div id="lfs-reg-student-fields">
          <label>Class & section</label><select id="lfs-reg-class"><option value="">Loading classes...</option></select>
          <label>Roll number</label><input id="lfs-reg-roll" placeholder="Roll number">
        </div>
        <div id="lfs-reg-teacher-fields" style="display:none">
          <label>Employee ID</label><input id="lfs-reg-employee" placeholder="Employee ID">
        </div>
        <div id="lfs-reg-status" class="lfs-reg-status"></div>
        <div class="lfs-reg-actions"><button class="lfs-reg-secondary" type="button" id="lfs-reg-cancel">Cancel</button><button class="lfs-reg-primary" type="button" id="lfs-reg-submit">Submit request</button></div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('lfs-reg-cancel').onclick = closeRegistration;
    document.getElementById('lfs-reg-role').onchange = updateRegistrationRole;
    document.getElementById('lfs-reg-submit').onclick = handleRegistrationSubmit;
    modal.addEventListener('click', e => { if (e.target === modal) closeRegistration(); });
  }

  async function loadRegistrationClasses() {
    const select = document.getElementById('lfs-reg-class');
    if (!select) return;
    try {
      const sb = await loadSupabase();
      const { data, error } = await sb.from('class_sections')
        .select('id, section, stream, subject_combination, academic_year, classes(name)')
        .order('id');
      if (error) throw error;
      select.innerHTML = '<option value="">Select class & section</option>';
      (data || []).forEach(row => {
        const className = row.classes?.name || 'Class';
        const details = [row.section, row.stream, row.subject_combination].filter(Boolean).join(' • ');
        const option = document.createElement('option');
        option.value = row.id;
        option.textContent = details ? `${className} — ${details}` : className;
        select.appendChild(option);
      });
      if (!data?.length) select.innerHTML = '<option value="">No classes available</option>';
    } catch (error) {
      console.error('LFS class loading error:', error);
      select.innerHTML = '<option value="">Could not load classes</option>';
    }
  }

  function updateRegistrationRole() {
    const role = document.getElementById('lfs-reg-role')?.value;
    const student = document.getElementById('lfs-reg-student-fields');
    const teacher = document.getElementById('lfs-reg-teacher-fields');
    if (student) student.style.display = role === 'student' ? '' : 'none';
    if (teacher) teacher.style.display = role === 'teacher' ? '' : 'none';
  }

  function openRegistration() {
    const modal = document.getElementById('lfs-register-modal');
    if (!modal) return;
    modal.classList.add('show');
    document.getElementById('lfs-reg-status').textContent = '';
    updateRegistrationRole();
    loadRegistrationClasses();
  }

  function closeRegistration() {
    document.getElementById('lfs-register-modal')?.classList.remove('show');
  }

  async function handleRegistrationSubmit() {
    const status = document.getElementById('lfs-reg-status');
    const submit = document.getElementById('lfs-reg-submit');
    const role = document.getElementById('lfs-reg-role').value;
    const fullName = document.getElementById('lfs-reg-name').value.trim();
    const email = document.getElementById('lfs-reg-email').value.trim();
    const password = document.getElementById('lfs-reg-password').value;
    const classSectionId = document.getElementById('lfs-reg-class').value || null;
    const rollNumber = document.getElementById('lfs-reg-roll').value.trim();
    const employeeId = document.getElementById('lfs-reg-employee').value.trim();

    status.textContent = '';
    submit.disabled = true;
    try {
      const result = await submitRegistration({ fullName, email, password, role, classSectionId, rollNumber, employeeId });
      status.textContent = result.requiresEmailConfirmation
        ? 'Registration submitted. Check your email to confirm it, then wait for school approval.'
        : 'Registration submitted successfully. Your account is waiting for school approval.';
      status.style.color = 'var(--success,#2FA86A)';
      if (typeof toast === 'function') toast('Registration request submitted');
      setTimeout(closeRegistration, 2200);
    } catch (error) {
      console.error('LFS registration error:', error);
      status.textContent = friendlyAuthError(error);
      status.style.color = 'var(--rose,#D64550)';
    } finally {
      submit.disabled = false;
    }
  }

  window.LFS_REGISTER = submitRegistration;
  window.doLogin = realLogin;
  window.doLogout = realLogout;

  const originalShowLogin = window.showLogin;
  if (typeof originalShowLogin === 'function') {
    window.showLogin = function (role) {
      window.LFS_EXPECTED_ROLE = role;
      originalShowLogin(role);
      prepareLoginUI();
      setTimeout(injectRegistrationUI, 0);
    };
  }

  window.LFS_SUPABASE_READY = loadSupabase();
  window.LFS_SUPABASE_READY.then(() => {
    prepareLoginUI();
    restoreSession();
    setTimeout(injectRegistrationUI, 0);
  }).catch(error => console.error('LFS Supabase initialization failed:', error));
})();
