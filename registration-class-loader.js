// LFS registration class loader
// Uses the SECURITY DEFINER RPC because new users are not authenticated yet.
(function () {
  'use strict';

  let retryTimer = null;

  async function loadClasses() {
    const select = document.getElementById('lfs-reg-class');
    if (!select || !window.LFS_SUPABASE_READY) return false;

    try {
      const sb = await window.LFS_SUPABASE_READY();
      const { data, error } = await sb.rpc('get_registration_class_sections');
      if (error) throw error;

      select.innerHTML = '<option value="">Select class & section</option>';
      (data || []).forEach(row => {
        const details = [row.section, row.stream, row.subject_combination].filter(Boolean).join(' • ');
        const option = document.createElement('option');
        option.value = row.id;
        option.textContent = details ? `${row.class_name} — ${details}` : row.class_name;
        select.appendChild(option);
      });

      if (!data || data.length === 0) {
        select.innerHTML = '<option value="">No classes available</option>';
      }
      return true;
    } catch (error) {
      console.error('LFS registration class RPC error:', error);
      return false;
    }
  }

  function refreshRegistrationClasses() {
    clearTimeout(retryTimer);
    let attempts = 0;
    const run = async () => {
      attempts += 1;
      const ok = await loadClasses();
      if (!ok && attempts < 5) retryTimer = setTimeout(run, 300);
    };
    run();
  }

  function watchRegistrationModal() {
    const observer = new MutationObserver(() => {
      const modal = document.getElementById('lfs-register-modal');
      if (modal?.classList.contains('show')) refreshRegistrationClasses();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

    const modal = document.getElementById('lfs-register-modal');
    if (modal?.classList.contains('show')) refreshRegistrationClasses();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchRegistrationModal);
  } else {
    watchRegistrationModal();
  }
})();
