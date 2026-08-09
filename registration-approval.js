// LFS registration approval helpers
// This file provides the client-side operations used by the admin/class-teacher approval UI.

(function () {
  if (typeof window === 'undefined') return;

  async function getPendingRegistrationRequests() {
    if (!window.LFS_SUPABASE) throw new Error('Supabase client is not initialized.');
    const { data, error } = await window.LFS_SUPABASE
      .from('registration_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getMyNotifications() {
    if (!window.LFS_SUPABASE) throw new Error('Supabase client is not initialized.');
    const { data, error } = await window.LFS_SUPABASE
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function markNotificationRead(id) {
    if (!window.LFS_SUPABASE) throw new Error('Supabase client is not initialized.');
    const { error } = await window.LFS_SUPABASE
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
  }

  window.LFS_APPROVAL = {
    getPendingRegistrationRequests,
    getMyNotifications,
    markNotificationRead
  };
})();
