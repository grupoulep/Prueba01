/**
 * Servicio de Notificaciones Push para cambios en el estado del trámite y alertas de seguridad
 */

import { PushNotificationItem } from '../types';

type NotificationListener = (notification: PushNotificationItem) => void;

class NotificationService {
  private listeners: NotificationListener[] = [];
  private audioContext: AudioContext | null = null;

  constructor() {
    // Escuchar si la ventana está activa
  }

  /**
   * Solicita permiso al usuario para Notificaciones Push del navegador de forma segura
   */
  async requestPushPermission(): Promise<'granted' | 'denied' | 'default'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    // En iframes (como el entorno de vista previa web) los navegadores restringen
    // Notification.requestPermission() y pueden colgar la promesa indefinidamente.
    try {
      if (window.self !== window.top) {
        return Notification.permission || 'default';
      }
    } catch {
      return 'denied';
    }

    try {
      // Usar Promise.race con tiempo límite estricto de 800ms para evitar bloqueos
      const permissionPromise = Notification.requestPermission();
      const timeoutPromise = new Promise<'default'>(resolve => setTimeout(() => resolve('default'), 800));
      const permission = await Promise.race([permissionPromise, timeoutPromise]);
      return permission;
    } catch (e) {
      console.warn('Permiso de notificaciones push omitido:', e);
      return 'denied';
    }
  }

  /**
   * Verifica si las notificaciones push están concedidas en el navegador
   */
  getPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Reproduce un tono de confirmación bancaria sutil usando Web Audio API
   */
  playNotificationSound(type: 'success' | 'alert' = 'success') {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      const now = this.audioContext.currentTime;

      if (type === 'success') {
        // Tono armónico ascendente
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        // Tono de atención
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(349.23, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (err) {
      // Audio suppression in strict browsers is caught silently
      console.debug('Audio context not ready:', err);
    }
  }

  /**
   * Envía una notificación Push tanto a nivel de Navegador/SO como In-App
   */
  sendPush(notification: Omit<PushNotificationItem, 'id' | 'timestamp' | 'read'>): PushNotificationItem {
    const item: PushNotificationItem = {
      ...notification,
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      read: false
    };

    // Notificaciones desactivadas a petición del usuario
    return item;
  }

  subscribe(listener: NotificationListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(item: PushNotificationItem) {
    this.listeners.forEach(fn => fn(item));
  }

  private persistNotification(item: PushNotificationItem) {
    try {
      const stored = localStorage.getItem('crediportal_notifications');
      const list: PushNotificationItem[] = stored ? JSON.parse(stored) : [];
      list.unshift(item);
      localStorage.setItem('crediportal_notifications', JSON.stringify(list.slice(0, 30)));
    } catch (e) {
      console.error('Error guardando notificación:', e);
    }
  }

  getStoredNotifications(): PushNotificationItem[] {
    try {
      const stored = localStorage.getItem('crediportal_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  markAllAsRead() {
    try {
      const list = this.getStoredNotifications().map(n => ({ ...n, read: true }));
      localStorage.setItem('crediportal_notifications', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  }
}

export const notificationService = new NotificationService();
