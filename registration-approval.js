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
      .select(`*, class_sections(id, section, stream, subject_combination, academic_year, class_teacher_id, classes(name))`)
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

    // The live Postgres function uses p_action as its decision argument.
    const { data, error } = await client().rpc('review_registration_request', {
      p_request_id: requestId,
      p_action: decision,
      p_rejection_reason: rejectionReason || null
    });

    if (error) throw error;
    return data;
  }

  async function routeRegistrationRequest(request) {
    if (!request?.id) throw new Error('Registration request is required.');
    const role = request.requested_role;

    if (role === 'teacher') {
      const { data: admins, error } = await client()
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true);
      if (error) throw error;
      return (admins || []).map(a => a.id);
    }

    if (role === 'student') {
      const classTeacherId = request.class_sections?.class_teacher_id;
      return classTeacherId ? [classTeacherId] : [];
    }

    return [];
  }

  window.LFS_APPROVAL = {
    getPendingRegistrationRequests,
    getMyNotifications,
    markNotificationRead,
    reviewRegistrationRequest,
    routeRegistrationRequest
  };
})();
