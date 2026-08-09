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
        try { await renderRegistrationReviewPanel(); } catch (e) { console.error('LFS realtime notification refresh failed:', e); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_requests' }, async () => {
        try { await renderRegistrationReviewPanel(); } catch (e) { console.error('LFS realtime request refresh failed:', e); }
      })
      .subscribe();
    return channel;
  }

  window.LFS_REGISTRATION_REVIEW = {
    render: renderRegistrationReviewPanel,
    subscribeRealtime
  };

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
