'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Wrench, 
  CheckCircle, 
  Filter, 
  BedDouble, 
  AlertCircle,
  Check,
  Camera,
  X,
  User,
  ClipboardList,
  Calendar,
  UserCheck,
  Search,
  MessageSquare,
  AlertTriangle,
  Award,
  Plus
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import { useActiveHotel } from '@/hooks/useActiveHotel';

// Types
interface Hotel {
  id: string;
  name: string;
}

interface UnitType {
  name: string;
}

interface Unit {
  id: string;
  unit_number: string;
  floor: string;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  hotel_id: string;
  hotel?: Hotel;
  unit_type?: UnitType;
}

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  user_metadata?: {
    full_name?: string;
  } | null;
}

interface MaintenanceLog {
  id: string;
  unit_id: string;
  performed_by?: string;
  performed_at?: string;
  notes?: string;
  photo_data?: string;
  photo_before?: string;
  photo_after?: string;
  issue_type?: string;
  description?: string;
  reported_by?: string;
  reported_at?: string;
  completed_at?: string;
  status?: 'pending' | 'confirmed' | 'completed';
  
  // Relations
  unit?: {
    unit_number: string;
    hotel?: {
      name: string;
    };
  };
  
  // Display names
  performer_name?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  confirmer_name?: string;
  reporter_name?: string;
}

const ISSUE_TYPES = [
  { id: 'electrical', label: 'كهرباء' },
  { id: 'plumbing', label: 'سباكة' },
  { id: 'ac', label: 'تكييف' },
  { id: 'furniture', label: 'أثاث' },
  { id: 'cleaning', label: 'نظافة' },
  { id: 'other', label: 'أخرى' }
];


interface StaffNote {
  id: string;
  target_user_id: string;
  created_by: string;
  type: 'violation' | 'note' | 'commendation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  created_at: string;
  target_user_name?: string;
  creator_name?: string;
}

