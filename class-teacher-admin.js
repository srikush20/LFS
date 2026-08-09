/* LFS — Admin Class Teacher Assignment
   Loaded by the existing frontend. Uses the existing Supabase client when available,
   otherwise loads Supabase with the same public configuration.
*/
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jzclpttnvaycutglohcu.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_d-0ikMYsdmDKILP45TdI1Q_jhmjtxRt';
  let sbPromise;

  async function getClient() {
    if (window.LFS_SUPABASE) return window.LFS_SUPABASE;
    if (window.supabase?.createClient) return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    if (!sbPromise) sbPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
      s.onerror = () => reject(new Error('Could not load Supabase.'));
      document.head.appendChild(s);
    });
    return sbPromise;
  }

  function addStyles() {
    if (document.getElementById('lfs-ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'lfs-ct-styles';
    s.textContent = `
      #lfs-ct-entry{margin:10px 16px;display:none}
      #lfs-ct-entry button{width:100%;padding:12px;border:1px solid var(--line,#D7E6FA);border-radius:13px;background:var(--surface,#fff);color:var(--primary,#1565C0);font-weight:700;cursor:pointer}
      #lfs-ct-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.62);backdrop-filter:blur(5px)}
      #lfs-ct-modal.show{display:flex}
      .lfs-ct-card{width:min(440px,100%);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--ink,#0B2545);border-radius:24px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      .lfs-ct-card h2{margin:0 0 5px;font:800 19px Poppins,sans-serif}.lfs-ct-card p{font-size:11px;color:var(--ink-soft,#4C6178);margin:0 0 14px}.lfs-ct-row{display:flex;gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line,#D7E6FA)}.lfs-ct-row:last-child{border-bottom:0}.lfs-ct-row .info{flex:1;min-width:0}.lfs-ct-row b{display:block;font-size:12px}.lfs-ct-row span{display:block;font-size:10px;color:var(--ink-soft,#4C6178);margin-top:3px}.lfs-ct-row select{max-width:150px;padding:8px;border:1px solid var(--line,#D7E6FA);border-radius:9px;background:var(--bg,#EEF5FF);color:var(--ink,#0B2545)}.lfs-ct-actions{display:flex;gap:8px;margin-top:15px}.lfs-ct-actions button{flex:1;padding:10px;border:0;border-radius:11px;font-weight:700;cursor:pointer}.lfs-ct-save{background:var(--primary,#1565C0);color:#fff}.lfs-ct-close{background:var(--bg-2,#E2EEFC);color:var(--primary,#1565C0)}
    `;
    document.head.appendChild(s);
  }

  function ensureUI() {
    if (document.getElementById('lfs-ct-entry')) return;
    addStyles();
    const entry = document.createElement('div');
    entry.id = 'lfs-ct-entry';
    entry.innerHTML = '<button type="button"><i class="fa-solid fa-user-tie"></i> Class Teacher Assignment</button>';
    entry.querySelector('button').onclick = open;
    const admin = document.getElementById('dash-admin');
    if (admin) {
      const firstSection = admin.querySelector('.sec-title');
      (firstSection?.parentElement || admin).appendChild(entry);
    } else document.body.appendChild(entry);

    const modal = document.createElement('div');
    modal.id = 'lfs-ct-modal';
    modal.innerHTML = `<div class="lfs-ct-card"><h2>Class Teacher Assignment</h2><p>Choose one active teacher for each class section. This teacher will receive student registration requests for that section.</p><div id="lfs-ct-list">Loading…</div><div class="lfs-ct-actions"><button class="lfs-ct-close" type="button">Close</button><button class="lfs-ct-save" type="button">Save assignments</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.lfs-ct-close').onclick = close;
    modal.querySelector('.lfs-ct-save').onclick = save;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  async function verifyAdmin() {
    const sb = await getClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Please log in as Admin.');
    const { data, error } = await sb.from('profiles').select('role,is_active').eq('id', user.id).single();
    if (error) throw error;
    if (data.role !== 'admin' || !data.is_active) throw new Error('Admin access required.');
    return sb;
  }

  async function open() {
    const modal = document.getElementById('lfs-ct-modal');
    modal.classList.add('show');
    const list = document.getElementById('lfs-ct-list');
    list.textContent = 'Loading…';
    try {
      const sb = await verifyAdmin();
      const [{ data: sections, error: se }, { data: teachers, error: te }] = await Promise.all([
        sb.from('class_sections').select('id,section,stream,subject_combination,academic_year,class_teacher_id,classes(name)').order('id'),
        sb.from('teachers').select('id,employee_id,profiles(full_name)').order('id')
      ]);
      if (se) throw se; if (te) throw te;
      const activeTeachers = (teachers || []).filter(t => t.profiles?.full_name);
      if (!sections?.length) { list.textContent = 'No class sections found.'; return; }
      list.innerHTML = '';
      sections.forEach(section => {
        const row = document.createElement('div'); row.className = 'lfs-ct-row';
        const details = [section.section, section.stream, section.subject_combination].filter(Boolean).join(' • ');
        row.innerHTML = `<div class="info"><b>${esc(section.classes?.name || 'Class')} ${esc(details ? '— ' + details : '')}</b><span>${esc(section.academic_year || '')}</span></div>`;
        const select = document.createElement('select'); select.dataset.sectionId = section.id;
        select.innerHTML = '<option value="">No class teacher</option>';
        activeTeachers.forEach(t => {
          const o = document.createElement('option'); o.value = t.id; o.textContent = t.profiles.full_name + (t.employee_id ? ' • ' + t.employee_id : '');
          if (String(t.id) === String(section.class_teacher_id)) o.selected = true;
          select.appendChild(o);
        });
        row.appendChild(select); list.appendChild(row);
      });
    } catch (e) { list.textContent = e.message || 'Could not load assignments.'; console.error(e); }
  }

  async function save() {
    try {
      const sb = await verifyAdmin();
      const selects = [...document.querySelectorAll('#lfs-ct-list select')];
      for (const select of selects) {
        const id = Number(select.dataset.sectionId);
        const teacherId = select.value ? select.value : null;
        const { error } = await sb.from('class_sections').update({ class_teacher_id: teacherId }).eq('id', id);
        if (error) throw error;
      }
      close();
      if (typeof window.toast === 'function') window.toast('Class teacher assignments saved.');
      else alert('Class teacher assignments saved.');
    } catch (e) { console.error(e); if (typeof window.toast === 'function') window.toast(e.message || 'Save failed.'); else alert(e.message || 'Save failed.'); }
  }

  function close() { document.getElementById('lfs-ct-modal')?.classList.remove('show'); }
  function esc(v) { return String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function refreshVisibility() {
    const entry = document.getElementById('lfs-ct-entry');
    const p = window.LFS_CURRENT_PROFILE;
    if (entry) entry.style.display = p?.role === 'admin' && p?.is_active ? '' : 'none';
  }

  function init() {
    ensureUI(); refreshVisibility();
    setInterval(refreshVisibility, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
