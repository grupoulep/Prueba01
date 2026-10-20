# DOCUMENTO DE VISUALIZACIÓN Y DESPLIEGUE EN GITHUB
## Plataforma Financiera CrediULEP (AES-256-GCM)

Este documento independiente contiene la guía completa y detallada para **visualizar la página web directamente desde GitHub** sin pantallas en blanco ni errores de rutas.

---

## ¿POR QUÉ UN PROYECTO REACT/VITE NECESITA ESTO EN GITHUB?

Los navegadores web no pueden ejecutar archivos `.tsx` (TypeScript + React) directamente desde el código fuente `/src`. Para que GitHub muestre la página funcionando en vivo, este repositorio ya ha sido preconfigurado con **tres mecanismos listos para usar**:

1. **Carpeta `/docs` Precompilada (Visualización Inmediata sin Compilar):** Ya incluye los archivos HTML, CSS y JavaScript listos para producción con rutas relativas (`./`).
2. **Flujo Automático de GitHub Actions (`.github/workflows/deploy-github-pages.yml`):** Compila y actualiza la página automáticamente cada vez que haces un cambio en GitHub.
3. **Configuración `base: './'` en `vite.config.ts`:** Garantiza que todos los recursos carguen correctamente bajo subdirectorios del tipo `https://tu-usuario.github.io/nombre-del-repositorio/`.

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
