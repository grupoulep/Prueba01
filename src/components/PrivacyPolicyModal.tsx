import React from 'react';
import { ShieldCheck, Lock, X, Download } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  showAcceptButton = false
}) => {
  if (!isOpen) return null;

  const handleDownload = () => {
    const textContent = `POLÍTICA DE PRIVACIDAD Y SEGURIDAD DE DATOS PERSONALES - CREDIULEP
Versión: 2.4 - Estándar ISO/IEC 27001 & Protección de Datos
Fecha de Actualización: Octubre 2026

1. COMPROMISO CON LA SEGURIDAD Y PROTECCIÓN DE SUS DATOS
CrediULEP garantiza que la información personal, financiera, saldos y estados de crédito están protegidos con los más altos estándares de seguridad bancaria. Todo el código de la plataforma está diseñado para impedir que terceros no autorizados puedan modificar o alterar la información sensible de los usuarios.

2. AUTENTICACIÓN DE DOS FACTORES (2FA) OBLIGATORIA
Cada cuenta registrada en CrediULEP requiere verificación de dos factores (2FA) con códigos temporales de un solo uso (OTP).

3. TRATAMIENTO Y FINALIDAD DE LOS DATOS
Los datos de identificación (Cédula de Identidad), nombres, teléfonos y correos electrónicos son tratados exclusivamente para la autenticación segura, la evaluación y asignación del crédito solicitado.

4. DERECHOS DEL TITULAR (DERECHOS ARCO)
El titular podrá ejercer en cualquier momento sus derechos de Acceso, Rectificación, Cancelación y Oposición.`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CrediULEP_Politica_Privacidad.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/40 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-xl max-h-[85vh] bg-white border border-purple-200 rounded-lg shadow-xl flex flex-col overflow-hidden text-purple-950"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-200 bg-purple-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-md bg-purple-100 text-purple-700 border border-purple-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-purple-950">
                Políticas de Privacidad y Seguridad
              </h2>
              <p className="text-xs text-purple-700/80">
                Protección Integral de Datos Personales
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-purple-900/80 leading-relaxed">
          <div className="p-3.5 rounded-md bg-purple-50 border border-purple-200 flex items-start space-x-2.5">
            <Lock className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
            <div className="text-xs">
              <strong className="text-purple-950 block font-semibold mb-0.5">
                Seguridad e Integridad Garantizada
              </strong>
              Toda la información sensible (identificación, nombres, saldos y estado del trámite) está protegida con estrictos controles de seguridad institucional. Ninguna persona no autorizada puede alterar sus registros.
            </div>
          </div>

          <section className="space-y-1.5">
            <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
              1. Protección de Datos y Habeas Data
            </h3>
            <p>
              CrediULEP respeta su derecho fundamental a conocer, actualizar y rectificar la información personal recolectada en nuestras bases de datos conforme a la legislación vigente.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
              2. Doble Factor de Autenticación (2FA)
            </h3>
            <p>
              Cada cuenta de usuario registrada cuenta con una capa de autenticación de dos factores que impide el acceso no autorizado aun en caso de divulgación involuntaria de la clave principal.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
              3. Privacidad del Dashboard
            </h3>
            <p>
              El portal exhibe únicamente el Nombre del titular y su saldo disponible en caso de haber sido aprobado y asignado formalmente, resguardando la información en caso de consulta en espacios compartidos.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-purple-200 bg-purple-50/30 flex items-center justify-between">
          <button
            onClick={handleDownload}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar (.txt)
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-1.5 text-xs font-medium text-purple-700 hover:text-purple-950"
            >
              Cerrar
            </button>
            {showAcceptButton && onAccept && (
              <button
                onClick={() => { onAccept(); onClose(); }}
                type="button"
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-md shadow-xs border border-purple-800"
              >
                Aceptar Políticas
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
