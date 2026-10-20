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
    <footer className="border-t border-purple-200 bg-white text-purple-900/80 text-xs mt-auto">
      {/* Cuerpo del Pie de Página */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-purple-100">
        {/* Columna 1: Identidad Institucional */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-purple-700 flex items-center justify-center text-white border border-purple-800">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base text-purple-950 tracking-tight">
              Credi<span className="text-purple-700">ULEP</span>
            </span>
          </div>
          <p className="text-xs text-purple-800/80 leading-relaxed">
            Plataforma financiera para la gestión de préstamos otorgados, recaudos de cuotas y liquidación de obligaciones crediticias.
          </p>
        </div>

        {/* Columna 2: Canales de Atención y Recaudo */}
        <div className="space-y-2">
          <h4 className="font-bold text-purple-950 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-700" />
            <span>Atención al Cliente y Pagos</span>
          </h4>
          <ul className="space-y-1.5 text-xs text-purple-800/85">
            <li className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span>Línea Nacional: 01 8000 912 450 • (+57) 601 745 8900</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span>recaudos@crediulep.com • soporte@crediulep.com</span>
            </li>
            <li className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span>Pagos protegidos y respaldados con firma electrónica</span>
            </li>
          </ul>
        </div>

        {/* Columna 3: Políticas en el Pie de Página */}
        <div className="space-y-2">
          <h4 className="font-bold text-purple-950 uppercase tracking-wider text-[11px]">
            Marco Legal y Transparencia
          </h4>
          <p className="text-[11px] text-purple-700/80 leading-snug">
            Cumplimiento de la Ley 1581 de 2012 (Habeas Data) y Ley 527 de 1999 de Comercio Electrónico.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenPrivacyModal}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-sm font-semibold transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-purple-700" />
              <span>Políticas de Privacidad</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra Inferior de Derechos Reservados */}
      <div className="bg-purple-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-purple-700/90">
          <span>
            © {new Date().getFullYear()} <strong>CrediULEP S.A.S.</strong> — Todos los derechos reservados.
          </span>
          <span className="font-mono text-[10px] text-purple-700">
            Vigilado • Operaciones de Préstamo y Recaudo Verificadas
          </span>
        </div>
      </div>
    </footer>
  );
};

