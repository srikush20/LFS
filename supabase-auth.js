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
    const message = String(error?.message || error || 'Login failed.');
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(message)) return 'Please confirm your email before logging in.';
    if (/too many requests/i.test(message)) return 'Too many login attempts. Please wait a moment and try again.';
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
    if (!profile.is_active) throw new Error('Your account is inactive. Please contact the school administrator.');
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

  window.doLogin = realLogin;
  window.doLogout = realLogout;

  const originalShowLogin = window.showLogin;
  if (typeof originalShowLogin === 'function') {
    window.showLogin = function (role) {
      window.LFS_EXPECTED_ROLE = role;
      originalShowLogin(role);
      prepareLoginUI();
    };
  }

  window.LFS_SUPABASE_READY = loadSupabase();
  window.LFS_SUPABASE_READY.then(() => {
    prepareLoginUI();
    restoreSession();
  }).catch(error => console.error('LFS Supabase initialization failed:', error));
})();
