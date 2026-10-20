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
    <footer className="border-t border-purple-800 bg-purple-900 text-purple-100 text-xs mt-auto">
      {/* Cuerpo del Pie de Página */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-purple-800/70">
        {/* Columna 1: Identidad Institucional */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-white flex items-center justify-center text-purple-900 border border-purple-200 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-purple-900" />
            </div>
            <span className="font-extrabold text-base text-white tracking-tight">
              Credi<span className="text-purple-300">ULEP</span>
            </span>
          </div>
          <p className="text-xs text-purple-200/90 leading-relaxed">
            Plataforma financiera para la gestión de préstamos otorgados, recaudos de cuotas y liquidación de obligaciones crediticias.
          </p>
        </div>

        {/* Columna 2: Canales de Atención y Recaudo */}
        <div className="space-y-2">
          <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-300" />
            <span>Atención al Cliente y Pagos</span>
          </h4>
          <ul className="space-y-1.5 text-xs text-purple-200/90">
            <li className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span>Línea Nacional: 01 8000 912 450 • (+57) 601 745 8900</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span>recaudos@crediulep.com • soporte@crediulep.com</span>
            </li>
            <li className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span>Pagos protegidos y respaldados con firma electrónica</span>
            </li>
          </ul>
        </div>

        {/* Columna 3: Políticas en el Pie de Página */}
        <div className="space-y-2">
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
              className="px-3 py-1.5 bg-white hover:bg-purple-100 text-purple-950 border border-purple-200 rounded-sm font-semibold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-purple-800" />
              <span>Políticas de Privacidad</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra Inferior de Derechos Reservados */}
      <div className="bg-purple-950 border-t border-purple-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-purple-200/90">
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

