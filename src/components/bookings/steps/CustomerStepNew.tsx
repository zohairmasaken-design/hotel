'use client';

import React, { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, User, Plus, ChevronDown, Loader2, CheckCircle2, AlertCircle, Phone, Mail, MapPin, Building2, Users, Award, Crown, Star } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { countries } from "@/constants/countries"
import { useAppLanguage } from "@/hooks/useAppLanguage"

const bookingPlatforms = [
  "Booking.com", "Agoda", "Airbnb", "Expedia", "Hotels.com", "Trip.com",
  "Google Hotels", "Gathern (جاذر إن)", "Almatar (المطار)", "Almosafer (المسافر)",
  "Ego (إيجو)", "Holidays (عطلات)", "Flynas", "Saudia Holidays"
]

export interface Customer {
  id: string
  full_name: string
  national_id?: string
  phone: string
  customer_type: "individual" | "company" | "broker" | "platform"
  nationality?: string
  email?: string
  address?: string
  details?: string
  commercial_register?: string
  company_name?: string
  broker_name?: string
  broker_id?: string
  platform_name?: string
  created_at: string
}

interface CustomerStepProps {
  onNext: (customer: Customer, meta?: { 
    bookingSource?: "reception"|"platform"|"broker" 
    platformName?: string 
    brokerName?: string 
    brokerId?: string 
  }) => void
  initialCustomer?: Customer
  initialQuery?: string
  language?: "ar" | "en"
  className?: string
}

