// LFS registration class loader
// Uses the SECURITY DEFINER RPC because new users are not authenticated yet.
(function () {
  'use strict';

  let retryTimer = null;
  let observer = null;
  let lastGoodCount = 0;

  async function loadClasses() {
    const select = document.getElementById('lfs-reg-class');
    if (!select || !window.LFS_SUPABASE_READY) return false;

    try {
      const sb = await window.LFS_SUPABASE_READY();
      const { data, error } = await sb.rpc('get_registration_class_sections');
      if (error) throw error;

      const rows = data || [];
      select.innerHTML = '<option value="">Select class & section</option>';
      rows.forEach(row => {
        const details = [row.section, row.stream, row.subject_combination].filter(Boolean).join(' • ');
        const option = document.createElement('option');
        option.value = row.id;
        option.textContent = details ? `${row.class_name} — ${details}` : row.class_name;
        select.appendChild(option);
      });

      if (rows.length) lastGoodCount = rows.length;
      return rows.length > 0;
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
      if (!ok && attempts < 10) retryTimer = setTimeout(run, 300);
    };
    run();
  }

  function watchRegistrationModal() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const modal = document.getElementById('lfs-register-modal');
      const select = document.getElementById('lfs-reg-class');
      if (!modal?.classList.contains('show') || !select) return;

      // The legacy loader can overwrite the select after our RPC succeeds.
      // If that happens, restore the secure list immediately.
      if (lastGoodCount > 0 && (select.options.length <= 1 || /Could not load classes|Loading classes/i.test(select.options[0]?.textContent || ''))) {
        refreshRegistrationClasses();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    const modal = document.getElementById('lfs-register-modal');
    if (modal?.classList.contains('show')) refreshRegistrationClasses();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchRegistrationModal);
  } else {
    watchRegistrationModal();
  }
})();
