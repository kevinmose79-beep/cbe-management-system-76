import React, { useState, useEffect, useRef } from 'react';
import { Building2, CheckCircle2, Save, Upload, Trash2, AlertCircle } from 'lucide-react';
import { School } from '../types';

export const KENYAN_COUNTIES = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  'Murang\'a',
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita Taveta',
  'Tana River',
  'Tharaka Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
];

interface SchoolProfileViewProps {
  school: School;
  onSaveSchool: (updatedSchool: School) => void;
  readOnly?: boolean;
}

export const SchoolProfileView: React.FC<SchoolProfileViewProps> = ({
  school,
  onSaveSchool,
  readOnly = false,
}) => {
  const [formData, setFormData] = useState({
    school_name: school?.school_name || '',
    motto: school?.motto || '',
    county: school?.county || '',
    postal_code: school?.postal_code || school?.address || '',
    email: school?.email || '',
    logo_url: school?.logo_url || '',
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData({
      school_name: school?.school_name || '',
      motto: school?.motto || '',
      county: school?.county || '',
      postal_code: school?.postal_code || school?.address || '',
      email: school?.email || '',
      logo_url: school?.logo_url || '',
    });
  }, [school]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please select a valid image file (PNG, JPG, WebP, or SVG).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate image size (3MB limit)
    const MAX_SIZE = 3 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File size exceeds 3MB limit. Please choose a smaller image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFormData((prev) => ({ ...prev, logo_url: dataUrl }));
    };
    reader.onerror = () => {
      setUploadError('Failed to read image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, logo_url: '' }));
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPostal = formData.postal_code.trim();

    const updated: School = {
      id: school?.id || '00000000-0000-0000-0000-000000000001',
      school_name: formData.school_name.trim(),
      motto: formData.motto.trim(),
      county: formData.county.trim(),
      postal_code: cleanPostal,
      address: cleanPostal, // Synchronize address field for backward compatibility
      email: formData.email.trim(),
      logo_url: formData.logo_url || undefined,
    };

    onSaveSchool(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 4000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Form Container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Container Header */}
        <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="flex items-start space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#E8F5EF] dark:bg-emerald-950/60 text-[#075E42] dark:text-emerald-400 flex items-center justify-center shrink-0 border border-[#087F5B]/20 dark:border-emerald-800/60 mt-0.5">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                School Information &amp; Official Branding
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                Configure the basic school information used throughout the assessment system and official reports.
              </p>
            </div>
          </div>
        </div>

        {/* Success Alert Banner */}
        {savedSuccess && (
          <div className="mx-5 sm:mx-6 mt-4 p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center space-x-2.5 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-medium animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>School information saved successfully!</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* School Name* (Full Width) */}
            <div className="md:col-span-2">
              <label htmlFor="school_name" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                School Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                id="school_name"
                type="text"
                required
                disabled={readOnly}
                placeholder="Enter official school name"
                value={formData.school_name}
                onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#075E42] focus:border-[#075E42] focus:outline-none transition bg-white dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* School Motto (Full Width) */}
            <div className="md:col-span-2">
              <label htmlFor="motto" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                School Motto
              </label>
              <input
                id="motto"
                type="text"
                disabled={readOnly}
                placeholder="Enter school motto"
                value={formData.motto}
                onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#075E42] focus:border-[#075E42] focus:outline-none transition bg-white dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* School Logo / Badge (Full Width) */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="school_logo_input" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                School Logo / Badge
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                {/* Current Logo Preview */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative group">
                  {formData.logo_url ? (
                    <img
                      src={formData.logo_url}
                      alt="School Logo Preview"
                      className="w-full h-full object-contain p-1.5"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-2 text-center">
                      <Building2 className="w-8 h-8 mb-1 opacity-60" />
                      <span className="text-[10px] font-medium">No Logo</span>
                    </div>
                  )}
                </div>

                {/* Upload Controls */}
                <div className="space-y-2 flex-1 min-w-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="school_logo_input"
                    accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                    disabled={readOnly}
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4 text-[#075E42] dark:text-emerald-400" />
                      <span>{formData.logo_url ? 'Change Logo / Badge' : 'Upload Logo / Badge'}</span>
                    </button>
                    {formData.logo_url && !readOnly && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-2 text-xs font-semibold rounded-lg text-red-600 dark:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Upload your official school badge or logo (PNG, JPG, WebP, or SVG, max 3MB). Used in official headers and reports.
                  </p>
                  {uploadError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-rose-400 font-medium pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* County* */}
            <div>
              <label htmlFor="county" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                County<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                id="county"
                required
                disabled={readOnly}
                value={formData.county}
                onChange={(e) => setFormData({ ...formData, county: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#075E42] focus:border-[#075E42] focus:outline-none transition disabled:bg-slate-100 dark:disabled:bg-slate-800/50 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800"
              >
                <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Select County ▼</option>
                {KENYAN_COUNTIES.map((county) => (
                  <option key={county} value={county} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {county}
                  </option>
                ))}
              </select>
            </div>

            {/* Postal Code */}
            <div>
              <label htmlFor="postal_code" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Postal Code
              </label>
              <input
                id="postal_code"
                type="text"
                disabled={readOnly}
                placeholder="e.g. 00100"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#075E42] focus:border-[#075E42] focus:outline-none transition bg-white dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {/* Email Address (Full Width or 2-col) */}
            <div className="md:col-span-2">
              <label htmlFor="email" className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                disabled={readOnly}
                placeholder="e.g. info@school.ac.ke"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-[#075E42] focus:border-[#075E42] focus:outline-none transition bg-white dark:bg-slate-800 disabled:bg-slate-100 dark:disabled:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Form Actions / Save Button */}
          {!readOnly && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 bg-[#075E42] hover:bg-[#054531] active:bg-[#033022] text-white font-bold text-sm rounded-lg shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer focus:ring-2 focus:ring-[#075E42] focus:ring-offset-2 dark:focus:ring-offset-slate-900 min-h-[44px]"
              >
                <Save className="w-4 h-4" />
                <span>Save School Information</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