export const CustomerStep: React.FC<CustomerStepProps> = ({ 
  onNext, 
  initialCustomer, 
  initialQuery, 
  language: languageProp, 
  className 
}) => {
  const { language } = useAppLanguage()
  const t = (arText: string, enText: string) => language === "en" ? enText : arText
  
  // Core state
  const [searchQuery, setSearchQuery] = useState(initialQuery || "")
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer || null)
  const [isCreating, setIsCreating] = useState(false)
  
  // Booking source state
  const [bookingSource, setBookingSource] = useState<"reception" | "platform" | "broker">("reception")
  const [platformName, setPlatformName] = useState("")
  const [brokerName, setBrokerName] = useState("")
  const [brokerId, setBrokerId] = useState("")
  
  // Form state
  const [formData, setFormData] = useState<Partial<Customer>>({
    customer_type: "individual" as const,
    nationality: language === "en" ? "Saudi Arabia" : "السعودية"
  })
  const [saving, setSaving] = useState(false)
  
  // Recent customers
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([])
  const [showRecent, setShowRecent] = useState(true)
  
  // Animations & UI
  const searchRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Load recent customers on mount
  useEffect(() => {
    loadRecentCustomers()
  }, [])

  const loadRecentCustomers = async () => {
    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)
      if (data) setRecentCustomers(data)
    } catch (error) {
      console.error("Failed to load recent customers:", error)
    }
  }

  // Smart search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setCustomers([])
      return
    }

    const timeout = setTimeout(async () => {
      setLoading(true)
      try {
        const q = searchQuery.trim()
        const digits = q.replace(/\\D+/g, "")
        const isDigits = digits.length === q.length
        
        let query = supabase
          .from("customers")
          .select("*")
          .limit(8)
        
        if (isDigits && digits.length === 10) {
          query = query.or(`national_id.eq.${digits},phone.ilike.${digits}%`)
        } else {
          const safe = q.replace(/[ ,()]/g, " ")
          query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,national_id.ilike.%${safe}%`)
        }
        
        const { data, error } = await query.order("created_at", { ascending: false })
        setCustomers(error ? [] : data || [])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchQuery])

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.full_name?.trim() || !formData.phone?.trim()) return

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert([formData])
        .select()
        .single()

      if (error) throw error
      if (data) {
        setSelectedCustomer(data)
        setIsCreating(false)
        loadRecentCustomers() // Refresh recent list
      }
    } catch (error: any) {
      alert(`خطأ: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleQuickSelect = (customer: Customer) => {
    setSelectedCustomer(customer)
    setSearchQuery("")
  }

  const handleSourceChange = (source: typeof bookingSource) => {
    setBookingSource(source)
    if (source !== "reception") {
      setPlatformName("")
      setBrokerName("")
      setBrokerId("")
    }
  }

  const RecentCustomerCard = ({ customer }: { customer: Customer }) => (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="group bg-gradient-to-r from-slate-50 to-blue-50/50 backdrop-blur-sm border border-slate-100/50 hover:border-blue-200 rounded-2xl p-4 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden hover:bg-blue-50 cursor-pointer"
      onClick={() => handleQuickSelect(customer)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 border-2 border-white shadow-md flex-shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm">
            {customer.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-base group-hover:text-blue-700 line-clamp-1 mb-1">
            {customer.full_name}
          </div>
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-slate-200 text-slate-700 hover:bg-slate-300">
              {customer.phone}
            </Badge>
            {customer.national_id && (
              <Badge variant="outline" className="text-xs px-2 py-0.5 bg-white/50 text-slate-600 border-slate-200">
                {customer.national_id}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-3 w-3" />
            <span>{customer.customer_type === "individual" ? "فرد" : customer.customer_type === "company" ? "شركة" : "منصة"}</span>
          </div>
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="ml-2 flex-shrink-0"
        >
          <CheckCircle2 className="h-6 w-6 text-emerald-500 group-hover:scale-110 transition-transform" />
        </motion.div>
      </div>
    </motion.div>
  )

  return (
    <div className={cn("space-y-8 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8", className)}>
      {/* 🎨 Hero Search Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600/90 rounded-3xl p-1 shadow-2xl"
      >
        <Card className="bg-white/20 backdrop-blur-xl border-0 shadow-2xl rounded-[1.75rem] overflow-hidden border-white/20">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
                <Search className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black text-white/95 tracking-tight">
                  {t("ابحث عن العميل", "Find Customer")}
                </CardTitle>
                <CardDescription className="text-white/70">
                  {t("الاسم، رقم الجوال، أو الهوية الوطنية", "Name, phone, or national ID")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/60 group-focus-within:text-white transition-colors" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("ابدأ الكتابة للبحث...", "Start typing to search...")}
                className="h-16 bg-white/20 backdrop-blur-sm border-0 text-lg font-bold text-white/95 placeholder:text-white/50 pl-12 focus:bg-white/30 focus:text-gray-900 focus:placeholder-gray-500 rounded-2xl shadow-inner border-white/20 hover:border-white/30 focus:border-white/40 focus:ring-4 focus:ring-white/20 focus:ring-offset-0 transition-all duration-300"
                autoFocus
              />
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                  >
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 📱 Recent Customers Carousel */}
      {showRecent && recentCustomers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-500" />
              {t("آخر العملاء", "Recent Customers")}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowRecent(false)}>
              {t("إخفاء", "Hide")}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentCustomers.slice(0, 6).map((customer) => (
              <RecentCustomerCard key={customer.id} customer={customer} />
            ))}
          </div>
        </motion.div>
      )}

      {/* 🔍 Search Results */}
      <AnimatePresence mode="wait">
        {customers.length > 0 && !isCreating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-gray-600">
              <Star className="h-4 w-4 text-amber-500" />
              <span>{t("تم العثور على", "Found")} {customers.length} {t("عميل", "customer")}</span>
            </div>
            {customers.map((customer) => (
              <motion.div
                key={customer.id}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group bg-gradient-to-r from-slate-50 to-blue-50/30 backdrop-blur-sm border border-slate-100/50 hover:border-blue-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden hover:bg-white/60"
                onClick={() => handleQuickSelect(customer)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-emerald-500/5 -m-1 rounded-[1.75rem] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-16 w-16 border-4 border-white shadow-2xl ring-4 ring-white/50 group-hover:scale-110 transition-all duration-300">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xl">
                        {customer.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)}
                      </AvatarFallback>
                    </Avatar>
                    <Badge className="absolute -bottom-2 -right-2 bg-emerald-500 text-white font-bold shadow-lg border-2 border-white">
                      VIP
                    </Badge>
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-black text-2xl bg-gradient-to-r from-gray-900 to-slate-800 bg-clip-text text-transparent mb-2 line-clamp-1">
                      {customer.full_name}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span className="font-mono bg-white/70 px-3 py-1 rounded-full text-xs font-bold text-gray-800 shadow-sm">
                          {customer.phone}
                        </span>
                      </div>
                      {customer.national_id && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <ShieldCheck className="h-4 w-4" />
                          <span>{customer.national_id}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2">
                        <Badge variant={customer.customer_type === "individual" ? "secondary" : "default"} className="text-xs">
                          {customer.customer_type === "individual" ? "فرد" : customer.customer_type === "company" ? "شركة" : "منصة"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <motion.div 
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="flex flex-col items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 ml-4"
                  >
                    <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-lg animate-ping" />
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 drop-shadow-lg" />
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {!customers.length && searchQuery && !loading && !isCreating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20"
          >
            <AlertCircle className="mx-auto h-16 w-16 text-gray-400 mb-6" />
            <h3 className="text-xl font-black text-gray-900 mb-4">
              {t("لم نجد", "No results")}
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              {t("لا توجد نتائج مطابقة", "No matching results found")}
            </p>
            <Button 
              size="lg" 
              className="group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-2xl hover:shadow-blue-500/25 text-lg font-black px-10 h-14 rounded-2xl"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
              {t("إنشاء عميل جديد", "Create New Customer")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✨ Glassmorphism Create Form */}
      <AnimatePresence mode="wait">
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            transition={{ duration: 0.4, type: "spring" }}
          >
            <Card className="border-0 bg-gradient-to-br from-white/60 via-white/30 to-slate-50/40 backdrop-blur-3xl shadow-2xl border-white/20 hover:shadow-3xl transition-all duration-500">
              <CardHeader className="pb-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl shadow-2xl text-white">
                    <Users className="h-8 w-8" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-black bg-gradient-to-r from-gray-900 via-slate-800 to-black bg-clip-text text-transparent">
                      عميل جديد
                    </CardTitle>
                    <CardDescription className="text-lg text-slate-600 font-medium">
                      {t("املأ البيانات الأساسية", "Fill basic information")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-8">
                {/* Booking Source Quick Select */}
                <div>
                  <h4 className="text-lg font-black mb-4 flex items-center gap-3 text-gray-900">
                    <Award className="h-6 w-6 text-amber-500" />
                    مصدر الحجز
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: "reception" as const, label: "استقبال", icon: Building2, color: "gray" },
                      { key: "platform" as const, label: "منصة", icon: Star, color: "indigo" },
                      { key: "broker" as const, label: "وسيط", icon: Users, color: "amber" }
                    ].map(({ key, label, icon: Icon, color }) => (
                      <Button
                        key={key}
                        variant={bookingSource === key ? "default" : "outline"}
                        className={cn(
                          "h-20 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 group relative overflow-hidden",
                          bookingSource === key ? `bg-gradient-to-r from-${color}-500 to-${color}-600 text-white shadow-${color}-500/25` : "bg-white/70 backdrop-blur-sm border-slate-200 hover:border-slate-300"
                        )}
                        onClick={() => handleSourceChange(key)}
                      >
                        {bookingSource === key && (
                          <motion.div 
                            className="absolute inset-0 bg-white/20 animate-shimmer -skew-x-12"
                            style={{ backgroundSize: "200% 100%" }}
                          />
                        )}
                        <div className="relative z-10 flex flex-col items-center gap-2">
                          <motion.div 
                            animate={bookingSource === key ? { scale: 1.1, rotate: 5 } : { scale: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Icon className={cn("h-8 w-8", bookingSource === key ? "drop-shadow-lg" : "")} />
                          </motion.div>
                          <span>{label}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Quick Form */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-black text-gray-900 mb-2 block">الاسم الكامل <span className="text-red-500">*</span></label>
                      <Input 
                        value={formData.full_name || ""}
                        onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                        className="h-14 text-lg font-bold rounded-2xl shadow-inner focus:shadow-blue-500/25 bg-white/70 backdrop-blur-sm border-2 border-slate-200 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/50"
                        placeholder="الاسم الثلاثي الكامل"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-black text-gray-900 mb-2 block">رقم الجوال <span className="text-red-500">*</span></label>
                      <Input 
                        type="tel"
                        value={formData.phone || ""}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="h-14 text-lg font-bold dir-ltr rounded-2xl shadow-inner focus:shadow-emerald-500/25 bg-white/70 backdrop-blur-sm border-2 border-slate-200 hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100/50"
                        placeholder="05XXXXXXXX"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-black text-gray-900 mb-2 block">نوع الوثيقة</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button className="h-14 w-full justify-start text-left font-bold rounded-2xl bg-white/70 backdrop-blur-sm border-2 border-slate-200 hover:border-indigo-300 focus:border-indigo-400 shadow-inner">
                            <ChevronDown className="mr-2 h-4 w-4 shrink-0" />
                            {documentType || "اختر نوع الوثيقة"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full rounded-2xl p-2 bg-white/90 backdrop-blur-sm border-slate-200">
                          {["هوية وطنية", "إقامة", "جواز سفر", "بطاقة GCC"].map((type) => (
                            <Button
                              key={type}
                              variant="ghost"
                              className="w-full justify-start h-12 rounded-xl hover:bg-indigo-50"
                              onClick={() => {
                                setDocumentType(type)
                              }}
                            >
                              {type}
                            </Button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <label className="text-sm font-black text-gray-900 mb-2 block">رقم الهوية</label>
                      <Input 
                        type="text"
                        maxLength={10}
                        value={formData.national_id || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\\D/g, "")
                          if (val.length <= 10) {
                            setFormData({...formData, national_id: val})
                          }
                        }}
                        className="h-14 text-lg font-bold dir-ltr rounded-2xl shadow-inner focus:shadow-purple-500/25 bg-white/70 backdrop-blur-sm border-2 border-slate-200 hover:border-slate-300 focus:border-purple-400 focus:ring-4 focus:ring-purple-100/50"
                        placeholder="XXXXXXXXXX"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-8">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-16 rounded-2xl text-lg font-black shadow-lg border-2 border-slate-200 hover:border-gray-300 bg-white/70 backdrop-blur-sm hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300"
                    onClick={() => setIsCreating(false)}
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleCreateCustomer as any}
                    disabled={saving || !formData.full_name?.trim() || !formData.phone?.trim()}
                    className="flex-1 h-16 rounded-2xl text-lg font-black shadow-2xl hover:shadow-emerald-500/25 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      "حفظ العميل الجديد ✨"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Action Bar */}
      {!isCreating && !selectedCustomer && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 pt-12 border-t border-slate-100"
        >
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-16 rounded-3xl font-black text-lg border-2 shadow-lg bg-gradient-to-r from-slate-50 to-white/70 backdrop-blur-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="mr-3 h-6 w-6" />
            {t("عميل جديد", "New Customer")}
          </Button>
        </motion.div>
      )}
    </div>
  )
}

