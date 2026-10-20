# DOCUMENTO DE VISUALIZACIÓN Y DESPLIEGUE EN GITHUB
## Plataforma Financiera CrediULEP (AES-256-GCM)

Este documento independiente contiene la guía completa y detallada para **visualizar la página web directamente desde GitHub** sin pantallas en blanco ni errores de rutas.

---

## ¿POR QUÉ NO SE VEÍA NADA (PANTALLA EN BLANCO) Y CÓMO ESTÁ SOLUCIONADO?

Al publicar un proyecto moderno de React + Vite en GitHub, si se abre el enlace y **no se ve nada o aparece una pantalla blanca**, se debe a 2 razones técnicas muy comunes:

### 1. El selector de carpeta de GitHub Pages estaba en `/ (root)` en vez de `/docs`
* **Lo que ocurría:** Por defecto, GitHub Pages busca un archivo `index.html` en la raíz del repositorio. El `index.html` fuente de React llama a `/src/main.tsx` (TypeScript con JSX). Los navegadores web **no saben interpretar TypeScript ni JSX directamente** sin compilarlo a JavaScript estándar, y además la ruta `/src/main.tsx` buscaba en `https://tu-usuario.github.io/src/main.tsx` en lugar de la subcarpeta de tu proyecto (`/tu-repositorio/`). Al no encontrarlo o no poder procesarlo, el navegador se detenía y dejaba la pantalla blanca.
* **Cómo lo solucionamos de raíz:**
  - **Script de Redirección Automática en `index.html`:** Si alguien deja configurada la carpeta en `/ (root)` en GitHub, el archivo detecta la plataforma y redirige de inmediato a la carpeta compilada `/docs/`.
  - **Carpeta `/docs` Precompilada y Actualizada:** Contiene la versión de producción empaquetada (HTML, CSS y JS estándar) con rutas relativas (`./assets/...`).
  - **Componente `ErrorBoundary` y Salvaguarda de Carga:** Protege la aplicación para que la pantalla de inicio nunca se quede colgada en blanco bajo ninguna circunstancia.

### 2. El fallo de dependencias en GitHub Actions (`edgesOut`)
* Si intentaste publicar usando GitHub Actions, el flujo se detenía con el error `npm error Cannot read properties of null (reading 'edgesOut')` antes de poder subir la página.
* Ya fue resuelto integrando `.npmrc` (`legacy-peer-deps=true`), actualizando el workflow a Node 22 y generando el `package-lock.json` verificado.

---

## OPCIÓN 1: VISUALIZAR EN GITHUB PAGES AL INSTANTE (DESDE LA CARPETA `/docs`)

Esta es la forma más rápida porque **no requiere instalar nada ni esperar compilaciones**:

1. Sube todos los archivos de este proyecto a tu repositorio de GitHub (incluyendo la carpeta `docs/`).
2. Entra a tu repositorio en **GitHub.com**.
3. Haz clic en la pestaña **Settings** (Configuración) en la barra superior del repositorio.
4. En el menú lateral izquierdo, haz clic en **Pages** (dentro de la sección *Code and automation*).
5. En la sección **Build and deployment** -> **Source**, selecciona:
   - **Deploy from a branch** (Desplegar desde una rama).
6. En **Branch** (Rama):
   - Selecciona tu rama principal (`main` o `master`).
   - En el selector de carpeta que está al lado (donde dice `/ (root)`), cámbialo a **`/docs`**.
   - Haz clic en el botón **Save** (Guardar).
7. Espera entre **30 y 60 segundos** y recarga la sección **Pages**.
8. En la parte superior aparecerá el enlace oficial:
   > `Your site is live at https://<tu-usuario>.github.io/<tu-repositorio>/`

---

## OPCIÓN 2: VISUALIZAR CON ACTUALIZACIÓN AUTOMÁTICA (GITHUB ACTIONS)

Si prefieres editar archivos dentro de `/src` directamente en GitHub y que la página web se recompile sola automáticamente:

1. Entra a tu repositorio en **GitHub.com**.
2. Ve a **Settings** -> **Pages**.
3. En **Build and deployment** -> **Source**, cambia la opción a:
   - **GitHub Actions**.
