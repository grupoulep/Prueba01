import React from 'react';
import { ShieldCheck, Lock, FileText, Phone, Mail, Building2 } from 'lucide-react';

interface FooterProps {
  onOpenPrivacyModal: () => void;
  onOpenAuditModal?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenPrivacyModal
}) => {
  return (
    <footer className="border-t border-purple-800 bg-purple-900 text-purple-100 text-xs mt-auto w-full">
      {/* Cuerpo del Pie de Página */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 border-b border-purple-800/70">
        {/* Columna 1: Identidad Institucional */}
        <div className="space-y-2">
          <div className="flex items-center">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/logo-bordered.png`}
              alt="Logo"
              className="h-5 sm:h-6 w-auto object-contain select-none shrink-0"
            />
          </div>
          <p className="text-xs text-purple-200/90 leading-relaxed">
            Plataforma financiera para la gestión de préstamos otorgados, recaudos de cuotas y liquidación de obligaciones crediticias.
          </p>
        </div>

        {/* Columna 2: Canales de Atención y Recaudo */}
        <div className="space-y-2">
          <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-300 shrink-0" />
            <span>Atención al Cliente y Pagos</span>
          </h4>
          <ul className="space-y-1.5 text-xs text-purple-200/90">
            <li className="flex items-start sm:items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5 sm:mt-0" />
              <span className="break-words">Línea Nacional: 01 8000 912 450 • (+57) 601 745 8900</span>
            </li>
            <li className="flex items-start sm:items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5 sm:mt-0" />
              <span className="break-all sm:break-normal">recaudos@crediulep.com • soporte@crediulep.com</span>
            </li>
            <li className="flex items-start sm:items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-purple-300 shrink-0 mt-0.5 sm:mt-0" />
              <span>Pagos protegidos y respaldados con firma electrónica</span>
            </li>
          </ul>
        </div>

        {/* Columna 3: Políticas en el Pie de Página */}
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
            Marco Legal y Transparencia
          </h4>
          <p className="text-[11px] text-purple-200/80 leading-snug">
            Cumplimiento de la Ley 1581 de 2012 (Habeas Data) y Ley 527 de 1999 de Comercio Electrónico.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenPrivacyModal}
              className="px-3.5 py-2 sm:py-1.5 bg-white hover:bg-purple-100 text-purple-950 border border-purple-200 rounded-sm font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-purple-800 shrink-0" />
              <span>Políticas de Privacidad</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra Inferior de Derechos Reservados */}
      <div className="bg-purple-950 border-t border-purple-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left text-[11px] text-purple-200/90">
          <span>
            © {new Date().getFullYear()} <strong className="text-white">CrediULEP S.A.S.</strong> — Todos los derechos reservados.
          </span>
          <span className="font-mono text-[10px] text-purple-300">
            Vigilado • Operaciones de Préstamo y Recaudo Verificadas
          </span>
        </div>
      </div>
    </footer>
  );
};

