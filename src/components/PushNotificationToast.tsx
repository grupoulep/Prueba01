import React, { useState, useEffect } from 'react';
import { PushNotificationItem } from '../types';
import { notificationService } from '../services/notificationService';
import { BellRing, CheckCircle2, AlertCircle, X } from 'lucide-react';

export const PushNotificationToast: React.FC = () => {
  const [activeToast, setActiveToast] = useState<PushNotificationItem | null>(null);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((notification) => {
      setActiveToast(notification);

      const timer = setTimeout(() => {
        setActiveToast(prev => (prev?.id === notification.id ? null : prev));
      }, 5000);

      return () => clearTimeout(timer);
    });

    return () => unsubscribe();
  }, []);

  if (!activeToast) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:bottom-5 sm:right-5 z-50 sm:max-w-sm sm:w-full pointer-events-auto animate-fadeIn">
      <div className="bg-white border border-purple-200 rounded-md p-3.5 sm:p-4 shadow-lg flex items-start gap-3 text-purple-950">
        <div className="p-2 rounded-md bg-purple-50 text-purple-700 border border-purple-200 shrink-0 mt-0.5">
          {activeToast.type === 'credit_assigned' ? (
            <CheckCircle2 className="w-5 h-5 text-purple-700" />
          ) : activeToast.type === 'credit_pending' ? (
            <AlertCircle className="w-5 h-5 text-amber-600" />
          ) : (
            <BellRing className="w-5 h-5 text-purple-700" />
          )}
        </div>

        <div className="flex-1 space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700 font-mono">
              Notificación Oficial
            </span>
            <span className="text-[10px] text-purple-400 font-mono">
              {activeToast.timestamp}
            </span>
          </div>
          <h4 className="text-xs font-bold text-purple-950 leading-tight">
            {activeToast.title}
          </h4>
          <p className="text-xs text-purple-800/80 leading-snug">
            {activeToast.message}
          </p>
        </div>

        <button
          onClick={() => setActiveToast(null)}
          className="text-purple-400 hover:text-purple-700 p-1 rounded transition"
          aria-label="Cerrar notificación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
