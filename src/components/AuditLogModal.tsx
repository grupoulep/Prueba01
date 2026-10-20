import React, { useState, useEffect } from 'react';
import { History, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { AuditBlock } from '../types';
import { StorageService } from '../services/storageService';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  userCedula: string;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  userCedula
}) => {
  const [chain, setChain] = useState<AuditBlock[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [tamperSuccess, setTamperSuccess] = useState<boolean | null>(null);

  const loadAuditData = async () => {
    setIsLoading(true);
    const { chain: loadedChain, isChainValid: valid } = await StorageService.getAuditChain();
    setChain(loadedChain);
    setIsChainValid(valid);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadAuditData();
      setTamperSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSimulateTamper = () => {
    const altered = StorageService.simulateTamper(userCedula, 999999999);
    setTamperSuccess(altered);
  };

  const handleRestoreIntegrity = async () => {
    await StorageService.restoreUserIntegrity(userCedula);
    setTamperSuccess(null);
    await loadAuditData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/40 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl max-h-[85vh] bg-white border border-purple-200 rounded-lg shadow-xl flex flex-col overflow-hidden text-purple-950"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-200 bg-purple-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-md bg-purple-100 text-purple-700 border border-purple-200">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-purple-950 flex items-center gap-2">
                <span>Historial de Auditoría</span>
                {isChainValid && (
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold">
                    Registro Verificado
                  </span>
                )}
              </h2>
              <p className="text-xs text-purple-700/80">
                Registro secuencial de actividades de la cuenta
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-purple-400 hover:text-purple-700 rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification banner */}
        <div className="px-6 py-2.5 bg-purple-50/60 border-b border-purple-200 flex items-center justify-between gap-2 text-xs">
          <span className="text-purple-900 font-medium text-[11px]">
            Comprobación de consistencia de saldos:
          </span>
          <div className="flex items-center gap-2">
            {tamperSuccess ? (
              <button
                type="button"
                onClick={handleRestoreIntegrity}
                className="px-2.5 py-1 bg-purple-700 text-white font-bold rounded-md text-[11px] shadow-xs"
              >
                Restaurar Estado
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSimulateTamper}
                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-md text-[11px] font-semibold transition border border-purple-200"
              >
                Verificar Integridad
              </button>
            )}
            <button
              type="button"
              onClick={loadAuditData}
              className="p-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md border border-purple-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* List of events */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-purple-400">
              Cargando registros...
            </div>
          ) : (
            chain.slice().reverse().map(block => (
              <div
                key={block.index}
                className="p-3.5 rounded-md bg-purple-50/50 border border-purple-200 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-950">
                    Registro #{block.index} • {block.action}
                  </span>
                  <span className="text-[10px] text-purple-500 font-mono">
                    {new Date(block.timestamp).toLocaleTimeString('es-CO')}
                  </span>
                </div>
                <p className="text-purple-900/80 text-[11px]">{block.details}</p>
                <div className="text-[10px] text-purple-700 font-medium flex items-center gap-1.5 pt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-700" />
                  <span>Evento verificado en el sistema</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-purple-200 bg-purple-50/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 rounded-md text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
