import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CrediULEP ErrorBoundary atrapó un error:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      sessionStorage.clear();
      // No borramos localStorage para preservar datos cifrados, solo recargamos
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#fcfaff] flex flex-col items-center justify-center p-6 font-sans">
          <div className="bg-white border border-purple-200 rounded-2xl p-8 shadow-sm flex flex-col items-center space-y-4 max-w-md w-full text-center">
            <div className="w-full flex items-center justify-center">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`}
                alt="Logo"
                className="h-6 sm:h-7 w-auto object-contain select-none mx-auto block"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-purple-700/80">
                Se detectó una excepción en la inicialización de la sesión.
              </p>
            </div>
            {this.state.error?.message && (
              <div className="w-full bg-purple-50/70 border border-purple-100 rounded-xl p-3 text-xs text-purple-900 font-mono text-left break-all">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar Bóveda y Entrar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
