import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Mapping {
  key: string;
  account_id: string | null;
  label: string;
  description: string;
}

export const AccountMappingSettings: React.FC = () => {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      // Fetch Mappings
      const { data: mappingsData, error: mappingsError } = await supabase
        .from('system_account_mappings')
        .select('*')
        .order('key');

      if (mappingsError) {
        // If table doesn't exist, we might want to show a friendly message or handle it
        if (mappingsError.code === '42P01') { // undefined_table
            throw new Error('جدول إعدادات الربط غير موجود. يرجى تشغيل ملف SQL المرفق.');
        }
        throw mappingsError;
      }

      setAccounts(accountsData || []);
      setMappings(mappingsData || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdate = async (key: string, accountId: string) => {
    // Optimistic update
    setMappings(prev => prev.map(m => m.key === key ? { ...m, account_id: accountId || null } : m));
    setSuccess(false);
  };

  const getMappingExplanation = (key: string) => {
    switch (key) {
      case 'DEFAULT_REVENUE':
        return 'عند إصدار فاتورة جديدة، سيتم تسجيل إيراد الإيجار في هذا الحساب (دائن).';
      case 'DEFAULT_RECEIVABLE':
        return 'عند إصدار فاتورة آجلة، سيتم تسجيل المبلغ على هذا الحساب كدين على العميل (مدين).';
      case 'DEFAULT_TAX':
        return 'عند حساب ضريبة 15%، سيتم ترحيل مبلغ الضريبة لهذا الحساب (التزام).';
      case 'DEFAULT_CASH':
        return 'عند استلام دفعة نقدية، سيدخل المال في هذا الحساب (مدين).';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      for (const mapping of mappings) {
        const { error } = await supabase
          .from('system_account_mappings')
          .update({ account_id: mapping.account_id })
          .eq('key', mapping.key);
        
        if (error) throw error;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError('فشل حفظ الإعدادات: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  if (error && error.includes('جدول إعدادات الربط غير موجود')) {
      return (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
              <AlertCircle className="mx-auto text-red-600 mb-2" size={32} />
              <h3 className="text-lg font-bold text-red-800 mb-2">الجدول غير موجود</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <p className="text-sm text-gray-600">يرجى تشغيل ملف <code>supabase_mappings.sql</code> في قاعدة البيانات.</p>
              <button 
                onClick={fetchData}
                className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg font-bold transition-colors inline-flex items-center gap-2"
              >
                  <RefreshCw size={16} />
                  إعادة المحاولة
              </button>
          </div>
      );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="font-bold text-blue-800 text-sm">توجيه الحسابات الافتراضي</h4>
          <p className="text-blue-600 text-xs mt-1">
            حدد الحسابات التي سيقوم النظام بترحيل العمليات إليها تلقائياً. تأكد من اختيار الحسابات الصحيحة لضمان دقة التقارير المالية.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mappings.map((mapping) => (
          <div key={mapping.key} className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-blue-300 transition-colors">
            <div className="flex-1">
              <h5 className="font-bold text-gray-900 text-sm">{mapping.label}</h5>
              <p className="text-gray-500 text-xs mt-1">{mapping.description}</p>
            </div>
            
            <div className="w-full md:w-1/2">
              <select
                value={mapping.account_id || ''}
                onChange={(e) => handleUpdate(mapping.key, e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">-- اختر الحساب --</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
              {mapping.account_id && (
                <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 animate-in fade-in">
                  💡 {getMappingExplanation(mapping.key)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        {error && <span className="text-red-600 text-sm font-medium">{error}</span>}
        {success && <span className="text-green-600 text-sm font-medium animate-in fade-in">تم الحفظ بنجاح!</span>}
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          حفظ التغييرات
        </button>
      </div>
    </div>
  );
};
