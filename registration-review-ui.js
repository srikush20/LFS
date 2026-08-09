// LFS registration notification + approval UI
(function () {
  if (typeof window === 'undefined') return;

  function client() {
    if (!window.LFS_SUPABASE) throw new Error('Supabase client is not initialized.');
    return window.LFS_SUPABASE;
  }

  async function currentProfile() {
    const { data: { user } } = await client().auth.getUser();
    if (!user) return null;
    const { data, error } = await client().from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    return data;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  function closeStudentManagement() {
    document.getElementById('lfs-student-management')?.remove();
  }

  async function renderStudentManagement() {
    const profile = await currentProfile();
    if (!profile || profile.role !== 'admin') return;

    const requests = await window.LFS_APPROVAL.getPendingRegistrationRequests();
    const allowed = requests.filter(r => r.requested_role === 'student');

    let panel = document.getElementById('lfs-student-management');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'lfs-student-management';
      panel.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--bg,#071627);color:var(--ink,#EAF2FC);overflow:auto;font-family:Inter,Arial,sans-serif;padding:20px 16px 32px;';
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div style="max-width:620px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <button id="lfs-student-back" style="width:42px;height:42px;border-radius:12px;background:var(--surface,#0F2A44);color:var(--primary,#4C8DE0);font-size:18px">←</button>
          <div style="flex:1"><div style="font-size:21px;font-weight:800">Student Management</div><div style="font-size:12px;color:var(--ink-soft,#9BB3CC)">${allowed.length} pending registration${allowed.length === 1 ? '' : 's'}</div></div>
        </div>
        <section style="background:var(--surface,#0F2A44);border:1px solid var(--line,#1C3A57);border-radius:18px;padding:16px;margin-bottom:14px">
          <div style="font-size:15px;font-weight:800;margin-bottom:4px">Pending Registrations</div>
          <div style="font-size:12px;color:var(--ink-soft,#9BB3CC);margin-bottom:12px">Students waiting for school approval.</div>
          ${allowed.length ? allowed.map(r => `
            <article data-request="${r.id}" style="border:1px solid var(--line,#1C3A57);border-radius:14px;padding:13px;margin-top:10px">
              <div style="font-weight:800;font-size:14px">${esc(r.full_name)}</div>
              <div style="font-size:12px;color:var(--ink-soft,#9BB3CC);margin-top:4px">${esc(r.email)}</div>
              <div style="font-size:12px;margin-top:6px">Class: ${esc(r.class_sections?.classes?.name || '—')} · Section: ${esc(r.class_sections?.section || '—')} · Roll: ${esc(r.roll_number || '—')}</div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button data-approve="${r.id}" style="flex:1;padding:10px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">Approve</button>
                <button data-reject="${r.id}" style="flex:1;padding:10px;border:0;border-radius:10px;background:#dc2626;color:#fff;font-weight:700;cursor:pointer">Reject</button>
              </div>
            </article>`).join('') : '<div style="padding:18px 4px;text-align:center;color:var(--ink-soft,#9BB3CC)">No pending student registrations.</div>'}
        </section>
        <section style="background:var(--surface,#0F2A44);border:1px solid var(--line,#1C3A57);border-radius:18px;padding:16px">
          <div style="font-size:15px;font-weight:800">Student records</div>
          <div style="font-size:12px;color:var(--ink-soft,#9BB3CC);margin-top:4px">Existing approved student records will be connected here next. The pending approval workflow above is live now.</div>
        </section>
      </div>`;

    document.getElementById('lfs-student-back').onclick = closeStudentManagement;

    panel.querySelectorAll('[data-approve]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try {
        await window.LFS_APPROVAL.reviewRegistrationRequest(Number(btn.dataset.approve), 'approve');
        await renderStudentManagement();
      } catch (e) {
        alert(e.message || 'Approval failed.');
        btn.disabled = false;
      }
    });

    panel.querySelectorAll('[data-reject]').forEach(btn => btn.onclick = async () => {
      const reason = prompt('Reason for rejection (optional):') || '';
      btn.disabled = true;
      try {
        await window.LFS_APPROVAL.reviewRegistrationRequest(Number(btn.dataset.reject), 'reject', reason);
        await renderStudentManagement();
      } catch (e) {
        alert(e.message || 'Rejection failed.');
        btn.disabled = false;
      }
    });
  }

  function interceptStudentManagementClick(e) {
    let target = e.target.closest('[data-detail="studentmgmt"]');

    // Fallback for the existing Admin UI: some versions of the large HTML do not
    // expose the student-management item with a data-detail attribute.
    if (!target) {
      const candidate = e.target.closest('.list-row, .mini-card, button, a, [role="button"]');
      if (candidate && /student\s+management/i.test(candidate.textContent || '')) {
        target = candidate;
      }
    }

    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    renderStudentManagement().catch(err => {
      console.error('LFS student management failed:', err);
      alert(err.message || 'Could not load student management.');
    });
  }

  async function renderRegistrationReviewPanel() {
    const profile = await currentProfile();
    if (!profile || !['admin', 'teacher'].includes(profile.role)) return;

    const requests = await window.LFS_APPROVAL.getPendingRegistrationRequests();
    const notifications = await window.LFS_APPROVAL.getMyNotifications();

    let panel = document.getElementById('lfs-registration-review-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'lfs-registration-review-panel';
      panel.style.cssText = 'position:fixed;right:20px;bottom:20px;width:min(460px,calc(100vw - 40px));max-height:75vh;overflow:auto;z-index:99999;background:#fff;border:1px solid #dbe3ef;border-radius:16px;box-shadow:0 12px 40px rgba(15,23,42,.2);padding:18px;font-family:Arial,sans-serif;';
      document.body.appendChild(panel);
    }

    const allowed = requests.filter(r => {
      if (profile.role === 'admin') return true;
      return r.requested_role === 'student' && r.class_sections?.class_teacher_id === profile.id;
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">
        <div><strong style="font-size:18px">Registration Requests</strong><div style="font-size:12px;color:#64748b">${allowed.length} pending · ${notifications.filter(n=>!n.is_read).length} unread</div></div>
        <button id="lfs-review-close" style="border:0;background:transparent;font-size:20px;cursor:pointer">×</button>
      </div>
      ${allowed.length ? allowed.map(r => `
        <article data-request="${r.id}" style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:10px 0">
          <div style="font-weight:700">${esc(r.full_name)}</div>
          <div style="font-size:13px;color:#475569;margin:4px 0">${esc(r.email)} · ${esc(r.requested_role)}</div>
          ${r.requested_role === 'student' ? `<div style="font-size:13px">Class: ${esc(r.class_sections?.classes?.name || '')} ${esc(r.class_sections?.section || '')} · Roll: ${esc(r.roll_number || '—')}</div>` : `<div style="font-size:13px">Employee ID: ${esc(r.employee_id || '—')}</div>`}
          <div style="display:flex;gap:8px;margin-top:10px">
            <button data-approve="${r.id}" style="flex:1;padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;cursor:pointer">Approve</button>
            <button data-reject="${r.id}" style="flex:1;padding:8px;border:0;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer">Reject</button>
          </div>
        </article>`).join('') : '<div style="padding:18px;text-align:center;color:#64748b">No pending requests.</div>'}
      <div style="margin-top:14px;font-size:12px;color:#64748b">Notifications</div>
      ${notifications.slice(0,5).map(n=>`<div data-notification="${n.id}" style="padding:8px 0;border-bottom:1px solid #f1f5f9;${n.is_read?'':'font-weight:700'}">${esc(n.title)}<br><span style="font-weight:400">${esc(n.message)}</span></div>`).join('')}
    `;

    document.getElementById('lfs-review-close').onclick = () => panel.remove();
    panel.querySelectorAll('[data-approve]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try { await window.LFS_APPROVAL.reviewRegistrationRequest(Number(btn.dataset.approve), 'approve'); await renderRegistrationReviewPanel(); }
      catch (e) { alert(e.message || 'Approval failed.'); btn.disabled = false; }
    });
    panel.querySelectorAll('[data-reject]').forEach(btn => btn.onclick = async () => {
      const reason = prompt('Reason for rejection (optional):') || '';
      btn.disabled = true;
      try { await window.LFS_APPROVAL.reviewRegistrationRequest(Number(btn.dataset.reject), 'reject', reason); await renderRegistrationReviewPanel(); }
      catch (e) { alert(e.message || 'Rejection failed.'); btn.disabled = false; }
    });
  }

  function subscribeRealtime() {
    const sb = client();
    const channel = sb.channel('lfs-registration-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, async () => {
        try { await renderRegistrationReviewPanel(); if (document.getElementById('lfs-student-management')) await renderStudentManagement(); } catch (e) { console.error('LFS realtime notification refresh failed:', e); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_requests' }, async () => {
        try { await renderRegistrationReviewPanel(); if (document.getElementById('lfs-student-management')) await renderStudentManagement(); } catch (e) { console.error('LFS realtime request refresh failed:', e); }
      })
      .subscribe();
    return channel;
  }

  window.LFS_REGISTRATION_REVIEW = {
    render: renderRegistrationReviewPanel,
    renderStudentManagement,
    subscribeRealtime
  };

  document.addEventListener('click', interceptStudentManagementClick, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        renderRegistrationReviewPanel().catch(() => {});
        try { subscribeRealtime(); } catch (_) {}
      }, 500);
    });
  } else {
    setTimeout(() => {
      renderRegistrationReviewPanel().catch(() => {});
      try { subscribeRealtime(); } catch (_) {}
    }, 500);
  }
})();
