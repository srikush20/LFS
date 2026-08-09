// LFS registration approval helpers
(function () {
  if (typeof window === 'undefined') return;

  function client() {
    if (!window.LFS_SUPABASE) throw new Error('Supabase client is not initialized.');
    return window.LFS_SUPABASE;
  }

  async function getPendingRegistrationRequests() {
    const { data, error } = await client()
      .from('registration_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getMyNotifications() {
    const { data, error } = await client()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function markNotificationRead(id) {
    const { error } = await client()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
  }

  async function reviewRegistrationRequest(requestId, decision, rejectionReason) {
    if (!requestId) throw new Error('Registration request ID is required.');
    if (!['approved', 'rejected'].includes(decision)) {
      throw new Error('Invalid registration decision.');
    }

    const { data, error } = await client().rpc('review_registration_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_rejection_reason: rejectionReason || null
    });

    if (error) throw error;
    return data;
  }

  window.LFS_APPROVAL = {
    getPendingRegistrationRequests,
    getMyNotifications,
    markNotificationRead,
    reviewRegistrationRequest
  };
})();
