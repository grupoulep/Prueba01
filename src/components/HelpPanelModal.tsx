import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  CreditCard,
  Clock,
  ShieldCheck,
  FileText,
  Phone,
  Mail,
  MessageSquare,
  LogOut,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { User } from '../types';

interface HelpPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onLogout: () => void;
  onOpenPrivacyModal?: () => void;
}

export const HelpPanelModal: React.FC<HelpPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onOpenPrivacyModal
}) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  if (!isOpen) return null;

  const firstName = currentUser?.fullName
    ? currentUser.fullName.trim().split(/\s+/)[0]
    : 'Usuario';

  const toggleFaq = (index: number) => {
    setActiveFaq(prev => (prev === index ? null : index));
  };

  const faqs = [
    {
      q: '¿Cómo realizo el pago de mi cuota o un pago parcial?',
      a: 'En tu panel principal encontrarás las opciones para abonar el valor de tu cuota mensual, el saldo restante u otro monto personalizado. Todos los métodos se procesan en línea con cifrado de extremo a extremo.'
    },
    {
      q: '¿Qué medios de pago acepta la plataforma?',
      a: 'La plataforma admite PSE (todos los bancos de Colombia), Tarjetas Débito y Crédito (Visa, Mastercard, American Express), Billeteras digitales (Nequi, Daviplata, Bancolombia a la mano) y Código QR EMVCo interoperable para liquidación instantánea.'
    },
    {
      q: '¿Cómo descargo mi comprobante de pago?',
      a: 'Una vez procesado el pago y confirmada la cuota como pagada, aparecerá automáticamente en pantalla el botón para descargar tu ticket en PDF. También quedará registrado de forma permanente con su número de referencia en tu historial.'
    },
    {
      q: '¿Cuánto tiempo tarda en aprobarse mi crédito si está en evaluación?',
      a: 'Nuestro equipo financiero analiza las solicitudes en un plazo promedio de 15 a 45 minutos en horario hábil. Una vez validada tu documentación, tu cupo quedará habilitado inmediatamente en tu panel.'
    },
    {
      q: '¿Mis datos personales y financieros están seguros?',
      a: 'Sí. Todas las transacciones e información sensible se encuentran protegidas bajo cifrado militar AES-256-GCM y firmas HMAC-SHA256, con auditoría criptográfica verificada.'
    }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-purple-950/70 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-panel-title"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-purple-200 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">
        {/* Encabezado del Panel de Ayuda */}
        <div className="bg-purple-900 text-white px-5 py-4 flex items-center justify-between border-b border-purple-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-purple-800 text-purple-200 flex items-center justify-center border border-purple-600/70 shrink-0">
              <HelpCircle className="w-5 h-5 text-purple-100" />
            </div>
            <div>
              <h3 id="help-panel-title" className="text-sm sm:text-base font-extrabold text-white">
                Centro de Ayuda y Soporte
              </h3>
              <p className="text-[11px] text-purple-200">
                CrediULEP • Asistencia al Cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel de ayuda"
            className="p-1.5 text-purple-300 hover:text-white hover:bg-purple-800/80 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-purple-950 text-xs sm:text-sm">
          {/* Saludo personalizado */}
          <div className="p-3.5 rounded-lg bg-purple-50/80 border border-purple-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-extrabold text-purple-950">
                ¡Hola, {firstName}!
              </p>
              <p className="text-purple-700 text-xs mt-0.5">
                ¿Tienes dudas con tu crédito, cuotas o pagos en línea? Consulta las guías a continuación o comunícate con un asesor.
              </p>
            </div>
          </div>

          {/* Preguntas Frecuentes (Acordeón) */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-purple-900">
              <FileText className="w-3.5 h-3.5 text-purple-700" />
              <span>Preguntas Frecuentes</span>
            </div>

            <div className="space-y-2">
              {faqs.map((faq, idx) => {
                const isOpen = activeFaq === idx;
                return (
                  <div
                    key={idx}
                    className="border border-purple-200/90 rounded-lg overflow-hidden transition"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full px-3.5 py-2.5 text-left bg-white hover:bg-purple-50/50 flex items-center justify-between gap-2 font-bold text-xs text-purple-950 transition cursor-pointer"
                    >
                      <span>{faq.q}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-purple-700 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-purple-400 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-3.5 pb-3 pt-1 text-xs text-purple-800/90 leading-relaxed bg-purple-50/40 border-t border-purple-100">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Canales de Contacto Directo */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-purple-900">
              <MessageSquare className="w-3.5 h-3.5 text-purple-700" />
              <span>Canales de Atención Oficial</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href="https://wa.me/573000000000?text=Hola,%20necesito%20asistencia%20con%20mi%20cuenta%20CrediULEP"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-lg border border-purple-200 hover:border-purple-400 bg-white hover:bg-purple-50/50 flex items-center gap-2.5 transition group"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-purple-950">Línea WhatsApp</div>
                  <div className="text-[11px] text-purple-600">Atención inmediata</div>
                </div>
              </a>

              <a
                href="mailto:soporte@crediulep.com?subject=Solicitud de Asistencia"
                className="p-3 rounded-lg border border-purple-200 hover:border-purple-400 bg-white hover:bg-purple-50/50 flex items-center gap-2.5 transition group"
              >
                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-purple-950">Correo de Soporte</div>
                  <div className="text-[11px] text-purple-600">soporte@crediulep.com</div>
                </div>
              </a>
            </div>
          </div>

          {/* Enlaces de Seguridad y Privacidad */}
          {onOpenPrivacyModal && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPrivacyModal();
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100/70 border border-purple-200 text-purple-900 text-xs font-bold flex items-center justify-between transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-700" />
                  <span>Ver Políticas de Privacidad y Tratamiento de Datos</span>
                </span>
                <span className="text-purple-600">→</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer con opción de Cerrar Sesión Segura y Botón Cerrar */}
        <div className="p-3.5 bg-purple-50/80 border-t border-purple-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 border border-rose-300 rounded-md transition cursor-pointer shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Cerrar Sesión</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-md transition cursor-pointer shadow-2xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