const STATUS_LABELS = {
  available: { label: 'متاح', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  occupied: { label: 'مشغول', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: BedDouble },
  maintenance: { label: 'صيانة', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
  cleaning: { label: 'تنظيف', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Wrench },
};

export default function MaintenancePage() {
  const { role } = useUserRole();
  const { activeHotelId } = useActiveHotel();
  const isReceptionist = role === 'receptionist';
  const selectedHotelId = activeHotelId || 'all';
  const [activeTab, setActiveTab] = useState<'needs_maintenance' | 'all' | 'history' | 'notes'>('needs_maintenance');
  const [units, setUnits] = useState<Unit[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [staffNotes, setStaffNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [performerFilter, setPerformerFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const selectedHotelName = React.useMemo(() => {
    if (selectedHotelId === 'all') return 'الكل';
    return hotels.find((h) => String(h.id) === String(selectedHotelId))?.name || '-';
  }, [hotels, selectedHotelId]);
  
  // Maintenance Request Modal State (Report Issue)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<{
    unit_id: string;
    issue_type: string;
    description: string;
    photo_before: string | null;
  }>({
    unit_id: '',
    issue_type: 'other',
    description: '',
    photo_before: null
  });

  // Maintenance Completion Modal State (Resolve Issue)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [activeMaintenanceLog, setActiveMaintenanceLog] = useState<MaintenanceLog | null>(null);
  const [completionForm, setCompletionForm] = useState<{
    notes: string;
    photo_after: string | null;
  }>({
    notes: '',
    photo_after: null
  });
  
  // Note Modal State
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState<{
    target_user_id: string;
    type: 'violation' | 'note' | 'commendation';
    severity: 'low' | 'medium' | 'high' | 'critical';
    content: string;
  }>({
    target_user_id: '',
    type: 'note',
    severity: 'low',
    content: ''
  });
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [notes, setNotes] = useState('');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Data
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
      fetchProfiles();
    } else if (activeTab === 'notes') {
      fetchNotes();
      fetchProfiles();
    } else {
      fetchData();
    }
    fetchCurrentUser();
  }, [activeTab, selectedHotelId]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*');
    if (data) setAllProfiles(data);
  };

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data: notesData, error } = await supabase
        .from('staff_notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (notesData) {
        const userIds = new Set<string>();
        notesData.forEach(n => {
          userIds.add(n.target_user_id);
          userIds.add(n.created_by);
        });

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(userIds));
          
        const profileMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'مستخدم غير معروف';
          return acc;
        }, {} as Record<string, string>);

        const enrichedNotes = notesData.map(n => ({
          ...n,
          target_user_name: profileMap[n.target_user_id] || 'موظف غير معروف',
          creator_name: profileMap[n.created_by] || 'مستخدم غير معروف'
        }));

        setStaffNotes(enrichedNotes as StaffNote[]);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      if (selectedHotelId !== 'all') {
        const { data: unitRows, error: unitsErr } = await supabase
          .from('units')
          .select('id')
          .eq('hotel_id', selectedHotelId);
        if (unitsErr) throw unitsErr;
        const unitIds = (unitRows || []).map((u: any) => u.id).filter(Boolean);
        if (unitIds.length === 0) {
          setMaintenanceLogs([]);
          return;
        }
        // continue with filtered unit_ids below
        let query = supabase
          .from('maintenance_logs')
          .select(
            `
          *,
          unit:units(unit_number, hotel:hotels(name))
        `
          )
          .in('unit_id', unitIds)
          .order('performed_at', { ascending: false });

        if (performerFilter !== 'all') {
          query = query.eq('performed_by', performerFilter);
        }

        if (dateFilter) {
          const nextDay = new Date(dateFilter);
          nextDay.setDate(nextDay.getDate() + 1);
          query = query.gte('performed_at', dateFilter).lt('performed_at', nextDay.toISOString().split('T')[0]);
        }

        const { data: logs, error } = await query;
        if (error) throw error;

        if (logs) {
          const userIds = new Set<string>();
          logs.forEach((log: any) => {
            if (log.performed_by) userIds.add(log.performed_by);
            if (log.confirmed_by) userIds.add(log.confirmed_by);
          });

          const uniqueUserIds = Array.from(userIds);
          let profileMap: Record<string, string> = {};

          if (uniqueUserIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', uniqueUserIds);

            profileMap = (profiles || []).reduce((acc, profile) => {
              acc[profile.id] = profile.full_name || 'مستخدم غير معروف';
              return acc;
            }, {} as Record<string, string>);
          }

          const logsWithNames = logs.map((log: any) => ({
            ...log,
            performer_name: profileMap[log.performed_by] || 'مستخدم غير معروف',
            confirmer_name: log.confirmed_by ? profileMap[log.confirmed_by] || 'مستخدم غير معروف' : undefined,
          }));

          setMaintenanceLogs(logsWithNames);
        }
        return;
      }

      let query = supabase
        .from('maintenance_logs')
        .select(`
          *,
          unit:units(unit_number, hotel:hotels(name))
        `)
        .order('performed_at', { ascending: false });

      if (performerFilter !== 'all') {
        query = query.eq('performed_by', performerFilter);
      }
      
      if (dateFilter) {
        // Filter by date (ignoring time)
        const nextDay = new Date(dateFilter);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.gte('performed_at', dateFilter).lt('performed_at', nextDay.toISOString().split('T')[0]);
      }

      const { data: logs, error } = await query;

      if (error) throw error;

      if (logs) {
        // Fetch performer and confirmer names
        const userIds = new Set<string>();
        logs.forEach(log => {
          if (log.performed_by) userIds.add(log.performed_by);
          if (log.confirmed_by) userIds.add(log.confirmed_by);
        });
        
        const uniqueUserIds = Array.from(userIds);
        let profileMap: Record<string, string> = {};
        
        if (uniqueUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', uniqueUserIds);
          
          profileMap = (profiles || []).reduce((acc, profile) => {
            acc[profile.id] = profile.full_name || 'مستخدم غير معروف';
            return acc;
          }, {} as Record<string, string>);
        }

        const logsWithNames = logs.map(log => ({
          ...log,
          performer_name: profileMap[log.performed_by] || 'مستخدم غير معروف',
          confirmer_name: log.confirmed_by ? (profileMap[log.confirmed_by] || 'مستخدم غير معروف') : undefined
        }));
        
        setMaintenanceLogs(logsWithNames);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [performerFilter, dateFilter, selectedHotelId]); // Re-fetch when filters change

  const handleConfirmLog = async (log: MaintenanceLog) => {
    if (!currentUser) return;
    if (!confirm('هل أنت متأكد من تأكيد هذه الصيانة؟ سيتم حذف الصورة وتسجيل التأكيد.')) return;

    try {
      // 1. Update maintenance_logs
      const { error } = await supabase
        .from('maintenance_logs')
        .update({
          status: 'confirmed',
          confirmed_by: currentUser.id,
          confirmed_at: new Date().toISOString()
        })
        .eq('id', log.id);

      if (error) throw error;

      // 2. Update local state
      setMaintenanceLogs(prev => prev.map(l => 
        l.id === log.id 
          ? { 
              ...l, 
              status: 'confirmed', 
              confirmed_by: currentUser.id, 
              confirmed_at: new Date().toISOString(),
              confirmer_name: currentUser.full_name || currentUser.email || 'أنا'
            } 
          : l
      ));

    } catch (error: any) {
      console.error('Error confirming log:', error);
      alert(`حدث خطأ أثناء التأكيد: ${error.message || 'خطأ غير معروف'}`);
    }
  };

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Fetch profile if exists, otherwise use auth data
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
        
      setCurrentUser({
        id: user.id,
        email: user.email || '',
        full_name: profile?.full_name
      });
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Hotels
      const { data: hotelsData } = await supabase
        .from('hotels')
        .select('id, name')
        .order('name');
      
      if (hotelsData) setHotels(hotelsData);

      // Fetch Units
      let unitsQuery = supabase
        .from('units')
        .select(
          `
          id,
          unit_number,
          floor,
          status,
          hotel_id,
          hotel:hotels(id, name),
          unit_type:unit_types(name)
        `
        )
        .order('unit_number');
      if (selectedHotelId !== 'all') {
        unitsQuery = unitsQuery.eq('hotel_id', selectedHotelId);
      }
      const { data: unitsData, error } = await unitsQuery;

      if (error) throw error;
      if (unitsData) setUnits(unitsData as any);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Open Maintenance Request Modal (For Available/Occupied Units)
  const openRequestModal = (unit: Unit) => {
    setRequestForm({
      unit_id: unit.id,
      issue_type: 'other',
      description: '',
      photo_before: null
    });
    setIsRequestModalOpen(true);
  };

  // Open Maintenance Completion Modal (For Units in Maintenance)
  const openCompletionModal = async (unit: Unit) => {
    setLoading(true);
    try {
      // Fetch the active maintenance log
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('unit_id', unit.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        setActiveMaintenanceLog(data);
        setCompletionForm({
          notes: '',
          photo_after: null
        });
        setIsCompletionModalOpen(true);
      } else {
        // Fallback if no log found but unit is in maintenance (legacy or direct status change)
        setActiveMaintenanceLog({
          id: 'temp-' + Date.now(),
          unit_id: unit.id,
          unit: unit as any,
          status: 'pending'
        });
        setCompletionForm({
          notes: '',
          photo_after: null
        });
        setIsCompletionModalOpen(true);
      }
    } catch (err) {
      console.error('Error fetching active log:', err);
      alert('حدث خطأ أثناء جلب بيانات الصيانة');
    } finally {
      setLoading(false);
    }
  };

  // Handle Image Capture/Upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Resize image
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 (low quality JPEG)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          
          if (target === 'before') {
            setRequestForm(prev => ({ ...prev, photo_before: dataUrl }));
          } else {
            setCompletionForm(prev => ({ ...prev, photo_after: dataUrl }));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Maintenance Request (Start Maintenance)
  const handleSubmitRequest = async () => {
    if (!currentUser) return;
    if (!requestForm.issue_type) {
      alert('يرجى اختيار نوع الصيانة');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Insert Maintenance Log
      const nowIso = new Date().toISOString();
      const { error: logError } = await supabase
        .from('maintenance_logs')
        .insert({
          unit_id: requestForm.unit_id,
          reported_by: currentUser.id,
          reported_at: nowIso,
          issue_type: requestForm.issue_type,
          description: requestForm.description,
          photo_before: requestForm.photo_before,
          status: 'pending'
        });

      if (logError) throw logError;

      // 2. Update Unit Status
      const { error: unitError } = await supabase
        .from('units')
        .update({ status: 'maintenance' })
        .eq('id', requestForm.unit_id);

      if (unitError) throw unitError;

      // 3. Log System Event
      try {
        await supabase.from('system_events').insert({
          event_type: 'maintenance_request',
          message: `طلب صيانة للوحدة ${units.find(u => u.id === requestForm.unit_id)?.unit_number}: ${requestForm.description}`,
          unit_id: requestForm.unit_id,
          payload: {
            actor_id: currentUser.id,
            actor_email: currentUser.email,
            issue_type: requestForm.issue_type
          }
        });
      } catch (logErr) {}

      // Optimistic Update
      setUnits(prev => prev.map(u => 
        u.id === requestForm.unit_id ? { ...u, status: 'maintenance' } : u
      ));

      setIsRequestModalOpen(false);
      alert('تم تحويل الوحدة للصيانة بنجاح');

    } catch (error) {
      console.error('Error submitting request:', error);
      alert('حدث خطأ أثناء تسجيل طلب الصيانة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Maintenance Completion (Finish Maintenance)
  const handleCompleteMaintenance = async () => {
    if (!activeMaintenanceLog || !currentUser) return;
    
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      
      // 1. Update Maintenance Log
      // If it's a temp log (not in DB), we might need to insert it first or handle differently.
      // But assuming we usually have a real log.
      if (!activeMaintenanceLog.id.startsWith('temp-')) {
        const { error: logError } = await supabase
          .from('maintenance_logs')
          .update({
            status: 'completed', // Work done, waiting for confirmation
            performed_by: currentUser.id,
            performed_at: nowIso,
            completed_at: nowIso,
            notes: completionForm.notes, // Resolution notes
            photo_after: completionForm.photo_after,
            photo_data: completionForm.photo_after // Keep legacy column updated too if needed
          })
          .eq('id', activeMaintenanceLog.id);

        if (logError) throw logError;
      } else {
        // Create new log if none existed (fallback)
        const { error: logError } = await supabase
          .from('maintenance_logs')
          .insert({
            unit_id: activeMaintenanceLog.unit_id,
            performed_by: currentUser.id,
            performed_at: nowIso,
            completed_at: nowIso,
            notes: completionForm.notes,
            photo_after: completionForm.photo_after,
            photo_data: completionForm.photo_after,
            status: 'completed'
          });
          
        if (logError) throw logError;
      }

      // 2. Update Unit Status
      const { error: unitError } = await supabase
        .from('units')
        .update({ status: 'available' })
        .eq('id', activeMaintenanceLog.unit_id);

      if (unitError) throw unitError;

      // 3. Log System Event
      try {
        await supabase.from('system_events').insert({
          event_type: 'maintenance_resolved',
          message: `إصلاح صيانة للوحدة ${units.find(u => u.id === activeMaintenanceLog.unit_id)?.unit_number}: ${completionForm.notes}`,
          unit_id: activeMaintenanceLog.unit_id,
          payload: {
            actor_id: currentUser.id,
            actor_email: currentUser.email,
            notes: completionForm.notes
          }
        });
      } catch (logErr) {}

      // Optimistic Update
      setUnits(prev => prev.map(u => 
        u.id === activeMaintenanceLog.unit_id ? { ...u, status: 'available' } : u
      ));
      
      setIsCompletionModalOpen(false);
      alert('تم إكمال الصيانة بنجاح');

    } catch (error) {
      console.error('Error completing maintenance:', error);
      alert('حدث خطأ أثناء إكمال الصيانة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!currentUser) return;
    if (!noteForm.target_user_id || !noteForm.content) {
      alert('يرجى اختيار الموظف وكتابة المحتوى');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: inserted, error } = await supabase
        .from('staff_notes')
        .insert({
          target_user_id: noteForm.target_user_id,
          created_by: currentUser.id,
          type: noteForm.type,
          severity: noteForm.severity,
          content: noteForm.content
        })
        .select('id')
        .single();

      if (error) throw error;

      try {
        const targetProfile = allProfiles.find(p => p.id === noteForm.target_user_id);
        const msg = `توجد ملاحظة على الموظف ${targetProfile?.full_name || ''}: ${noteForm.content.slice(0, 80)}`;
        await supabase.from('system_events').insert({
          event_type: 'staff_note',
          staff_note_id: inserted?.id || null,
          message: msg,
          payload: {
            type: noteForm.type,
            severity: noteForm.severity
          }
        });
      } catch (eventError) {
        console.error('Failed to log staff_note event:', eventError);
      }

      // Refresh list
      fetchNotes();
      setIsNoteModalOpen(false);
      setNoteForm({
        target_user_id: '',
        type: 'note',
        severity: 'low',
        content: ''
      });
      alert('تم إضافة الملاحظة بنجاح');

    } catch (error) {
      console.error('Error adding note:', error);
      alert('حدث خطأ أثناء إضافة الملاحظة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Status (Direct)
  const updateUnitStatus = async (unitId: string, newStatus: string) => {
    setUpdating(unitId);
    try {
      const { error } = await supabase
        .from('units')
        .update({ status: newStatus })
        .eq('id', unitId);

      if (error) throw error;

      // Optimistic Update
      setUnits(prev => prev.map(u => 
        u.id === unitId ? { ...u, status: newStatus as any } : u
      ));

    } catch (error) {
      console.error('Error updating status:', error);
      alert('حدث خطأ أثناء تحديث الحالة');
    } finally {
      setUpdating(null);
    }
  };

  // Filter Logic
  const filteredUnits = units.filter(unit => {
    // Hotel Filter
    if (selectedHotelId !== 'all' && unit.hotel_id !== selectedHotelId) return false;

    // Tab Filter
    if (activeTab === 'needs_maintenance') {
      return unit.status === 'maintenance';
    }
    
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="text-red-600" />
            صيانة الوحدات
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            إدارة ومتابعة صيانة الغرف والوحدات السكنية
          </p>
        </div>

        {/* Filters */}
        <div className="w-full md:w-auto flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
          <Filter size={18} className="text-gray-400 mr-1 shrink-0" />
          <div className="w-full md:w-auto text-sm text-gray-700 font-bold bg-transparent outline-none min-w-[150px]">
            {selectedHotelName}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-6 min-w-max">
          <button
            onClick={() => setActiveTab('needs_maintenance')}
            className={cn(
              "pb-4 px-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2",
              activeTab === 'needs_maintenance'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Wrench size={16} />
            تحتاج صيانة
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
              {units.filter(u => u.status === 'maintenance' && (selectedHotelId === 'all' || u.hotel_id === selectedHotelId)).length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "pb-4 px-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2",
              activeTab === 'all'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <BedDouble size={16} />
            كل الوحدات
            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {selectedHotelId === 'all' ? units.length : units.filter(u => u.hotel_id === selectedHotelId).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "pb-4 px-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2",
              activeTab === 'history'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <ClipboardList size={16} />
            سجل الصيانة
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={cn(
              "pb-4 px-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2",
              activeTab === 'notes'
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <MessageSquare size={16} />
            الملاحظات والمخالفات
          </button>
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">جاري تحميل البيانات...</div>
      ) : activeTab === 'history' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">تصفية:</span>
            </div>
            
            <div className="relative">
              <User size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={performerFilter}
                onChange={(e) => setPerformerFilter(e.target.value)}
                className="pr-9 pl-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">كل الموظفين</option>
                {allProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Calendar size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pr-9 pl-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            
            {(performerFilter !== 'all' || dateFilter) && (
              <button 
                onClick={() => { setPerformerFilter('all'); setDateFilter(''); }}
                className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <X size={14} />
                مسح التصفيات
              </button>
            )}
          </div>

          {maintenanceLogs.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">لا توجد سجلات صيانة</h3>
              <p className="text-gray-500">
                {(performerFilter !== 'all' || dateFilter) ? 'لا توجد نتائج تطابق التصفيات' : 'سجل الصيانة فارغ حالياً'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile View (Cards) */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {maintenanceLogs.map((log) => (
                  <div key={log.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                          {log.unit?.unit_number}
                          <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {log.unit?.hotel?.name}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                          <User size={12} />
                          {log.performer_name}
                        </div>
                      </div>
                      {log.status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle size={12} />
                          مؤكد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <AlertCircle size={12} />
                          انتظار
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <div className="text-gray-600 flex flex-col text-xs">
                        <span className="text-gray-400">{log.performed_at ? new Date(log.performed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                      </div>
                      
                      <div className="flex gap-2">
                        {log.photo_before && (
                          <button
                            onClick={() => setSelectedImage(log.photo_before || null)}
                            className="text-red-600 text-xs flex items-center gap-1 hover:underline"
                          >
                            <Camera size={14} />
                            قبل
                          </button>
                        )}
                        {log.photo_after && (
                          <button
                            onClick={() => setSelectedImage(log.photo_after || null)}
                            className="text-green-600 text-xs flex items-center gap-1 hover:underline"
                          >
                            <Camera size={14} />
                            بعد
                          </button>
                        )}
                        {!log.photo_before && !log.photo_after && log.photo_data && (
                          <button
                            onClick={() => setSelectedImage(log.photo_data || null)}
                            className="text-blue-600 text-xs flex items-center gap-1 hover:underline"
                          >
                            <Camera size={14} />
                            عرض الصورة
                          </button>
                        )}
                      </div>
                    </div>

                    {log.notes && (
                      <div className="bg-gray-50 p-2 rounded text-xs text-gray-700 italic">
                        {log.notes}
                      </div>
                    )}

                    {log.status !== 'confirmed' && (
                      isReceptionist ? (
                        <button
                          className="w-full py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed mt-1"
                          title="غير مسموح للرسيبشن"
                          aria-disabled
                        >
                          تأكيد الصيانة
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConfirmLog(log)}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mt-1"
                        >
                          <CheckCircle size={16} />
                          تأكيد الصيانة
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop View (Table) */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4">إجراءات</th>
                        <th className="px-6 py-4">الصورة</th>
                        <th className="px-6 py-4">الوحدة</th>
                        <th className="px-6 py-4">المنفذ</th>
                        <th className="px-6 py-4">التاريخ</th>
                        <th className="px-6 py-4">ملاحظات</th>
                        <th className="px-6 py-4">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {maintenanceLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            {log.status === 'completed' && (
                              isReceptionist ? (
                                <button
                                  className="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-medium rounded-lg cursor-not-allowed"
                                  title="غير مسموح للرسيبشن"
                                  aria-disabled
                                >
                                  تأكيد
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleConfirmLog(log)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                                >
                                  <CheckCircle size={14} />
                                  تأكيد
                                </button>
                              )
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              {log.photo_before && (
                                <div 
                                  className="relative group w-12 h-12 cursor-pointer border border-red-200 rounded-lg overflow-hidden"
                                  onClick={() => setSelectedImage(log.photo_before || null)}
                                  title="قبل الصيانة"
                                >
                                  <img src={log.photo_before} alt="Before" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white text-[10px]">قبل</span>
                                  </div>
                                </div>
                              )}
                              {log.photo_after && (
                                <div 
                                  className="relative group w-12 h-12 cursor-pointer border border-green-200 rounded-lg overflow-hidden"
                                  onClick={() => setSelectedImage(log.photo_after || null)}
                                  title="بعد الصيانة"
                                >
                                  <img src={log.photo_after} alt="After" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white text-[10px]">بعد</span>
                                  </div>
                                </div>
                              )}
                              {!log.photo_before && !log.photo_after && log.photo_data && (
                                <div 
                                  className="relative group w-12 h-12 cursor-pointer border border-blue-200 rounded-lg overflow-hidden"
                                  onClick={() => setSelectedImage(log.photo_data || null)}
                                >
                                  <img src={log.photo_data} alt="Maintenance" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white text-[10px]">عرض</span>
                                  </div>
                                </div>
                              )}
                              {!log.photo_before && !log.photo_after && !log.photo_data && (
                                <span className="text-xs text-gray-400 italic">لا توجد صور</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{log.unit?.unit_number}</div>
                            <div className="text-xs text-gray-500">{log.unit?.hotel?.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                <User size={14} />
                              </div>
                              {log.performer_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 dir-ltr text-right">
                            <div className="flex items-center gap-2 justify-end">
                              {log.performed_at ? new Date(log.performed_at).toLocaleDateString('en-GB') : '-'}
                              <span className="text-xs text-gray-400">
                                {log.performed_at ? new Date(log.performed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-[200px]">
                            {log.notes ? (
                              <span className="text-gray-700 truncate block" title={log.notes}>{log.notes}</span>
                            ) : (
                              <span className="text-gray-400 italic">لا توجد ملاحظات</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {log.status === 'confirmed' ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                                  <CheckCircle size={12} />
                                  مؤكد
                                </span>
                                {log.confirmer_name && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <UserCheck size={10} />
                                    بواسطة: {log.confirmer_name}
                                  </span>
                                )}
                              </div>
                            ) : log.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                <CheckCircle size={12} />
                                تم الإنجاز
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                <AlertCircle size={12} />
                                قيد المعالجة
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'notes' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h2 className="text-lg font-medium text-gray-900">سجل الملاحظات والمخالفات</h2>
              <p className="text-sm text-gray-500">متابعة أداء الموظفين وتسجيل الملاحظات الإدارية</p>
            </div>
            {!isReceptionist && (
              <button
                onClick={() => setIsNoteModalOpen(true)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                إضافة ملاحظة
              </button>
            )}
          </div>

          {staffNotes.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">لا توجد ملاحظات</h3>
              <p className="text-gray-500">لم يتم تسجيل أي ملاحظات أو مخالفات بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffNotes.map((note) => (
                <div key={note.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                        <User size={16} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{note.target_user_name}</div>
                        <div className="text-xs text-gray-500">{new Date(note.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                    </div>
                    {note.type === 'violation' ? (
                      <span className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1",
                        note.severity === 'low' ? "bg-amber-100 text-amber-700" :
                        note.severity === 'medium' ? "bg-orange-100 text-orange-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        <AlertTriangle size={12} />
                        مخالفة ({note.severity === 'critical' ? 'جسيمة' : note.severity === 'high' ? 'عالية' : note.severity === 'medium' ? 'متوسطة' : 'بسيطة'})
                      </span>
                    ) : note.type === 'commendation' ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
                        <Award size={12} />
                        تنويه
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                        <MessageSquare size={12} />
                        ملاحظة
                      </span>
                    )}
                  </div>
                  
                  <p className="text-gray-700 text-sm mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100 min-h-[60px]">
                    {note.content}
                  </p>
                  
                  <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                    <span>بواسطة: {note.creator_name}</span>
                    <span>{new Date(note.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <CheckCircle size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">لا توجد وحدات</h3>
          <p className="text-gray-500">
            {activeTab === 'needs_maintenance' 
              ? 'جميع الوحدات سليمة وجاهزة!' 
              : 'لا توجد وحدات مطابقة للفلتر المحدد'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUnits.map((unit) => {
            const StatusIcon = STATUS_LABELS[unit.status].icon;
            return (
              <div 
                key={unit.id} 
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      {unit.unit_number}
                      <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {unit.unit_type?.name}
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {unit.hotel?.name} • طابق {unit.floor}
                    </p>
                  </div>
                  <div className={cn(
                    "px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border",
                    STATUS_LABELS[unit.status].color
                  )}>
                    <StatusIcon size={12} />
                    {STATUS_LABELS[unit.status].label}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-auto pt-3 border-t border-gray-100 flex gap-2">
                  {activeTab === 'needs_maintenance' ? (
                    <button
                      onClick={() => openCompletionModal(unit)}
                      disabled={updating === unit.id}
                      className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {updating === unit.id ? (
                        <span className="animate-spin">⌛</span>
                      ) : (
                        <>
                          <Check size={16} />
                          إكمال الصيانة
                        </>
                      )}
                    </button>
                  ) : (
                    <select
                      value={unit.status}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        if (newStatus === 'maintenance') {
                          openRequestModal(unit);
                        } else {
                          updateUnitStatus(unit.id, newStatus);
                        }
                      }}
                      disabled={updating === unit.id}
                      className="w-full py-2 px-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                    >
                      <option value="available">متاح (نظيف)</option>
                      <option value="cleaning">يحتاج تنظيف</option>
                      <option value="maintenance">صيانة</option>
                      <option value="occupied">مشغول</option>
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 left-0 text-white hover:text-gray-300 p-2"
            >
              <X size={24} />
            </button>
            <img 
              src={selectedImage} 
              alt="Maintenance Proof" 
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare size={20} className="text-blue-600" />
                إضافة ملاحظة / مخالفة
              </h3>
              <button 
                onClick={() => setIsNoteModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Employee Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الموظف المعني
                </label>
                <select
                  value={noteForm.target_user_id}
                  onChange={(e) => setNoteForm({...noteForm, target_user_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right"
                >
                  <option value="">اختر الموظف...</option>
                  {allProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Select */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    نوع السجل
                  </label>
                  <select
                    value={noteForm.type}
                    onChange={(e) => setNoteForm({...noteForm, type: e.target.value as any})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right"
                  >
                    <option value="note">ملاحظة عامة</option>
                    <option value="violation">مخالفة</option>
                    <option value="commendation">تنويه / شكر</option>
                  </select>
                </div>
                
                {noteForm.type === 'violation' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      درجة المخالفة
                    </label>
                    <select
                      value={noteForm.severity}
                      onChange={(e) => setNoteForm({...noteForm, severity: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-right"
                    >
                      <option value="low">بسيطة</option>
                      <option value="medium">متوسطة</option>
                      <option value="high">عالية</option>
                      <option value="critical">جسيمة</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  نص الملاحظة
                </label>
                <textarea
                  value={noteForm.content}
                  onChange={(e) => setNoteForm({...noteForm, content: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-32 resize-none text-right"
                  placeholder="اكتب تفاصيل الملاحظة أو المخالفة هنا..."
                ></textarea>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsNoteModalOpen(false)}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddNote}
                disabled={isSubmitting || !noteForm.target_user_id || !noteForm.content}
                className={cn(
                  "px-4 py-2 text-white font-medium rounded-lg transition-colors flex items-center gap-2",
                  isSubmitting || !noteForm.target_user_id || !noteForm.content
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Request Modal (Report Issue) */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">تسجيل طلب صيانة</h3>
                <p className="text-sm text-gray-500">
                  {units.find(u => u.id === requestForm.unit_id)?.unit_number} - {units.find(u => u.id === requestForm.unit_id)?.hotel?.name}
                </p>
              </div>
              <button 
                onClick={() => setIsRequestModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Issue Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  نوع الصيانة (مطلوب)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ISSUE_TYPES.map(type => (
                    <button
                      key={type.id}
                      onClick={() => setRequestForm(prev => ({ ...prev, issue_type: type.id }))}
                      className={cn(
                        "py-2 px-3 rounded-lg text-sm font-medium border transition-colors",
                        requestForm.issue_type === type.id
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo Before */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  صورة المشكلة (مطلوب)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageChange(e, 'before')}
                    className="hidden"
                    id="request-photo"
                  />
                  <label
                    htmlFor="request-photo"
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                      requestForm.photo_before ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-red-400 hover:bg-red-50"
                    )}
                  >
                    {requestForm.photo_before ? (
                      <div className="relative w-full h-full p-2">
                        <img 
                          src={requestForm.photo_before} 
                          alt="Preview" 
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                          <p className="text-white text-xs font-bold">تغيير الصورة</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera className="text-gray-400 mb-2" size={24} />
                        <p className="text-sm text-gray-500 font-medium">التقاط صورة للمشكلة</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  وصف المشكلة (اختياري)
                </label>
                <textarea
                  value={requestForm.description}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="وصف إضافي للمشكلة..."
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none resize-none h-20"
                />
              </div>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={isSubmitting || !requestForm.issue_type}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-200"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'تحويل للصيانة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Completion Modal (Finish Maintenance) */}
      {isCompletionModalOpen && activeMaintenanceLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">إكمال الصيانة</h3>
                <p className="text-sm text-gray-500">
                  {activeMaintenanceLog.unit?.unit_number || units.find(u => u.id === activeMaintenanceLog.unit_id)?.unit_number}
                </p>
              </div>
              <button 
                onClick={() => setIsCompletionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Original Request Info */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">نوع المشكلة</span>
                    <span className="font-medium text-gray-900 bg-white px-2 py-1 rounded border border-gray-200 text-sm">
                      {ISSUE_TYPES.find(t => t.id === activeMaintenanceLog.issue_type)?.label || activeMaintenanceLog.issue_type || 'غير محدد'}
                    </span>
                  </div>
                  {activeMaintenanceLog.reported_at && (
                    <div className="text-left">
                      <span className="text-xs text-gray-500 block mb-1">تاريخ البلاغ</span>
                      <span className="text-xs font-medium text-gray-700">
                        {new Date(activeMaintenanceLog.reported_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  )}
                </div>
                
                {activeMaintenanceLog.description && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">الوصف</span>
                    <p className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
                      {activeMaintenanceLog.description}
                    </p>
                  </div>
                )}

                {/* Photo Before Display */}
                {activeMaintenanceLog.photo_before && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">صورة المشكلة (قبل)</span>
                    <div className="relative h-32 rounded-lg overflow-hidden border border-gray-200 bg-white">
                      <img 
                        src={activeMaintenanceLog.photo_before} 
                        alt="Issue Before" 
                        className="w-full h-full object-cover"
                        onClick={() => setSelectedImage(activeMaintenanceLog.photo_before || null)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Photo After Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  صورة بعد الإصلاح (مطلوب)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleImageChange(e, 'after')}
                    className="hidden"
                    id="completion-photo"
                  />
                  <label
                    htmlFor="completion-photo"
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                      completionForm.photo_after ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-green-400 hover:bg-green-50"
                    )}
                  >
                    {completionForm.photo_after ? (
                      <div className="relative w-full h-full p-2">
                        <img 
                          src={completionForm.photo_after} 
                          alt="After Preview" 
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                          <p className="text-white text-xs font-bold">تغيير الصورة</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera className="text-gray-400 mb-2" size={24} />
                        <p className="text-sm text-gray-500 font-medium">التقاط صورة بعد الإصلاح</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Resolution Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  تقرير الإصلاح (مطلوب)
                </label>
                <textarea
                  value={completionForm.notes}
                  onChange={(e) => setCompletionForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="ما هي الإصلاحات التي تمت؟"
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none resize-none h-24"
                />
              </div>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => setIsCompletionModalOpen(false)}
                className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                disabled={isSubmitting}
              >
                إلغاء
              </button>
              <button
                onClick={handleCompleteMaintenance}
                disabled={isSubmitting || !completionForm.notes}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-green-200"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'إتمام الصيانة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
