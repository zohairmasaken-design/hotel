'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Shield, Edit, X, Check, Loader2, UserPlus, AlertCircle, Trash2
} from 'lucide-react';
import { format } from 'date-fns';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'manager' | 'receptionist' | 'housekeeping' | 'accountant' | 'marketing';
  created_at: string;
}

export default function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bannedIds, setBannedIds] = useState<Record<string, boolean>>({});
  const [banningId, setBanningId] = useState<string | null>(null);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('receptionist');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // 1. Get Current User Role
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      setCurrentUserRole(myProfile?.role || null);

      // 2. Fetch All Profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);

    } catch (error: any) {
      console.error('Error fetching users FULL:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (profile: Profile) => {
    setEditingId(profile.id);
    setSelectedRole(profile.role);
  };

  const handleToggleBan = async (profile: Profile) => {
    if (!profile?.id) return;
    if (profile.id === currentUserId) {
      alert('لا يمكن حظر حسابك الحالي');
      return;
    }
    const isBanned = !!bannedIds[profile.id];
    const confirmText = isBanned
      ? `تأكيد رفع الحظر عن المستخدم:\n${profile.email}`
      : `تأكيد حظر المستخدم:\n${profile.email}\nلن يتمكن من تسجيل الدخول.`;
    if (!window.confirm(confirmText)) return;

    setBanningId(profile.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isBanned ? 'unban' : 'ban' })
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        if (body?.error === 'missing_service_role') {
          throw new Error('لا يمكن الحظر حالياً: لم يتم تهيئة مفتاح الخدمة على الخادم');
        }
        throw new Error(body?.error || `فشل العملية (HTTP ${res.status})`);
      }
      setBannedIds(prev => ({ ...prev, [profile.id]: !isBanned }));
      alert(isBanned ? 'تم رفع الحظر' : 'تم حظر المستخدم');
    } catch (e: any) {
      alert(e?.message || 'تعذر تنفيذ العملية');
    } finally {
      setBanningId(null);
    }
  };

  const handleSaveRole = async (userId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_user_role', {
        target_user_id: userId,
        new_role: selectedRole
      });

      if (error) throw error;

      // Optimistic Update
      setProfiles(profiles.map(p => 
        p.id === userId ? { ...p, role: selectedRole as any } : p
      ));
      setEditingId(null);
      alert('تم تحديث الصلاحيات بنجاح');

    } catch (error: any) {
      console.error('Update Error:', error);
      alert('خطأ في التحديث: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!userId) return;
    if (!window.confirm(`تأكيد حذف المستخدم:\n${email}\nسيتم حذف الحساب نهائيًا إذا كانت إعدادات الخادم مهيأة. إن لم تكن، سنعرض خيار التعطيل داخل النظام.`)) {
      return;
    }
    setDeletingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        // Graceful fallback if service role missing
        if (body?.error === 'missing_service_role') {
          const agreeSoft = window.confirm(
            'ملاحظة: لم يتم تهيئة مفتاح الخدمة على الخادم، ولا يمكن الحذف النهائي الآن.\n' +
            'هل تريد تعطيل المستخدم داخل النظام (حذف ملف التعريف فقط)؟'
          );
          if (agreeSoft) {
            const resSoft = await fetch(`/api/admin/users/${encodeURIComponent(userId)}?mode=soft`, { method: 'DELETE' });
            if (!resSoft.ok) {
              const b2 = await resSoft.json().catch(() => ({}));
              throw new Error(b2?.error || `فشل التعطيل (HTTP ${resSoft.status})`);
            }
            setProfiles(prev => prev.filter(p => p.id !== userId));
            alert('تم تعطيل المستخدم داخل النظام (يمكن تفعيل الحذف النهائي بعد تهيئة الخادم).');
            return;
          } else {
            throw new Error('تم إلغاء العملية');
          }
        }
        throw new Error(body?.error || `فشل الحذف (HTTP ${res.status})`);
      }
      const done = await res.json().catch(() => ({} as any));
      setProfiles(prev => prev.filter(p => p.id !== userId));
      alert(done?.mode === 'soft' ? 'تم تعطيل المستخدم داخل النظام' : 'تم حذف المستخدم نهائيًا');
    } catch (e: any) {
      alert(e?.message || 'تعذر حذف المستخدم');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  if (currentUserRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <Shield size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">غير مصرح لك بالدخول</h1>
        <p className="text-gray-600">هذه الصفحة مخصصة للمشرفين (Admins) فقط.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-blue-600" size={18} />
            إدارة المستخدمين والصلاحيات
          </h1>
          <p className="text-xs sm:text-base text-gray-500 mt-0.5 sm:mt-1">عرض وتعديل صلاحيات الموظفين في النظام</p>
        </div>
        
        {/* <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <UserPlus size={18} />
          <span>دعوة مستخدم جديد</span>
        </button> */}
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 flex items-start gap-3">
        <AlertCircle className="text-blue-600 mt-0.5" size={18} />
        <div>
          <h3 className="font-semibold text-blue-900">ملاحظة هامة</h3>
          <div className="text-xs sm:text-sm text-blue-800">
            <p>
              يتم إنشاء المستخدمين تلقائياً عند تسجيلهم لأول مرة. يمكنك هنا تعديل صلاحياتهم بعد التسجيل.
            </p>
            <p className="mt-1">الصلاحيات المتاحة:</p>
            <ul className="list-disc list-inside mt-1">
              <li><b>Admin:</b> تحكم كامل بالنظام.</li>
              <li><b>Manager:</b> إدارة الحجوزات والتقارير (لا يمكنه تعديل الصلاحيات).</li>
              <li><b>Accountant:</b> العمليات المحاسبية، التقارير المالية، والحجوزات.</li>
              <li><b>Marketing:</b> إدارة العملاء، التقارير التشغيلية، ومتابعة حالة الوحدات.</li>
              <li><b>Receptionist:</b> إنشاء وتعديل الحجوزات فقط.</li>
              <li><b>Housekeeping:</b> صيانة وتنظيف الوحدات فقط.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-right text-[11px] sm:text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-semibold text-gray-900 whitespace-nowrap">الاسم / البريد الإلكتروني</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-semibold text-gray-900 whitespace-nowrap">الصلاحية الحالية</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-semibold text-gray-900 whitespace-nowrap">تاريخ الانضمام</th>
              <th className="px-2 py-2 sm:px-6 sm:py-4 font-semibold text-gray-900 whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {profiles.map((profile) => (
              <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-2 py-2 sm:px-6 sm:py-4">
                  <div className="font-medium text-gray-900">{profile.full_name || 'بدون اسم'}</div>
                  <div className="text-[10px] sm:text-sm text-gray-500 font-mono">{profile.email}</div>
                </td>
                
                <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap">
                  {editingId === profile.id ? (
                    <select 
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-[11px] sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="receptionist">Receptionist</option>
                      <option value="manager">Manager</option>
                      <option value="accountant">Accountant</option>
                      <option value="marketing">Marketing Manager</option>
                      <option value="admin">Admin</option>
                      <option value="housekeeping">Housekeeping</option>
                    </select>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${
                      profile.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      profile.role === 'manager' ? 'bg-orange-100 text-orange-800' :
                      profile.role === 'accountant' ? 'bg-blue-100 text-blue-800' :
                      profile.role === 'marketing' ? 'bg-pink-100 text-pink-800' :
                      profile.role === 'receptionist' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {profile.role.toUpperCase()}
                    </span>
                  )}
                </td>

                <td className="px-2 py-2 sm:px-6 sm:py-4 text-gray-500 whitespace-nowrap">
                  {profile.created_at ? (
                    <>
                      <span className="sm:hidden">{format(new Date(profile.created_at), 'yy/MM/dd')}</span>
                      <span className="hidden sm:inline">{format(new Date(profile.created_at), 'yyyy/MM/dd')}</span>
                    </>
                  ) : '-'}
                </td>

                <td className="px-2 py-2 sm:px-6 sm:py-4">
                  {editingId === profile.id ? (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSaveRole(profile.id)}
                        disabled={saving}
                        className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                        title="حفظ"
                      >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      </button>
                      <button 
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        title="إلغاء"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEditClick(profile)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 text-[11px] sm:text-sm transition-colors"
                      >
                        <Edit size={14} />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => handleToggleBan(profile)}
                        disabled={banningId === profile.id || profile.id === currentUserId}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-[11px] sm:text-sm transition-colors ${
                          bannedIds[profile.id]
                            ? 'border-emerald-300 hover:bg-emerald-50 text-emerald-700'
                            : 'border-amber-300 hover:bg-amber-50 text-amber-800'
                        }`}
                        title={bannedIds[profile.id] ? 'رفع الحظر' : 'حظر المستخدم'}
                      >
                        {banningId === profile.id ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                        <span>{bannedIds[profile.id] ? 'رفع الحظر' : 'حظر'}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteUser(profile.id, profile.email)}
                        disabled={deletingId === profile.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-red-300 rounded-md hover:bg-red-50 text-red-700 text-[11px] sm:text-sm transition-colors"
                        title="حذف نهائي"
                      >
                        {deletingId === profile.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span>حذف</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {profiles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 sm:px-6 py-8 text-center text-gray-500 text-xs sm:text-sm">
                  لا يوجد مستخدمين مسجلين حالياً
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
