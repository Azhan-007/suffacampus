'use client';

import { School } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface SchoolSelectorProps {
  compact?: boolean;
}

export default function SchoolSelector({ compact = false }: SchoolSelectorProps) {
  const { currentSchool, availableSchools, switchSchool, isSuperAdmin } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Move useEffect before any conditional returns to follow Rules of Hooks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Only show for SuperAdmin with multiple schools
  if (!isSuperAdmin() || availableSchools.length <= 1) {
    return null;
  }

  const handleSelect = (school: School) => {
    switchSchool(school.id);
    setIsOpen(false);
  };

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 px-3 py-2 bg-sidebar-hover rounded-lg text-white hover:bg-gray-600 transition-colors"
        >
          <Building2 className="w-4 h-4" />
          <span className="text-sm font-medium truncate max-w-[120px]">
            {currentSchool?.name || 'Select School'}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 py-1.5 z-50 dropdown-animate" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
            {availableSchools.map((school) => (
              <button
                key={school.id}
                onClick={() => handleSelect(school)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-left transition-colors duration-75 ${
                  currentSchool?.id === school.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: school.secondaryColor }}
                >
                  <Building2 className="w-4 h-4" style={{ color: school.primaryColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 truncate">{school.name}</p>
                  <p className="text-[11px] text-slate-500">{school.code}</p>
                </div>
                {currentSchool?.id === school.id && (
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500"
      >
        <div className="flex items-center space-x-3">
          {currentSchool ? (
            <>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: currentSchool.secondaryColor }}
              >
                <Building2 className="w-5 h-5" style={{ color: currentSchool.primaryColor }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{currentSchool.name}</p>
                <p className="text-xs text-gray-500">{currentSchool.city}, {currentSchool.state}</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Select a School</p>
                <p className="text-xs text-gray-500">Choose school to manage</p>
              </div>
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 py-1.5 z-50 max-h-80 overflow-y-auto dropdown-animate" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
          {availableSchools.map((school) => (
            <button
              key={school.id}
              onClick={() => handleSelect(school)}
              className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors duration-75 ${
                currentSchool?.id === school.id ? 'bg-blue-50' : 'hover:bg-slate-50'
              }`}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: school.secondaryColor }}
              >
                <Building2 className="w-5 h-5" style={{ color: school.primaryColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800">{school.name}</p>
                <p className="text-[11px] text-slate-500">
                  {school.code} • {school.city}, {school.state}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    school.subscriptionStatus === 'active' 
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {school.subscriptionPlan}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {school.currentStudents} students
                  </span>
                </div>
              </div>
              {currentSchool?.id === school.id && (
                <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
