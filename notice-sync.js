/* LFS — Real Supabase Notices Sync
 * Uses public.notices for the school Notice board.
 * Does not modify authentication or student-profile-sync.
 */

(function () {
  'use strict';

  let isFetchingNotices = false;

  const LOG = '[LFS Notices]';

  async function getClient() {
    if (window.LFS_SUPABASE_READY) {
      return await window.LFS_SUPABASE_READY;
    }

    if (window.LFS_SUPABASE_CLIENT) {
      return window.LFS_SUPABASE_CLIENT;
    }

    if (window.LFS_SUPABASE) {
      return window.LFS_SUPABASE;
    }

    throw new Error('Supabase client is not initialized.');
  }

  function getCurrentRole() {
    const profile = window.LFS_CURRENT_PROFILE;

    if (profile && profile.role) {
      return String(profile.role).toLowerCase();
    }

    if (window.LFS_EXPECTED_ROLE) {
      return String(window.LFS_EXPECTED_ROLE).toLowerCase();
    }

    if (window.LFS_CURRENT_ADMIN) {
      return 'admin';
    }

    if (window.LFS_CURRENT_TEACHER) {
      return 'teacher';
    }

    if (window.LFS_CURRENT_STUDENT) {
      return 'student';
    }

    return 'guest';
  }

  function getStudentSectionId() {
    const student = window.LFS_CURRENT_STUDENT;

    if (!student) {
      return null;
    }

    return (
      student.class_section_id ??
      student.classSectionId ??
      student.assignment?.class_section_id ??
      student.assignment?.classSectionId ??
      null
    );
  }

  function getNoticeContainer() {
    const knownIds = [
      'noticeContainer',
      'noticesList',
      'noticeList',
      'notificationsList'
    ];

    for (const id of knownIds) {
      const element = document.getElementById(id);

      if (element) {
        return element;
      }
    }

    const selectors = [
      '.notice-list',
      '.notices-list',
      '.notice-container',
      '[data-notices-container]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  function createMessage(text, type) {
    const element = document.createElement('div');

    element.className = `lfs-notices-state lfs-notices-${type}`;

    element.style.cssText = [
      'padding: 24px',
      'text-align: center',
      'font-size: 14px',
      'color: var(--ink-soft, #777)',
      'font-family: inherit'
    ].join(';');

    if (type === 'error') {
      element.style.color = 'var(--rose, #b42318)';
    }

    element.textContent = text;

    return element;
  }

  function createNoticeCard(notice) {
    const card = document.createElement('article');

    card.className = 'notice-card';

    card.style.cssText = [
      'background: var(--surface, #fff)',
      'padding: 16px',
      'margin-bottom: 12px',
      'border-radius: 12px',
      'border: 1px solid var(--line, #e5e7eb)',
      'box-shadow: 0 2px 6px rgba(0,0,0,.04)'
    ].join(';');

    const title = document.createElement('h4');

    title.style.cssText = [
      'margin: 0 0 7px',
      'font-size: 16px',
      'color: var(--primary-900, inherit)'
    ].join(';');

    title.textContent = notice.title || 'School Notice';

    const content = document.createElement('p');

    content.style.cssText = [
      'margin: 0 0 10px',
      'font-size: 14px',
      'line-height: 1.55',
      'color: var(--ink, inherit)',
      'white-space: pre-wrap'
    ].join(';');

    content.textContent = notice.content || '';

    card.appendChild(title);
    card.appendChild(content);

    const footer = document.createElement('div');

    footer.style.cssText = [
      'display: flex',
      'justify-content: space-between',
      'align-items: center',
      'gap: 10px',
      'flex-wrap: wrap'
    ].join(';');

    const date = document.createElement('small');

    date.style.color = 'var(--ink-soft, #777)';

    const rawDate = notice.published_at || notice.created_at;

    if (rawDate) {
      const parsedDate = new Date(rawDate);

      if (!Number.isNaN(parsedDate.getTime())) {
        date.textContent = parsedDate.toLocaleDateString(
          'en-IN',
          {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          }
        );
      }
    }

    footer.appendChild(date);

    if (notice.attachment_url) {
      const attachment = document.createElement('a');

      attachment.href = notice.attachment_url;
      attachment.target = '_blank';
      attachment.rel = 'noopener noreferrer';
      attachment.textContent = 'View attachment';

      attachment.style.cssText = [
        'font-size: 13px',
        'color: var(--primary, #2563eb)',
        'text-decoration: none',
        'font-weight: 600'
      ].join(';');

      footer.appendChild(attachment);
    }

    card.appendChild(footer);

    return card;
  }

  function noticeMatchesUser(notice) {
    const role = getCurrentRole();
    const sectionId = getStudentSectionId();

    /*
     * Admins can see all published notices.
     */
    if (role === 'admin') {
      return true;
    }

    /*
     * target_role = all is visible to everyone who can read notices.
     */
    const targetRole = String(notice.target_role || 'all').toLowerCase();

    if (targetRole !== 'all' && targetRole !== role) {
      return false;
    }

    /*
     * A class-specific notice should only appear
     * for that student's class section.
     */
    if (role === 'student' && notice.class_section_id != null) {
      if (
        sectionId == null ||
        String(notice.class_section_id) !== String(sectionId)
      ) {
        return false;
      }
    }

    return true;
  }

  async function loadRealNotices() {
    if (isFetchingNotices) {
      return;
    }

    const container = getNoticeContainer();

    if (!container) {
      console.warn(
        `${LOG} Notice container was not found.`
      );
      return;
    }

    isFetchingNotices = true;

    container.replaceChildren(
      createMessage('Loading notices...', 'loading')
    );

    try {
      const sb = await getClient();

      const role = getCurrentRole();

      console.log(
        `${LOG} Loading notices for role:`,
        role
      );

      /*
       * IMPORTANT:
       * General school notices live in public.notices.
       *
       * We deliberately do NOT use public.notifications here.
       */
      const result = await sb
        .from('notices')
        .select(
          'id,title,content,target_role,class_section_id,published_by,is_published,published_at,attachment_url,created_at,updated_at'
        )
        .eq('is_published', true)
        .order('published_at', {
          ascending: false,
          nullsFirst: false
        })
        .order('created_at', {
          ascending: false
        });

      if (result.error) {
        console.error(
          `${LOG} Query Error:`,
          result.error.message,
          result.error.details,
          result.error.hint
        );

        container.replaceChildren(
          createMessage(
            'Failed to load notices. Please try again.',
            'error'
          )
        );

        return;
      }

      const notices = Array.isArray(result.data)
        ? result.data
        : [];

      console.log(
        `${LOG} Published notices received:`,
        notices.length
      );

      const visibleNotices = notices.filter(
        noticeMatchesUser
      );

      console.log(
        `${LOG} Notices visible to current user:`,
        visibleNotices.length
      );

      if (visibleNotices.length === 0) {
        container.replaceChildren(
          createMessage(
            'No notices available at this time.',
            'empty'
          )
        );

        return;
      }

      const fragment = document.createDocumentFragment();

      visibleNotices.forEach(function (notice) {
        fragment.appendChild(
          createNoticeCard(notice)
        );
      });

      container.replaceChildren(fragment);

    } catch (error) {
      console.error(
        `${LOG} Unexpected Error:`,
        error
      );

      container.replaceChildren(
        createMessage(
          'Unable to load notices right now.',
          'error'
        )
      );

    } finally {
      isFetchingNotices = false;
    }
  }

  /*
   * Expose the loader so existing LFS UI code can call:
   *
   * window.loadRealNotices()
   */
  window.loadRealNotices = loadRealNotices;

  /*
   * Try to connect to existing Notice buttons without
   * replacing their existing click behaviour.
   */
  function bindNoticeButtons() {
    const buttons = document.querySelectorAll(
      '[onclick*="Notice"],' +
      '[onclick*="notice"],' +
      '[data-action="notice"],' +
      '[data-action="notices"],' +
      '.btn-notice'
    );

    buttons.forEach(function (button) {
      if (button.dataset.lfsNoticeBound === 'true') {
        return;
      }

      button.dataset.lfsNoticeBound = 'true';

      button.addEventListener(
        'click',
        function () {
          /*
           * Let the existing UI open first.
           */
          setTimeout(function () {
            loadRealNotices();
          }, 0);
        }
      );
    });

    console.log(
      `${LOG} Notice buttons detected:`,
      buttons.length
    );
  }

  /*
   * Initial setup.
   */
  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      bindNoticeButtons,
      { once: true }
    );
  } else {
    bindNoticeButtons();
  }

})();