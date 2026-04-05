'use client';
import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Camera, Upload, X, User } from 'lucide-react';

interface PhotoUploadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  shape?: 'circle' | 'rounded';
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'w-16 h-16', icon: 'w-5 h-5', badge: 'w-6 h-6' },
  md: { container: 'w-24 h-24', icon: 'w-8 h-8', badge: 'w-7 h-7' },
  lg: { container: 'w-32 h-32', icon: 'w-10 h-10', badge: 'w-8 h-8' },
};

export default function PhotoUpload({
  value,
  onChange,
  onRemove,
  size = 'md',
  label = 'Upload Photo',
  shape = 'circle',
  className = '',
}: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const s = SIZE_MAP[size];
  const roundClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) return; // 5MB max
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) onChange(result);
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {label && (
        <label className="block text-[13px] font-semibold text-slate-700">{label}</label>
      )}
      <div
        className={`relative group cursor-pointer ${s.container} ${roundClass} overflow-hidden border-2 border-dashed transition-all duration-200 ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : value
            ? 'border-transparent'
            : 'border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {value ? (
          <>
            <Image
              src={value}
              alt="Photo"
              width={192}
              height={192}
              className="w-full h-full object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <User className={s.icon} />
          </div>
        )}

        {value && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {!value && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Browse
        </button>
      )}
    </div>
  );
}
