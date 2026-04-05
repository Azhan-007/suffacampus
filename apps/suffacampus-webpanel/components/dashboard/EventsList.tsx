'use client';

import { CalendarDays, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Event } from '@/types';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const EVENT_COLORS: Record<string, string> = {
  Sports:   'bg-emerald-50 text-emerald-600',
  Meeting:  'bg-amber-50 text-amber-600',
  Cultural: 'bg-violet-50 text-violet-600',
  Academic: 'bg-sky-50 text-sky-600',
  Holiday:  'bg-rose-50 text-rose-600',
  Exam:     'bg-red-50 text-red-600',
  Other:    'bg-slate-50 text-slate-500',
};

function EventsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
          <div className="w-12 h-14 rounded-xl bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 bg-slate-100 rounded w-3/4" />
            <div className="h-2.5 bg-slate-50 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EventsListProps {
  events: Event[];
  loading?: boolean;
}

export default function EventsList({ events, loading = false }: EventsListProps) {
  if (loading) return <EventsSkeleton />;

  return (
    <>
      <div className="space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group cursor-default"
          >
            {/* Date pill */}
            <div className="w-12 h-14 rounded-lg bg-blue-600 flex flex-col items-center justify-center text-white shrink-0">
              <span className="text-[10px] font-medium uppercase leading-none">
                {format(new Date(event.eventDate), 'MMM')}
              </span>
              <span className="text-lg font-semibold leading-tight">
                {format(new Date(event.eventDate), 'd')}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-700 truncate">{event.title}</h4>
              {event.location && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 shrink-0" /> {event.location}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(event.eventDate), 'EEE, MMM d')}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_COLORS[event.eventType] || EVENT_COLORS.Other}`}>
                  {event.eventType}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="text-center py-10">
          <CalendarDays className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No upcoming events</p>
        </div>
      )}

      {events.length > 0 && (
        <div className="pt-3 mt-2 border-t border-slate-100">
          <Link
            href="/events"
            scroll={false}
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors py-1"
          >
            View all events <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </>
  );
}