4. El archivo `.github/workflows/deploy-github-pages.yml` (ya incluido en este proyecto) se ejecutará automáticamente en la pestaña **Actions** de tu repositorio.
5. Al terminar el indicador en color verde (aprox. 1 minuto), tu página quedará publicada con la última versión del código.

---

## OPCIÓN 3: VISUALIZAR EL ARCHIVO `docs/index.html` CON HTMLPREVIEW (SIN CONFIGURAR PAGES)

Si tu repositorio es público y quieres ver la página inmediatamente con un solo enlace sin entrar a `Settings`:

1. Abre tu navegador y escribe la siguiente dirección reemplazando `<tu-usuario>` y `<tu-repositorio>`:
   ```text
   https://htmlpreview.github.io/?https://github.com/<tu-usuario>/<tu-repositorio>/blob/main/docs/index.html
   ```
2. También puedes abrir el repositorio completo en un entorno interactivo en la nube cambiando `github.com` por `githubbox.com` o `stackblitz.com/github` en la barra de direcciones de tu navegador:
   ```text
   https://stackblitz.com/github/<tu-usuario>/<tu-repositorio>
   ```

---

## CÓMO ACTUALIZAR LA CARPETA `/docs` MANUALMENTE (SI TRABAJAS EN TU COMPUTADORA)

Cada vez que modifiques el diseño o la lógica en `/src` desde tu computadora y quieras regenerar el paquete listo para GitHub dentro de la carpeta `/docs`, ejecuta un único comando en la terminal:

```bash
npm run build:github
```

Este comando realiza automáticamente tres acciones:
1. Ejecuta `vite build --outDir docs` con rutas relativas (`./assets/...`).
2. Crea una copia `docs/404.html` para que la navegación interna nunca arroje error 404 en GitHub Pages.
3. Crea el archivo vacío `docs/.nojekyll` para evitar que el motor Jekyll de GitHub bloquee archivos o estilos optimizados.

---

## CREDENCIALES DE PRUEBA INTEGRADAS EN LA PÁGINA

Una vez abras el enlace de tu página en GitHub Pages, puedes probar cualquiera de los tres entornos:

| Rol / Panel | Acceso desde la Interfaz | Credenciales / Datos de Prueba |
| :--- | :--- | :--- |
| **Portal Cliente (Nuevo o Existente)** | Pantalla Principal (`Iniciar Sesión` / `Registrarse`) | Cédula de prueba con crédito pagado para probar **Pedir Otro Crédito + OTP**: `10002000` (o registra cualquier cédula nueva) |
| **Panel de Trabajadores (Operadores)** | Botón inferior `Acceso Administrativo` | Usuario: `operador@crediulep.com` (o accede como Admin y habilita permisos por operador) |
| **Panel Administrativo (Control Total)** | Botón inferior `Acceso Administrativo` | Usuario: `admin` / Contraseña: `admin123` (o las credenciales configuradas en la bóveda local) |

---

## ARQUITECTURA DE SEGURIDAD EN GITHUB PAGES

- **Bóveda Local Cifrada (`AES-256-GCM`):** Toda la información de clientes, solicitudes de préstamos, firmas electrónicas OTP y cadena de bloques de auditoría (`security-crypto.js`) funciona **100% en el navegador** mediante la API nativa `window.crypto.subtle` (Web Crypto API).
- **Resiliencia Offline / Sin Cuotas:** Si la página se aloja de forma estática en GitHub Pages, el motor de almacenamiento opera de forma autónoma con `localStorage` cifrado extremo a extremo sin depender de servidores externos.

---

## RESOLUCIÓN DEL ERROR `npm error Cannot read properties of null (reading 'edgesOut')` EN GITHUB ACTIONS

Este error ocurre en GitHub Actions cuando el árbol de dependencias de `npm` (módulo Arborizer) intenta resolver dependencias en entornos sin archivo de bloqueo homogéneo. Ha sido resuelto de raíz con 3 ajustes incorporados en el proyecto:
1. **Archivo `.npmrc`:** Configurado con `legacy-peer-deps=true` para garantizar compatibilidad automática en cualquier servidor o runner.
2. **Workflow Actualizado (`.github/workflows/deploy-github-pages.yml`):** Utiliza `npm install --legacy-peer-deps --no-audit`.
3. **`package-lock.json` Oficial Generado:** Bloquea las versiones exactas sin conflictos de pares entre Vite y los plugins.

