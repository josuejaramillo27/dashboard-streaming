import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, setDoc, getDoc, limit, startAfter, getCountFromServer, arrayUnion } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyAUKSeBHdB9An-01RdHx_vYg8yq3UY-bzw",
    authDomain: "dashboard-streaming-akaza.firebaseapp.com",
    projectId: "dashboard-streaming-akaza",
    storageBucket: "dashboard-streaming-akaza.firebasestorage.app",
    messagingSenderId: "143744610768",
    appId: "1:143744610768:web:f522c5dda22d24f1bcc9d5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const messaging = getMessaging(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null; let currentUserData = null; let clients = []; let editingClientId = null;
let currentManageUserId = null;
let multiAccData = {};
let currentActiveTab = '';
window.getDefaultAccData = () => ({ email: '', password: '', profile: '', pin: '', units: 1, months: 1, deviceName: '', deviceType: '', saleType: 'Perfil', inventoryId: null });
let globalCurrency = "S/";
let lastVisibleDoc = null;
let editingNewsId = null;
let editingNewsOldImg = null;

const macPalette = ['#FF2D55', '#5856D6', '#FF9500', '#34C759', '#007AFF', '#AF52DE', '#FF3B30', '#FFCC00', '#5AC8FA'];
const getCurrencyForCountry = (country) => {
    const dict = {
        "Perú": "S/",
        "Colombia": "COP $",
        "México": "MXN $",
        "Argentina": "ARS $",
        "Chile": "CLP $",
        "Ecuador": "$", // Dolarizado
        "Bolivia": "Bs.",
        "Venezuela": "Bs.",
        "Paraguay": "Gs.",
        "Uruguay": "$U",
        "España": "€",
        "Costa Rica": "₡",
        "Panamá": "B/.", // O $
        "República Dominicana": "RD$",
        "Guatemala": "Q",
        "Honduras": "L",
        "El Salvador": "$", // Dolarizado
        "Nicaragua": "C$",
        "Puerto Rico": "$",
        "Cuba": "CUP $"
    };
    return dict[country] || "USD $"; // Por defecto USD si es "Otro País"
};
const updateThemeIcon = () => {
    const isDark = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.innerHTML = isDark ? "<i class='bx bx-sun'></i> Modo claro" : "<i class='bx bx-moon'></i> Modo oscuro";
    });
};
if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode'); updateThemeIcon();
window.toggleTheme = () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    updateThemeIcon();

    // Si los gráficos están abiertos, los repintamos con el nuevo tema
    if (document.getElementById('analyticsSection') && document.getElementById('analyticsSection').style.display === 'flex') {
        if (typeof window.toggleStats === 'function') window.toggleStats(true);
    }
};
window.showNotification = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 5000); }
function showView(viewId) {
    document.getElementById('authView').style.display = 'none';
    document.getElementById('appView').style.display = 'none';
    document.getElementById('adminView').style.display = 'none';
    document.getElementById(viewId).style.display = 'block';

    if (viewId === 'appView') {
        document.body.classList.add('logged-in');
    } else {
        document.body.classList.remove('logged-in');
    }

    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        if (viewId === 'appView' && window.innerWidth <= 768) {
            bottomNav.style.display = 'flex';
        } else {
            bottomNav.style.display = 'none';
        }
    }
}
window.showLogin = () => { document.getElementById('loginForm').style.display = 'flex'; document.getElementById('registerForm').style.display = 'none'; document.getElementById('resetForm').style.display = 'none'; document.getElementById('authSubtitle').innerText = 'Iniciar Sesión'; }
window.showRegister = () => { document.getElementById('loginForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'flex'; document.getElementById('resetForm').style.display = 'none'; document.getElementById('authSubtitle').innerText = 'Crear Cuenta'; }
window.showReset = () => { document.getElementById('loginForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'none'; document.getElementById('resetForm').style.display = 'flex'; document.getElementById('authSubtitle').innerText = 'Recuperar Contraseña'; }
window.goToRegisterFromPlanes = () => {
    // 1. Ocultar la vista del catálogo de planes
    document.getElementById('planesPublicView').style.display = 'none';

    // 2. Limpiar la URL (Quitar ?planes=true) para que no vuelva a atrapar la pantalla
    const url = new URL(window.location);
    url.searchParams.delete('planes');
    window.history.pushState({}, '', url);

    // 3. Mandar al usuario directo a crear su cuenta
    showView('authView');
    window.showRegister();
};
window.togglePassword = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (input.type === "password") { input.type = "text"; btn.innerText = "🙈"; }
    else { input.type = "password"; btn.innerText = "👁️"; }
};

window.isGoogleSignup = false;
window.tempGoogleUser = null;

window.loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const docSnap = await getDoc(doc(db, "users", user.uid));

        if (!docSnap.exists()) {
            // NO se crea en Firebase aún. Guardamos temporal y mostramos el formulario pre-llenado.
            window.isGoogleSignup = true;
            window.tempGoogleUser = user;

            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'flex';
            document.getElementById('authSubtitle').innerText = 'Completa tu Registro';

            document.getElementById('regName').value = user.displayName || '';
            document.getElementById('regEmail').value = user.email || '';
            document.getElementById('regEmail').disabled = true; // Bloqueado para que no lo cambien

            // Ocultamos la contraseña porque ya se autenticó con Google
            const pwdWrapper = document.getElementById('regPassword').parentElement;
            if (pwdWrapper) pwdWrapper.style.display = 'none';
            document.getElementById('regPassword').removeAttribute('required');

            window.showNotification("¡Casi listo! Completa tu número y país.");
        } else {
            // Si ya existe, el onAuthStateChanged se encarga de cargarlo.
            window.showNotification("Iniciando sesión...");
        }
    } catch (error) {
        window.showNotification("Error Google: " + error.message);
        console.error(error);
    }
};

window.doRegister = async () => {
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const country = document.getElementById('regCountry').value;
    const planElegido = document.getElementById('regPlanDemo').value;

    if (!name || !email || !country || !phone || !planElegido) return window.showNotification("Llena todos los campos");
    if (!window.isGoogleSignup && !password) return window.showNotification("Falta la contraseña");
    if (!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país (Ej: +51...)");

    const btn = document.querySelector('#registerForm .btn-primary');
    const orig = btn.innerText;
    btn.innerText = "Creando... ⏳";
    btn.disabled = true;

    try {
        let user = window.tempGoogleUser;
        // Solo creamos credencial con contraseña si NO viene de Google
        if (!window.isGoogleSignup) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
        }

        const idToken = await user.getIdToken();

        const response = await fetch('https://bot.panelagc.com/api/completar-registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idToken: idToken,
                name: name,
                phone: phone,
                country: country,
                planDemo: planElegido
            })
        });

        if (!response.ok) throw new Error("Error del servidor al asignar perfil.");

        window.isGoogleSignup = false;
        window.showNotification("¡Cuenta creada con éxito! Disfruta tu prueba gratuita.");
        window.location.reload(); // Recarga limpia para que Firebase atrape la sesión

    } catch (e) {
        window.showNotification("Error Reg: " + e.message);
    } finally {
        btn.innerText = orig;
        btn.disabled = false;
    }
};

window.doLogin = async () => {
    const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
    if (!email || !password) return window.showNotification("Ingresa tus datos");

    const btn = document.querySelector('#loginForm .btn-primary');
    const orig = btn.innerHTML; // Cambiamos innerText por innerHTML
    btn.innerHTML = "Iniciando... <i class='bx bx-loader-alt bx-spin'></i>"; // Usamos el spinner
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        window.showNotification("Error Login: " + e.message);
        btn.innerHTML = orig;
        btn.disabled = false;
    }
};

window.doResetPassword = async () => {
    const email = document.getElementById('resetEmail').value; if (!email) return window.showNotification("Ingresa tu correo");
    try { await sendPasswordResetEmail(auth, email); window.showNotification("Link enviado a tu correo"); window.showLogin(); } catch (e) { window.showNotification("Error Reset: " + e.message); }
};
/* --- BOTÓN NUCLEAR: FORZAR ACTUALIZACIÓN Y LIMPIAR CACHÉ --- */
window.forceAppUpdate = async () => {
    // 1. Mostrar estado de carga
    window.showNotification("🧹 Limpiando caché profundo...");
    const btn = document.getElementById('btnForceUpdate');
    if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> <span>Limpiando...</span>";
        btn.style.pointerEvents = 'none';
    }

    try {
        // 2. Aniquilar a los Service Workers (Los culpables de guardar el caché en PWA)
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        // 3. Vaciar la API de Caché del navegador (Imágenes, CSS, JS viejos)
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (let cacheName of cacheNames) {
                await caches.delete(cacheName);
            }
        }

        // 4. Forzar recarga bruta engañando al navegador con una marca de tiempo
        setTimeout(() => {
            window.location.href = window.location.pathname + '?v=' + new Date().getTime();
        }, 800);

    } catch (error) {
        console.error("Error al limpiar caché:", error);
        // Plan B de emergencia si falla la limpieza profunda
        window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    }
};
window.doLogout = async () => {
    localStorage.removeItem('agc_owner_uid');
    if (document.getElementById('aiFloatingBtn')) document.getElementById('aiFloatingBtn').style.display = 'none';
    clients = []; currentUser = null; currentUserData = null; document.getElementById('tableBody').innerHTML = ''; showView('authView'); window.showLogin();
    try { await signOut(auth); window.showNotification("Sesión cerrada"); } catch (e) { console.error(e); }
};

onAuthStateChanged(auth, async (user) => {
    // 🛑 Candado de Tienda, Portal y Planes (Evita que el Login se superponga)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('planes') || urlParams.get('tienda') || urlParams.get('portal') || urlParams.get('store')) {
        if (document.getElementById('authView')) document.getElementById('authView').style.display = 'none';

        // Ejecutar las vistas correspondientes si existen
        if (typeof window.checkPlanesView === 'function') window.checkPlanesView();
        if (typeof window.checkClientPortal === 'function') window.checkClientPortal();
        return;
    }

    if (user) {
        currentUser = user;
        localStorage.setItem('agc_owner_uid', user.uid);

        // 🔥 MEJORA VISUAL: Ocultar login y dar feedback INMEDIATO
        document.getElementById('loginForm').style.display = 'none';
        if (document.getElementById('authSubtitle')) {
            document.getElementById('authSubtitle').innerHTML = "Cargando tu panel... <i class='bx bx-loader-alt bx-spin'></i>";
        }

        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
                globalCurrency = currentUserData.currency || "S/";

                if (document.getElementById('brandName')) document.getElementById('brandName').innerText = currentUserData.name || 'Mi Panel';

                // --- 1. LÓGICA DE LA INSIGNIA ORIGINAL (MÓVIL / CABECERA) ---
                const planBadge = document.getElementById('userPlanBadge');
                if (planBadge && currentUserData.role !== 'admin') {
                    const planActual = (currentUserData.plan_actual || 'demo').toLowerCase();
                    planBadge.style.display = 'inline-block';
                    planBadge.innerText = `Plan ${planActual}`;

                    if (planActual === 'pro' || planActual === 'elite') {
                        planBadge.style.color = '#FFD700'; planBadge.style.backgroundColor = 'rgba(255, 215, 0, 0.1)';
                    } else if (planActual === 'basico') {
                        planBadge.style.color = 'var(--mac-green)'; planBadge.style.backgroundColor = 'rgba(52, 199, 89, 0.1)';
                    } else {
                        planBadge.style.color = 'var(--mac-text-secondary)'; planBadge.style.backgroundColor = 'rgba(152, 152, 157, 0.1)';
                    }
                } else if (planBadge) {
                    planBadge.style.display = 'none';
                }

                // --- 2. LÓGICA DE LA BARRA LATERAL EN PC Y CELULAR ---
                if (document.getElementById('brandNameSidebar')) document.getElementById('brandNameSidebar').innerText = currentUserData.name || 'Mi Panel';
                if (document.getElementById('mobileBrandName')) document.getElementById('mobileBrandName').innerText = currentUserData.name || 'Mi Panel';

                const planBadgeSide = document.getElementById('userPlanBadgeSidebar');
                if (planBadgeSide && currentUserData.role !== 'admin') {
                    const planActual = (currentUserData.plan_actual || 'demo').toLowerCase();
                    planBadgeSide.innerText = `Plan ${planActual}`;

                    if (planActual === 'pro' || planActual === 'elite') {
                        // AQUÍ SE ACTIVA LA ANIMACIÓN ESTILO PASS ROYALE
                        planBadgeSide.className = 'badge-pro-animated';
                        planBadgeSide.style.display = 'inline-block';
                    } else {
                        // Plan normal: Diseño limpio sin animación
                        planBadgeSide.className = '';
                        planBadgeSide.style.color = 'var(--mac-text-secondary)';
                        planBadgeSide.style.backgroundColor = 'rgba(152, 152, 157, 0.1)';
                        planBadgeSide.style.border = 'none';
                        planBadgeSide.style.boxShadow = 'none';
                        planBadgeSide.style.padding = '4px 10px';
                        planBadgeSide.style.borderRadius = '8px';
                        planBadgeSide.style.fontSize = '11px';
                        planBadgeSide.style.fontWeight = 'bold';
                        planBadgeSide.style.textTransform = 'uppercase';
                        planBadgeSide.style.display = 'inline-block';
                    }
                } else if (planBadgeSide) {
                    planBadgeSide.style.display = 'none';
                }

                // Inyección del logo
                if (currentUserData.logoUrl) {
                    if (document.getElementById('brandLogoSidebar')) { document.getElementById('brandLogoSidebar').src = currentUserData.logoUrl; document.getElementById('brandLogoSidebar').style.display = 'block'; }
                    if (document.getElementById('mobileBrandLogo')) { document.getElementById('mobileBrandLogo').src = currentUserData.logoUrl; document.getElementById('mobileBrandLogo').style.display = 'block'; }
                }

                if (document.getElementById('clientCost')) document.getElementById('clientCost').placeholder = `Costo Proveedor (${globalCurrency})`;
                if (document.getElementById('clientPrice')) document.getElementById('clientPrice').placeholder = `Precio de Venta (${globalCurrency})`;

                // 🔥 MEJORA DE RENDIMIENTO Y AUTO-BLOQUEO
                const now = new Date(); let needsUpdate = false;
                if (currentUserData.active === true && currentUserData.activeUntil) {
                    if (now > new Date(currentUserData.activeUntil)) {
                        // --- CIERRE AUTOMÁTICO DE DEMO CON ALERTA ---
                        await updateDoc(doc(db, "users", user.uid), { active: false, activeUntil: null });

                        Swal.fire({
                            icon: 'warning',
                            title: '⏳ ¡Tu Demo ha expirado!',
                            text: `Esperamos que te haya encantado el Plan ${currentUserData.plan_actual.toUpperCase()}. ¡Adquiérelo ahora para seguir dominando el mercado!`,
                            confirmButtonText: '<i class="bx bxl-whatsapp"></i> Adquirir Plan Oficial',
                            allowOutsideClick: false,
                            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
                            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
                        }).then(() => {
                            // Cambia este número por tu WhatsApp
                            window.open(`https://wa.me/51961341323?text=Hola,%20mi%20demo%20ha%20terminado.%20Deseo%20comprar%20el%20Plan%20${currentUserData.plan_actual.toUpperCase()}%20del%20Panel%20A.G.C.`, '_blank');
                            window.doLogout();
                        });
                        return; // Detiene la carga del Dashboard
                    }
                } else if (currentUserData.active === false && currentUserData.suspendedUntil) {
                    if (now > new Date(currentUserData.suspendedUntil)) { currentUserData.active = true; currentUserData.suspendedUntil = null; needsUpdate = true; }
                }

                if (needsUpdate) {
                    updateDoc(doc(db, "users", user.uid), { active: currentUserData.active, activeUntil: currentUserData.activeUntil || null, suspendedUntil: currentUserData.suspendedUntil || null });
                }

                const loginBtn = document.querySelector('#loginForm .btn-primary');
                if (loginBtn) { loginBtn.innerText = "Ingresar"; loginBtn.disabled = false; }

                // Carga de vistas
                if (currentUserData.role === 'admin') {
                    showView('adminView');
                    loadAdminData();
                    window.requestNotificationPermission();
                    if (document.getElementById('aiFloatingBtn')) document.getElementById('aiFloatingBtn').style.display = 'flex'; // 👈 MOSTRAR ASISTENTE
                } else {
                    if (currentUserData.active === true) {
                        showView('appView');
                        if (document.getElementById('userGreeting')) document.getElementById('userGreeting').innerText = `Gestión de clientes`;
                        loadUserClients();
                        window.checkNewNews();
                        window.requestNotificationPermission();
                        window.renderInventory();
                        window.syncUserServices();
                        if (document.getElementById('aiFloatingBtn')) document.getElementById('aiFloatingBtn').style.display = 'flex'; // 👈 MOSTRAR ASISTENTE
                        setTimeout(() => window.checkUrlRouting(), 300);

                        // --- LANZADOR DEL TUTORIAL ---
                        if (!currentUserData.tutorialVisto && window.innerWidth > 768) {
                            setTimeout(() => window.startTutorial(), 1500);
                        }
                    } else {
                        // NUEVO: Solo desloguea si no viene del botón de Google
                        if (!window.isGoogleSignup) {
                            await signOut(auth);
                            showView('authView');
                            window.showLogin();
                        }
                    }
                } // <--- AÑADE ESTA LLAVE AQUÍ PARA CERRAR EL BLOQUE ANTERIOR
            } else { await signOut(auth); showView('authView'); window.showLogin(); }
        } catch (e) {
            console.error(e);
            window.showNotification("ERROR DB: " + e.message);
            showView('authView');
            window.showLogin();
        }
    } else {
        currentUser = null; currentUserData = null;
        showView('authView');
        window.showLogin();
        if (document.getElementById('authSubtitle')) document.getElementById('authSubtitle').innerText = 'Área de Gestión y Control';
    }
});

window.closeModals = (resetTab = true) => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.body.style.overflow = 'auto'; // Devuelve el scroll al fondo

    // Solo devuelve el foco al botón de Clientes si es un cierre total (ej: tocar la X)
    if (resetTab === true) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const btnClientes = document.getElementById('navClientes');
        if (btnClientes) btnClientes.classList.add('active');
    }
};
/* --- CONTROLADOR DE SECCIONES DASHBOARD (PC Y MÓVIL) --- */
window.switchDashboardSection = (sectionId, menuElement) => {
    document.body.style.overflow = 'auto';
    setTimeout(() => {
        // 1. Apagamos TODAS las secciones
        document.querySelectorAll('.dashboard-section').forEach(sec => {
            sec.classList.remove('active-section');
            sec.style.setProperty('display', 'none', 'important');
        });

        // 2. Encendemos SOLO la seleccionada
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active-section');
            targetSection.style.setProperty('display', 'block', 'important');
        }

        // 3. Pintamos de azul el botón
        if (menuElement) {
            document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
            menuElement.classList.add('active');
        }

        // 4. SI ESTAMOS EN CELULAR: Ocultamos el menú automáticamente
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('mainSidebar');
            const overlay = document.getElementById('mobileSidebarOverlay');
            if (sidebar) sidebar.classList.remove('mobile-open');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.style.display = 'none', 300);
            }
        }

        // 🔥 5. FIX DEL SCROLL: Forzamos a la pantalla a volver arriba
        const mainContainer = document.querySelector('.dashboard-main');
        if (mainContainer) mainContainer.scrollTop = 0;
        window.scrollTo(0, 0);

    }, 60);
};
// Blindaje del botón "Cerrar" para que regrese correctamente al Home en PC y CELULAR
const originalCloseModals = window.closeModals;
window.closeModals = (resetTab = true) => {
    originalCloseModals(resetTab);

    // 👈 RESTAURAR ASISTENTE AL CERRAR MODALES (Solo si tiene sesión activa)
    if (currentUser && document.getElementById('aiFloatingBtn')) {
        document.getElementById('aiFloatingBtn').style.display = 'flex';
    }

    // Le quitamos la validación de PC para que en celular también restaure el inicio
    if (resetTab === true) {
        document.querySelectorAll('.dashboard-section').forEach(sec => {
            sec.classList.remove('active-section');
            sec.style.setProperty('display', 'none', 'important');
        });
        const home = document.getElementById('homeSection');
        if (home) {
            home.classList.add('active-section');
            home.style.setProperty('display', 'block', 'important');
        }

        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        const homeBtn = document.querySelector('.sidebar-item[onclick*="homeSection"]');
        if (homeBtn) homeBtn.classList.add('active');
    }
};

/* --- CONFIGURACIÓN DE WHATSAPP Y PAGOS --- */
window.openWaModal = () => {
    const defaultMsg = "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*. Para renovar, usa estos datos:\n\n{pago}";
    const defaultDelivery = `🎉 *¡Gracias por tu compra!*\n\nAquí tienes los datos de tu nueva cuenta de *{plataforma}*:\n\n📧 *Correo:* {correo}\n🔑 *Clave:* {pass}\n📌 *PIN:* {pin}\n\n📅 *Vence el:* {fecha}\n\n⚠️ *Reglas:* {reglas}\n\n¡Que disfrutes el contenido! 🍿`;
    const defaultRenew = `🎉 *¡Renovación Exitosa, {nombre}!*\n\nTu servicio de *{plataforma}* ha sido renovado correctamente.\n📅 Nueva fecha de vencimiento: *{fecha}*\n\n🌐 *Tu Portal:* {link}\n🔑 *Código Web:* {codigo}\n\n¡Gracias por seguir confiando en nosotros! 🚀`;

    document.getElementById('editWaMessage').value = currentUserData.waTemplate || defaultMsg;
    document.getElementById('editWaDeliveryMessage').value = currentUserData.waDeliveryMessage || defaultDelivery;
    // Nuevo campo para renovación
    if (document.getElementById('editWaRenewMessage')) {
        document.getElementById('editWaRenewMessage').value = currentUserData.waRenewMessage || defaultRenew;
    }

    document.getElementById('waModal').style.display = 'flex';
};

window.saveWaMessage = async () => {
    const btn = document.querySelector('#waModal .btn-primary');
    btn.innerText = "Guardando..."; btn.disabled = true;
    try {
        const newRenewMsg = document.getElementById('editWaRenewMessage') ? document.getElementById('editWaRenewMessage').value : "";

        await updateDoc(doc(db, "users", currentUser.uid), {
            waTemplate: document.getElementById('editWaMessage').value,
            waDeliveryMessage: document.getElementById('editWaDeliveryMessage').value,
            waRenewMessage: newRenewMsg // Se guarda en la base de datos
        });

        currentUserData.waTemplate = document.getElementById('editWaMessage').value;
        currentUserData.waDeliveryMessage = document.getElementById('editWaDeliveryMessage').value;
        if (newRenewMsg) currentUserData.waRenewMessage = newRenewMsg; // Se actualiza en memoria

        window.showNotification("Configuración de WhatsApp guardada.");
        window.closeModals();
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerText = "Guardar Configuración"; btn.disabled = false;
    }
};
// 🔥 NUEVO SISTEMA DE MEMORIA TEMPORAL PARA MÉTODOS DE PAGO
let tempPaymentMethods = [];

// --- MANEJO DE PESTAÑAS DENTRO DEL PERFIL ---
window.switchProfileTab = (tabId, element) => {
    document.querySelectorAll('.profile-tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('.profile-tab-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
};

window.openUpgradeWa = () => {
    // Aquí pon tu número real
    const adminPhone = "+51961341323";
    const msg = encodeURIComponent("¡Hola! Quiero subir al Plan PRO para desbloquear el envío de Campañas Masivas y la subida de Estados automáticos.");
    window.open(`https://wa.me/${adminPhone}?text=${msg}`, '_blank');
};

// --- ABRIR MODAL DE PERFIL MODIFICADO PARA VERIFICAR PLAN ---
window.openProfileModal = () => {
    // 1. Carga los datos de texto del perfil
    document.getElementById('editProfileName').value = currentUserData.name || '';
    document.getElementById('editProfileCountry').value = currentUserData.country || '';
    document.getElementById('editProfilePhone').value = currentUserData.phone || '';
    document.getElementById('editProfileAlias').value = currentUserData.storeAlias || '';
    document.getElementById('editReferencesLink').value = currentUserData.referencesLink || '';

    // Bloquear/Desbloquear Pasarelas según el plan
    const planActual = (currentUserData.plan_actual || 'demo').toLowerCase();
    const btnPasarelas = document.getElementById('btnTabPasarelas');
    if (btnPasarelas) {
        btnPasarelas.style.display = (planActual === 'pro' || planActual === 'elite') ? 'inline-block' : 'none';
    }

    // --- Cargar Pasarelas Antiguas ---
    if (document.getElementById('mpAccessTokenInput')) {
        document.getElementById('mpAccessTokenInput').value = currentUserData.mpAccessToken ? `APP_USR-***${currentUserData.mpAccessToken.slice(-5)}` : '';
    }
    if (document.getElementById('binanceApiKeyInput')) {
        document.getElementById('binanceApiKeyInput').value = currentUserData.binanceApiKey ? `***${currentUserData.binanceApiKey.slice(-5)}` : '';
    }
    if (document.getElementById('binanceSecretKeyInput')) {
        document.getElementById('binanceSecretKeyInput').value = currentUserData.binanceSecretKey ? `***${currentUserData.binanceSecretKey.slice(-5)}` : '';
    }

    // --- NUEVO: Cargar Pasarelas de Binance Pay ---
    if (document.getElementById('binancePayIdInput')) {
        document.getElementById('binancePayIdInput').value = currentUserData.binancePayId || '';
    }
    if (document.getElementById('binanceAliasInput')) {
        document.getElementById('binanceAliasInput').value = currentUserData.binanceAlias || '';
    }
    if (document.getElementById('binanceExchangeRateInput')) {
        document.getElementById('binanceExchangeRateInput').value = currentUserData.binanceExchangeRate || '';
    }

    // 2. Carga los chips de servicios y pagos
    if (typeof window.renderCustomServicesChips === 'function') window.renderCustomServicesChips();
    tempPaymentMethods = (currentUserData.paymentMethods || []).map(m => ({ ...m, isEditing: false }));
    window.renderPaymentMethodsList();

    // 3. VERIFICADOR DE PLAN PARA LA PESTAÑA DEL BOT
    if (planActual === 'pro' || planActual === 'elite') {
        document.getElementById('botBasicWarning').style.display = 'none';
        document.getElementById('botProContent').style.display = 'block';
    } else {
        document.getElementById('botBasicWarning').style.display = 'block';
        document.getElementById('botProContent').style.display = 'none';
    }

    if (typeof window.renderBotSlots === 'function') {
        window.renderBotSlots();
    }

    // 4. Reiniciar a la primera pestaña siempre que se abre
    const primeraPestana = document.querySelector('.profile-tab-btn');
    if (primeraPestana) window.switchProfileTab('tabPerfilMarca', primeraPestana);
};

// --- FUNCIÓN HÍBRIDA: ENVIAR CAMPAÑA MASIVA ---
window.sendMassCampaign = async () => {
    const msg = document.getElementById('campaignMessage').value.trim();
    const imgUrl = document.getElementById('campaignImage').value.trim();
    const dbFilter = document.getElementById('campaignDbClients').value;
    const externalRaw = document.getElementById('campaignExternal').value.trim();

    if (!msg) return window.showNotification("⚠️ Escribe un mensaje para tu campaña.");

    // 1. Recopilar clientes de la BD (Si lo seleccionó)
    let finalRecipients = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (dbFilter !== 'none') {
        clients.forEach(c => {
            const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((exp - today) / 86400000);

            let apply = false;
            if (dbFilter === 'all') apply = true;
            if (dbFilter === 'expired' && diffDays < 0) apply = true;
            if (dbFilter === 'active' && diffDays >= 0) apply = true;

            if (apply && c.phone) {
                finalRecipients.push({ phone: c.phone, name: c.name || "amigo" });
            }
        });
    }

    // 2. Recopilar números externos
    if (externalRaw) {
        const extArray = externalRaw.split(',').map(n => n.trim()).filter(n => n !== '');
        extArray.forEach(num => {
            // Aseguramos que tenga el +
            let cleanNum = num.replace(/[^\d+]/g, '');
            if (cleanNum) {
                if (!cleanNum.startsWith('+')) cleanNum = '+' + cleanNum;
                finalRecipients.push({ phone: cleanNum, name: "amigo" });
            }
        });
    }

    // 3. Quitar duplicados por teléfono
    const uniqueRecipients = [];
    const seenPhones = new Set();
    finalRecipients.forEach(r => {
        if (!seenPhones.has(r.phone)) {
            seenPhones.add(r.phone);
            uniqueRecipients.push(r);
        }
    });

    if (uniqueRecipients.length === 0) return window.showNotification("⚠️ No se encontraron destinatarios válidos.");

    // 4. Confirmación antes de disparar
    const confirm = await Swal.fire({
        title: 'Lanzar Campaña',
        text: `Se enviará tu promoción a ${uniqueRecipients.length} contacto(s) en modo Anti-Ban (uno por uno con pausas largas). ¿Continuar?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, enviar ahora',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007AFF',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    if (confirm.isConfirmed) {
        window.showNotification("🚀 Campaña enviada a la cola lenta de tu servidor.");

        try {
            await fetch('https://bot.panelagc.com/api/campana-masiva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distribuidorId: currentUser.uid,
                    clientes: uniqueRecipients,
                    imageUrl: imgUrl,
                    mensajeBase: msg
                })
            });
            // Limpiar campos
            document.getElementById('campaignMessage').value = '';
            document.getElementById('campaignImage').value = '';
            document.getElementById('campaignExternal').value = '';
            document.getElementById('campaignDbClients').value = 'none';
        } catch (e) {
            console.error("Error en campaña:", e);
        }
    }
};
// --- GENERADOR VISUAL DE LOS 10 SLOTS (5 ESTADOS + 5 GRUPOS) ---
window.renderBotSlots = () => {
    const contEstados = document.getElementById('statusSlotsContainer');
    const contGrupos = document.getElementById('groupSlotsContainer');
    if (!contEstados || !contGrupos) return;

    contEstados.innerHTML = '';
    contGrupos.innerHTML = '';

    const config = currentUserData.botConfig || {};
    const estados = config.estados || [];
    const grupos = config.gruposMensajes || [];

    // Pintar 5 Cajas de Estados en formato Tarjeta
    for (let i = 0; i < 5; i++) {
        const est = estados[i] || { texto: '', imgUrl: '' };
        contEstados.innerHTML += `
            <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border); display: flex; flex-direction: column; gap: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                <span style="font-size: 12px; font-weight: 800; color: var(--mac-blue); display: flex; align-items: center; gap: 5px;"><i class='bx bx-image'></i> Estado ${i + 1}</span>
                <input type="text" id="slotTxt_${i}" placeholder="Texto del estado..." value="${est.texto}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
                <input type="url" id="slotImg_${i}" placeholder="URL Imagen (Opcional)" value="${est.imgUrl}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
            </div>
        `;
    }

    // Pintar 5 Cajas de Grupos en formato Tarjeta
    for (let i = 0; i < 5; i++) {
        const grp = grupos[i] || { texto: '', imgUrl: '' };
        contGrupos.innerHTML += `
            <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border); display: flex; flex-direction: column; gap: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                <span style="font-size: 12px; font-weight: 800; color: var(--mac-orange); display: flex; align-items: center; gap: 5px;"><i class='bx bx-message-square-dots'></i> Mensaje ${i + 1}</span>
                <textarea id="grpTxt_${i}" rows="3" placeholder="Mensaje (Spintax permitido)..." style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; resize: none; box-sizing: border-box;">${grp.texto}</textarea>
                <input type="url" id="grpImg_${i}" placeholder="URL Imagen (Opcional)" value="${grp.imgUrl}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
            </div>
        `;
    }

    // Cargar Checkboxes y Selects guardados
    document.getElementById('autoStatusActive').checked = config.estadosActivos || false;
    document.getElementById('autoStatusInterval').value = config.estadosIntervaloHoras || 2;
    document.getElementById('autoGroupActive').checked = config.gruposActivos || false;
    document.getElementById('autoGroupInterval').value = config.gruposIntervaloHoras || 2;
};

// --- EXTRAER GRUPOS DEL BOT ---
window.fetchWhatsAppGroups = async () => {
    const container = document.getElementById('waGroupsList');
    container.innerHTML = '<p style="text-align:center; font-size:12px; color:var(--mac-blue);">⏳ Conectando con tu WhatsApp para leer grupos...</p>';

    try {
        const response = await fetch(`https://bot.panelagc.com/api/obtener-grupos/${currentUser.uid}`);
        const data = await response.json();

        if (data.status === 'ok') {
            if (data.grupos.length === 0) {
                container.innerHTML = '<p style="font-size:12px; color:var(--mac-orange); text-align:center;">No perteneces a ningún grupo o el bot aún está cargando mensajes.</p>';
                return;
            }

            // Leemos los seleccionados en Firebase
            const savedGroups = (currentUserData.botConfig && currentUserData.botConfig.gruposTarget) ? currentUserData.botConfig.gruposTarget : [];

            container.innerHTML = '';
            data.grupos.forEach(g => {
                const isChecked = savedGroups.includes(g.id) ? 'checked' : '';
                container.innerHTML += `
                    <label style="display:flex; align-items:center; gap:8px; padding: 6px 0; border-bottom: 1px solid var(--mac-border); font-size: 13px; color: var(--mac-text-main); cursor: pointer;">
                        <input type="checkbox" class="wa-group-checkbox" value="${g.id}" ${isChecked}>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.name}</span>
                    </label>
                `;
            });
            window.showNotification(`✅ Se encontraron ${data.grupos.length} grupos.`);
        } else {
            container.innerHTML = `<p style="color:var(--mac-red); font-size:12px; text-align:center;">❌ Error: ${data.message}</p>`;
        }
    } catch (e) {
        container.innerHTML = `<p style="color:var(--mac-red); font-size:12px; text-align:center;">❌ No se pudo contactar al servidor.</p>`;
    }
};
window.renderPaymentMethodsList = () => {
    const container = document.getElementById('paymentMethodsContainer');
    if (!container) return;
    container.innerHTML = '';

    tempPaymentMethods.forEach((m, idx) => {
        if (m.isEditing) {
            // MODO EDICIÓN: Muestra el formulario para llenar los datos
            const div = document.createElement('div');
            div.style.cssText = "background: var(--mac-bg); border: 1px solid var(--mac-blue); border-radius: 12px; padding: 15px; margin-bottom: 10px; box-shadow: 0 4px 12px rgba(0,122,255,0.1);";

            // Permite previsualizar la foto temporal si acaba de subir una
            let imgPreview = m.qrUrl ? `<img src="${m.qrUrl}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid var(--mac-border); flex-shrink: 0;">` : '';

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 13px; font-weight: bold; color: var(--mac-blue);">${!m.bank ? 'Nuevo Método de Pago' : 'Editando Método'}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-size: 11px; color: var(--mac-text-secondary);">Tipo (Banco/Billetera):</label>
                        <input type="text" id="pmBank_${idx}" placeholder="Ej: Yape, Plin..." value="${m.bank || ''}" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--mac-text-secondary);">Número / Celular:</label>
                        <input type="text" id="pmNumber_${idx}" placeholder="Ej: 999 888 777" value="${m.number || ''}" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
                    </div>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 11px; color: var(--mac-text-secondary);">Nombre del Titular:</label>
                    <input type="text" id="pmHolder_${idx}" placeholder="Ej: Juan Pérez" value="${m.holder || ''}" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px; box-sizing: border-box;">
                </div>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="font-size: 11px; color: var(--mac-text-secondary);">QR de Pago (Opcional):</label>
                        <input type="file" accept="image/*" id="pmQrFile_${idx}" style="width: 100%; padding: 6px; font-size: 11px; background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 6px; box-sizing: border-box; color: var(--mac-text-main);">
                    </div>
                    ${imgPreview}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <button type="button" class="btn-primary" style="width: 100%; margin: 0; padding: 10px; font-size: 12px; white-space: nowrap;" onclick="window.confirmPaymentMethod(${idx})"><i class='bx bx-check'></i> Confirmar</button>
                    <button type="button" class="btn-secondary" style="width: 100%; margin: 0; padding: 10px; font-size: 12px; white-space: nowrap;" onclick="window.cancelPaymentMethod(${idx})">Cancelar</button>
                </div>
            `;
            container.appendChild(div);
        } else {
            // MODO RESUMEN: Muestra la tarjetita compacta y elegante
            const div = document.createElement('div');
            div.style.cssText = "background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 10px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";

            const iconHtml = (m.qrUrl || m.fileObj)
                ? `<div style="width: 35px; height: 35px; background: rgba(0, 122, 255, 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--mac-blue); border: 1px solid var(--mac-blue);"><i class='bx bx-qr-scan'></i></div>`
                : `<div style="width: 35px; height: 35px; background: var(--mac-bg); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--mac-text-secondary); border: 1px solid var(--mac-border);"><i class='bx bxs-bank'></i></div>`;

            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${iconHtml}
                    <div>
                        <strong style="color: var(--mac-text-main); font-size: 14px; display: block;">${m.bank}</strong>
                        <span style="color: var(--mac-text-secondary); font-size: 12px;">${m.number} ${m.holder ? '- ' + m.holder : ''}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button type="button" class="action-btn" style="padding: 6px; font-size: 14px; color: var(--mac-blue); border: 1px solid var(--mac-blue); background: transparent;" onclick="window.editPaymentMethod(${idx})"><i class='bx bx-edit'></i></button>
                    <button type="button" class="action-btn btn-del" style="padding: 6px; font-size: 14px;" onclick="window.deletePaymentMethod(${idx})"><i class='bx bx-trash'></i></button>
                </div>
            `;
            container.appendChild(div);
        }
    });
};

window.addPaymentMethod = () => {
    if (tempPaymentMethods.length >= 5) return window.showNotification("⚠️ Solo puedes tener hasta 5 métodos.");
    // Crea un formulario en blanco al final
    tempPaymentMethods.push({ bank: '', number: '', holder: '', qrUrl: '', isEditing: true });
    window.renderPaymentMethodsList();
};

window.editPaymentMethod = (idx) => {
    tempPaymentMethods[idx].isEditing = true;
    window.renderPaymentMethodsList();
};

window.cancelPaymentMethod = (idx) => {
    const m = tempPaymentMethods[idx];
    if (!m.bank && !m.number) {
        // Era uno nuevo y lo canceló, lo borramos de la lista
        tempPaymentMethods.splice(idx, 1);
    } else {
        // Lo estaba editando pero se arrepintió, vuelve a modo resumen
        m.isEditing = false;
    }
    window.renderPaymentMethodsList();
};

window.deletePaymentMethod = (idx) => {
    tempPaymentMethods.splice(idx, 1);
    window.renderPaymentMethodsList();
};

window.confirmPaymentMethod = (idx) => {
    const bank = document.getElementById(`pmBank_${idx}`).value.trim();
    const number = document.getElementById(`pmNumber_${idx}`).value.trim();
    const holder = document.getElementById(`pmHolder_${idx}`).value.trim();
    const fileInput = document.getElementById(`pmQrFile_${idx}`);

    if (!bank || !number) {
        return window.showNotification("⚠️ Ingresa al menos el Banco y el Número.");
    }

    const m = tempPaymentMethods[idx];
    m.bank = bank;
    m.number = number;
    m.holder = holder;

    // Si acaba de subir una foto, la guardamos temporalmente en memoria
    if (fileInput && fileInput.files.length > 0) {
        m.fileObj = fileInput.files[0];
        // Creamos una URL temporal para que la vea de inmediato si vuelve a editar
        m.qrUrl = URL.createObjectURL(m.fileObj);
    }

    m.isEditing = false;
    window.renderPaymentMethodsList();
};

window.saveProfile = async () => {
    const phone = document.getElementById('editProfilePhone').value.trim();
    const name = document.getElementById('editProfileName').value;
    const country = document.getElementById('editProfileCountry').value;

    // --- NUEVO: Capturar datos de Pasarelas de Pago ---
    // (Asegúrate de que los IDs en tu HTML coincidan con estos)
    const mpAccessToken = document.getElementById('mpAccessTokenInput') ? document.getElementById('mpAccessTokenInput').value.trim() : '';
    const binanceApiKey = document.getElementById('binanceApiKeyInput') ? document.getElementById('binanceApiKeyInput').value.trim() : '';
    const binanceSecretKey = document.getElementById('binanceSecretKeyInput') ? document.getElementById('binanceSecretKeyInput').value.trim() : '';
    const binancePayId = document.getElementById('binancePayIdInput') ? document.getElementById('binancePayIdInput').value.trim() : '';
    const binanceAlias = document.getElementById('binanceAliasInput') ? document.getElementById('binanceAliasInput').value.trim() : '';
    const binanceExchangeRate = document.getElementById('binanceExchangeRateInput') ? parseFloat(document.getElementById('binanceExchangeRateInput').value) || null : null;

    if (!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país");

    const btn = document.querySelector('#profileModal .btn-primary');
    if (btn) { btn.innerText = "Subiendo... ⏳"; btn.disabled = true; }

    try {
        let logoUrl = currentUserData.logoUrl || null;
        const fileInput = document.getElementById('editLogoUpload');
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `logos/${currentUser.uid}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        }

        let bannerUrl = currentUserData.bannerUrl || null;
        const bannerInput = document.getElementById('editBannerUpload');
        if (bannerInput && bannerInput.files.length > 0) {
            const fileBanner = bannerInput.files[0];
            const storageRefBanner = ref(storage, `banners/${currentUser.uid}`);
            await uploadBytes(storageRefBanner, fileBanner);
            bannerUrl = await getDownloadURL(storageRefBanner);
        }

        // Procesar métodos de pago manuales
        let finalPaymentMethods = [];
        for (let i = 0; i < tempPaymentMethods.length; i++) {
            let m = tempPaymentMethods[i];

            if (m.isEditing) {
                m.bank = document.getElementById(`pmBank_${i}`).value.trim();
                m.number = document.getElementById(`pmNumber_${i}`).value.trim();
                m.holder = document.getElementById(`pmHolder_${i}`).value.trim();
                const fInput = document.getElementById(`pmQrFile_${i}`);
                if (fInput && fInput.files.length > 0) m.fileObj = fInput.files[0];
            }

            if (!m.bank && !m.number) continue;

            let finalQrUrl = m.qrUrl;

            if (m.fileObj) {
                const storageRefQR = ref(storage, `qrs/${currentUser.uid}_qr_${Date.now()}_${i}`);
                await uploadBytes(storageRefQR, m.fileObj);
                finalQrUrl = await getDownloadURL(storageRefQR);
            }

            finalPaymentMethods.push({
                bank: m.bank,
                number: m.number,
                holder: m.holder,
                qrUrl: finalQrUrl
            });
        }

        let rawAlias = document.getElementById('editProfileAlias').value;
        let finalAlias = rawAlias.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        let refInput = document.getElementById('editReferencesLink');
        let referencesLink = refInput ? refInput.value.trim() : '';

        // Guardado de botConfig
        let estadosArray = [];
        let gruposArray = [];
        for (let i = 0; i < 5; i++) {
            estadosArray.push({
                texto: document.getElementById(`slotTxt_${i}`).value.trim(),
                imgUrl: document.getElementById(`slotImg_${i}`).value.trim()
            });
            gruposArray.push({
                texto: document.getElementById(`grpTxt_${i}`).value.trim(),
                imgUrl: document.getElementById(`grpImg_${i}`).value.trim()
            });
        }

        const selectedGroups = Array.from(document.querySelectorAll('.wa-group-checkbox:checked')).map(cb => cb.value);

        const botConfig = {
            estadosActivos: document.getElementById('autoStatusActive').checked,
            estadosIntervaloHoras: parseInt(document.getElementById('autoStatusInterval').value) || 2,
            estados: estadosArray,
            estadosLastRun: (currentUserData.botConfig && currentUserData.botConfig.estadosLastRun) ? currentUserData.botConfig.estadosLastRun : null,
            estadosCurrentIndex: (currentUserData.botConfig && currentUserData.botConfig.estadosCurrentIndex) ? currentUserData.botConfig.estadosCurrentIndex : 0,

            gruposActivos: document.getElementById('autoGroupActive').checked,
            gruposIntervaloHoras: parseInt(document.getElementById('autoGroupInterval').value) || 2,
            gruposMensajes: gruposArray,
            gruposTarget: selectedGroups,
            gruposLastRun: (currentUserData.botConfig && currentUserData.botConfig.gruposLastRun) ? currentUserData.botConfig.gruposLastRun : null,
            gruposCurrentIndex: (currentUserData.botConfig && currentUserData.botConfig.gruposCurrentIndex) ? currentUserData.botConfig.gruposCurrentIndex : 0
        };

        // --- NUEVO: OBJETO DE ACTUALIZACIÓN CON PASARELAS ---
        let updateData = {
            name: name, country: country, currency: getCurrencyForCountry(country),
            phone: phone, logoUrl: logoUrl, bannerUrl: bannerUrl, storeAlias: finalAlias,
            referencesLink: referencesLink,
            paymentMethods: finalPaymentMethods,
            botConfig: botConfig,
            binancePayId: binancePayId,
            binanceAlias: binanceAlias,
            binanceExchangeRate: binanceExchangeRate
        };

        // Solo guardamos si el usuario escribió algo, o si quiso borrarlas
        if (document.getElementById('mpAccessTokenInput')) {
            // Solo lo actualizamos si el input NO tiene los asteriscos de seguridad
            if (!mpAccessToken.includes('***')) updateData.mpAccessToken = mpAccessToken;
        }
        if (document.getElementById('binanceApiKeyInput')) {
            if (!binanceApiKey.includes('***')) updateData.binanceApiKey = binanceApiKey;
        }
        if (document.getElementById('binanceSecretKeyInput')) {
            if (!binanceSecretKey.includes('***')) updateData.binanceSecretKey = binanceSecretKey;
        }

        await updateDoc(doc(db, "users", currentUser.uid), updateData);

        // Actualizar la memoria global
        currentUserData.botConfig = botConfig;
        currentUserData.storeAlias = finalAlias;
        currentUserData.name = name;
        currentUserData.country = country;
        currentUserData.phone = phone;
        currentUserData.logoUrl = logoUrl;
        currentUserData.bannerUrl = bannerUrl;
        currentUserData.referencesLink = referencesLink;
        currentUserData.paymentMethods = finalPaymentMethods;
        // Actualizamos en memoria local las pasarelas
        if (updateData.mpAccessToken !== undefined) currentUserData.mpAccessToken = updateData.mpAccessToken;
        if (updateData.binanceApiKey !== undefined) currentUserData.binanceApiKey = updateData.binanceApiKey;
        if (updateData.binanceSecretKey !== undefined) currentUserData.binanceSecretKey = updateData.binanceSecretKey;

        globalCurrency = getCurrencyForCountry(country);
        currentUserData.currency = globalCurrency;

        // Actualización DOM
        const brandSidebar = document.getElementById('brandNameSidebar');
        if (brandSidebar) brandSidebar.innerText = name || 'Mi Panel';

        const mobileBrand = document.getElementById('mobileBrandName');
        if (mobileBrand) mobileBrand.innerText = name || 'Mi Panel';

        const logoSidebar = document.getElementById('brandLogoSidebar');
        if (logoSidebar && logoUrl) { logoSidebar.src = logoUrl; logoSidebar.style.display = 'block'; }

        const mobileLogo = document.getElementById('mobileBrandLogo');
        if (mobileLogo && logoUrl) { mobileLogo.src = logoUrl; mobileLogo.style.display = 'block'; }

        const costInput = document.getElementById('clientCost');
        if (costInput) costInput.placeholder = `Costo Proveedor (${globalCurrency})`;

        const priceInput = document.getElementById('clientPrice');
        if (priceInput) priceInput.placeholder = `Precio de Venta (${globalCurrency})`;

        window.showNotification("Perfil, Bot y Pasarelas guardadas.");
        window.closeModals();

        if (document.getElementById('tableBody')) window.renderTable();
        if (document.getElementById('statsPanel')) window.toggleStats(true);

    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        if (btn) { btn.innerText = "Guardar Perfil"; btn.disabled = false; }
    }
};

// --- NUEVO: GUARDAR PASARELAS DE PAGO (PRO) ---
window.saveGateways = async () => {
    let mpAccessToken = "";
    let binanceApiKey = "";
    let binanceSecretKey = "";
    let binancePayId = "";
    let binanceAlias = "";
    let binanceExchangeRate = null;

    // Atrapamos las cajas HTML
    const cajaMp = document.getElementById('mpAccessTokenInput');
    const cajaBinApi = document.getElementById('binanceApiKeyInput');
    const cajaBinSec = document.getElementById('binanceSecretKeyInput');
    const cajaBinPayId = document.getElementById('binancePayIdInput');
    const cajaBinAlias = document.getElementById('binanceAliasInput');
    const cajaBinRate = document.getElementById('binanceExchangeRateInput');

    // Extraemos sus valores
    if (cajaMp) mpAccessToken = cajaMp.value.trim();
    if (cajaBinApi) binanceApiKey = cajaBinApi.value.trim();
    if (cajaBinSec) binanceSecretKey = cajaBinSec.value.trim();
    if (cajaBinPayId) binancePayId = cajaBinPayId.value.trim();
    if (cajaBinAlias) binanceAlias = cajaBinAlias.value.trim();
    if (cajaBinRate) binanceExchangeRate = parseFloat(cajaBinRate.value) || null;

    const btn = document.querySelector('#tabPasarelas .btn-primary');
    const origText = btn ? btn.innerHTML : 'Guardar Pasarelas';

    if (btn) {
        btn.innerHTML = "Guardando... ⏳";
        btn.disabled = true;
    }

    try {
        // Empaquetamos los nuevos datos primero
        let updateData = {
            binancePayId: binancePayId,
            binanceAlias: binanceAlias,
            binanceExchangeRate: binanceExchangeRate
        };

        // Solo guardamos claves si hay texto y NO son asteriscos
        if (mpAccessToken && !mpAccessToken.includes('***')) updateData.mpAccessToken = mpAccessToken;
        if (binanceApiKey && !binanceApiKey.includes('***')) updateData.binanceApiKey = binanceApiKey;
        if (binanceSecretKey && !binanceSecretKey.includes('***')) updateData.binanceSecretKey = binanceSecretKey;

        // Si vació las cajas de claves, borramos de la BD
        if (mpAccessToken === '') updateData.mpAccessToken = null;
        if (binanceApiKey === '') updateData.binanceApiKey = null;
        if (binanceSecretKey === '') updateData.binanceSecretKey = null;

        // Actualizamos Firebase
        if (Object.keys(updateData).length > 0) {
            await updateDoc(doc(db, "users", currentUser.uid), updateData);

            // Actualizamos la memoria local de la página
            if (updateData.mpAccessToken !== undefined) currentUserData.mpAccessToken = updateData.mpAccessToken;
            if (updateData.binanceApiKey !== undefined) currentUserData.binanceApiKey = updateData.binanceApiKey;
            if (updateData.binanceSecretKey !== undefined) currentUserData.binanceSecretKey = updateData.binanceSecretKey;

            currentUserData.binancePayId = updateData.binancePayId;
            currentUserData.binanceAlias = updateData.binanceAlias;
            currentUserData.binanceExchangeRate = updateData.binanceExchangeRate;
        }

        window.showNotification("✅ Pasarelas de pago guardadas exitosamente.");
    } catch (e) {
        window.showNotification("Error al guardar pasarelas: " + e.message);
        console.error(e);
    } finally {
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }
};

window.openSuggestionModal = () => { document.getElementById('suggestionText').value = ''; document.getElementById('suggestionModal').style.display = 'flex'; };
window.sendSuggestion = async () => { const text = document.getElementById('suggestionText').value; if (!text) return window.showNotification("Escribe algo primero."); const btn = document.querySelector('#suggestionModal .btn-primary'); btn.innerText = "Enviando..."; btn.disabled = true; try { await addDoc(collection(db, "suggestions"), { userId: currentUser.uid, userName: currentUserData.name, text: text, date: new Date().toISOString(), approved: false }); window.showNotification("¡Gracias! 🚀"); window.closeModals(); } catch (e) { window.showNotification("Error: " + e.message); } finally { btn.innerText = "Enviar Idea 🚀"; btn.disabled = false; } };

window.openAccountModal = () => {
    const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(cb => cb.value);
    if (checked.length === 0) return window.showNotification("⚠️ Primero selecciona las plataformas en el menú desplegable.");

    // Creamos/Mantenemos las pestañas según las plataformas elegidas
    const newMultiAccData = {};
    checked.forEach(plat => { newMultiAccData[plat] = multiAccData[plat] || window.getDefaultAccData(); });
    multiAccData = newMultiAccData;

    window.renderAccTabs(checked, 'accountModal');
    document.getElementById('accountModal').style.display = 'flex';
};

// 🪄 Creador de Pestañas
window.renderAccTabs = (platforms, modalType) => {
    const containerId = modalType === 'accountModal' ? 'accTabsContainer' : 'viewAccTabsContainer';
    const container = document.getElementById(containerId);
    container.style.display = platforms.length > 1 ? 'flex' : 'none';
    container.innerHTML = '';

    platforms.forEach((plat, index) => {
        const tab = document.createElement('div');
        tab.className = `chrome-tab ${index === 0 ? 'active' : ''}`;
        tab.innerText = plat; tab.title = plat;
        tab.onclick = () => window.switchAccTab(plat, modalType);
        container.appendChild(tab);
    });

    if (platforms.length > 0) window.switchAccTab(platforms[0], modalType);
};

// 🪄 Cambiador de Pestañas
window.switchAccTab = (platform, modalType) => {
    currentActiveTab = platform;
    const containerId = modalType === 'accountModal' ? 'accTabsContainer' : 'viewAccTabsContainer';
    document.querySelectorAll(`#${containerId} .chrome-tab`).forEach(t => t.classList.toggle('active', t.innerText === platform));

    const data = multiAccData[platform] || window.getDefaultAccData();

    if (modalType === 'accountModal') {
        document.getElementById('accEmail').value = data.email || '';
        document.getElementById('accPassword').value = data.password || '';
        document.getElementById('accProfile').value = data.profile || '';
        document.getElementById('accPin').value = data.pin || '';
        document.getElementById('accSaleType').value = data.saleType || 'Perfil';
        document.getElementById('accUnits').value = data.units || 1;
        if (document.getElementById('accMonths')) document.getElementById('accMonths').value = data.months || 1;
        document.getElementById('accDeviceName').value = data.deviceName || '';
        document.getElementById('accDeviceType').value = data.deviceType || '';
    } else {
        document.getElementById('viewAccSaleType').innerText = data.saleType || 'Perfil';
        document.getElementById('viewAccEmail').innerText = data.email || '-';
        document.getElementById('viewAccPassword').innerText = data.password || '-';
        document.getElementById('viewAccProfile').innerText = data.profile || '-';
        document.getElementById('viewAccPin').innerText = data.pin || '-';
        if (document.getElementById('viewAccMonths')) document.getElementById('viewAccMonths').innerText = data.months || '1';

        let deviceText = 'Sin configurar';
        if (data.deviceType) {
            let iconHtml = data.deviceType === 'TV' ? "<i class='bx bx-tv'></i>" : (data.deviceType === 'PC' ? "<i class='bx bx-laptop'></i>" : "<i class='bx bx-mobile-alt'></i>");
            deviceText = `${iconHtml} ${data.deviceType} ${data.deviceName ? '(' + data.deviceName + ')' : ''}`;
        }
        document.getElementById('viewAccDevice').innerHTML = deviceText;
        document.getElementById('viewAccUnits').innerText = data.units || '1';
    }
};

// 🪄 Auto-guardado al escribir en cada pestaña
window.updateActiveTab = (field, value) => {
    if (currentActiveTab && multiAccData[currentActiveTab]) multiAccData[currentActiveTab][field] = value;
};

window.confirmAccountData = () => {
    window.closeModals();
    const totalUnits = Object.values(multiAccData).reduce((sum, acc) => sum + (parseInt(acc.units) || 1), 0);
    const btn = document.getElementById('btnAccountData');
    btn.innerText = `✅ Datos Ingresados (${totalUnits} ud)`;
    btn.style.backgroundColor = "var(--mac-green)"; btn.style.color = "white";
};

window.viewAccountData = (id) => {
    const c = clients.find(x => x.id === id);

    // Adaptabilidad para leer clientes con pestañas o clientes viejos sin pestañas
    if (c.multiAccounts) {
        multiAccData = c.multiAccounts;
    } else {
        const platforms = c.platform.split(', ');
        multiAccData = {};
        platforms.forEach(p => {
            multiAccData[p] = { email: c.accountEmail, password: c.accountPassword, profile: c.accountProfile, pin: c.accountPin, saleType: c.accountSaleType, units: c.accountUnits, deviceName: c.accountDeviceName, deviceType: c.accountDeviceType };
        });
    }

    const platformsKeys = Object.keys(multiAccData);
    window.renderAccTabs(platformsKeys, 'viewModal');

    document.getElementById('viewAccProvider').innerText = c.providerName || 'Sin especificar';
    document.getElementById('viewAccPortalCode').innerText = c.portalCode || 'Sin Código';
    document.getElementById('viewAccountModal').style.display = 'flex';
};

window.openManageModal = (id, name, isActive, planActual) => {
    currentManageUserId = id;
    document.getElementById('manageUserName').innerText = name;
    document.getElementById('manageAction').value = isActive ? "true" : "false";

    const p = (planActual || 'demo').toLowerCase();
    const durationSelect = document.getElementById('manageDuration');

    // Si es plan básico, ocultar opciones temporales. Si es PRO, permitirlas.
    if (p === 'basico') {
        durationSelect.style.display = 'none';
        durationSelect.value = 'permanent';
    } else {
        durationSelect.style.display = 'block';
        durationSelect.value = 'permanent';
    }

    window.toggleDurationFields();
    document.getElementById('adminManageModal').style.display = 'flex';
};
window.toggleDurationFields = () => { document.getElementById('temporaryFields').style.display = document.getElementById('manageDuration').value === 'temporary' ? 'flex' : 'none'; };
window.toggleTempType = () => { document.getElementById('manageDays').style.display = document.getElementById('manageTempType').value === 'days' ? 'block' : 'none'; };
window.saveManageStatus = async () => {
    const action = document.getElementById('manageAction').value === "true";
    const duration = document.getElementById('manageDuration').value;
    let activeUntil = null, suspendedUntil = null;

    if (duration === 'temporary') {
        const targetDate = new Date();
        if (document.getElementById('manageTempType').value === '3hours') {
            targetDate.setHours(targetDate.getHours() + 3);
        } else {
            targetDate.setDate(targetDate.getDate() + 30);
        }
        if (action === true) activeUntil = targetDate.toISOString();
        else suspendedUntil = targetDate.toISOString();
    }

    const btn = document.querySelector('#adminManageModal .btn-primary');
    btn.innerText = "Guardando..."; btn.disabled = true;

    try {
        await updateDoc(doc(db, "users", currentManageUserId), { active: action, activeUntil: activeUntil, suspendedUntil: suspendedUntil });
        window.showNotification("Configuración aplicada.");
        window.closeModals();
        loadAdminData();
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerText = "Guardar y Aplicar"; btn.disabled = false;
    }
};
/* --- SISTEMA DE GESTIÓN DE PLANES (ADMIN) --- */
let currentPlanUserId = null;

window.openPlanModal = (id, name, planActual) => {
    currentPlanUserId = id;
    document.getElementById('planUserName').innerText = name;
    document.getElementById('newPlanSelect').value = planActual || 'demo';
    document.getElementById('planModal').style.display = 'flex';
};

window.savePlan = async () => {
    const btn = document.querySelector('#planModal .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = "Guardando... ⏳";
    btn.disabled = true;

    const nuevoPlan = document.getElementById('newPlanSelect').value;

    // Asignación matemática de límites según tu modelo de negocio
    let limite = 20;
    let dias = 3;

    if (nuevoPlan === 'basico') {
        limite = 100;
        dias = 30;
    } else if (nuevoPlan === 'pro') {
        limite = 9999; // Ilimitado
        dias = 30;
    }

    // Calculamos la nueva fecha de vencimiento
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + dias);

    try {
        await updateDoc(doc(db, "users", currentPlanUserId), {
            plan_actual: nuevoPlan,
            limite_clientes: limite,
            vencimiento_plan: fechaVencimiento.toISOString()
        });

        window.showNotification(`Plan ${nuevoPlan.toUpperCase()} activado con éxito 💎`);
        window.closeModals();
        loadAdminData(); // Recarga la tabla para ver el cambio instantáneo
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};
/* --- CARGA DEL PANEL GLOBAL (ADMIN) --- */
let adminUsersCache = []; // Memoria caché para no recargar de Firebase

window.toggleAdminPlanFilter = () => {
    const status = document.getElementById('adminFilterStatus').value;
    document.getElementById('adminFilterPlan').style.display = status === 'active' ? 'block' : 'none';
    window.renderAdminUsers();
};

window.renderAdminUsers = () => {
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = '';
    const statusFilter = document.getElementById('adminFilterStatus').value;
    const planFilter = document.getElementById('adminFilterPlan').value;

    adminUsersCache.forEach((data) => {
        // Filtrado
        if (statusFilter === 'active' && !data.active) return;
        if (statusFilter === 'inactive' && data.active) return;
        if (statusFilter === 'active' && planFilter !== 'all' && (data.plan_actual || 'demo').toLowerCase() !== planFilter) return;

        const id = data.id;
        const statusHtml = data.active ? `<span class="status active">Activado</span>` : `<span class="status expired">Suspendido</span>`;
        let expText = "";
        if (data.active && data.activeUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Vence: ${new Date(data.activeUntil).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>`; } else if (!data.active && data.suspendedUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Hasta: ${new Date(data.suspendedUntil).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>`; }

        const planDisplay = (data.plan_actual || 'demo').toUpperCase();
        const planColor = planDisplay === 'PRO' ? 'var(--mac-blue)' : (planDisplay === 'BASICO' ? 'var(--mac-green)' : 'var(--mac-text-secondary)');
        const safeName = (data.name || 'Usuario').replace(/'/g, "\\'");

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Nombre"><strong>${data.name}</strong></td>
            <td data-label="País">${data.country || '-'}</td>
            <td data-label="Correo">${data.email}</td>
            <td data-label="Teléfono">${data.phone || '-'}</td>
            <td data-label="Plan"><strong style="color: ${planColor};">${planDisplay}</strong></td>
            <td data-label="Estado">${statusHtml}${expText}</td>
            <td data-label="Acción" class="actions-cell" style="display: flex; gap: 5px;">
                <button class="action-btn" style="border: 1px solid var(--mac-border); background: transparent;" onclick="window.openManageModal('${id}', '${safeName}', ${data.active}, '${data.plan_actual}')">⚙️ Estado</button>
                <button class="action-btn" style="border: 1px solid var(--mac-blue); color: var(--mac-blue); background: transparent;" onclick="window.openPlanModal('${id}', '${safeName}', '${data.plan_actual || 'demo'}')">💎 Plan</button>
            </td>`;
        tbody.appendChild(tr);
    });
};

async function loadAdminData() {
    const [qUsers, qSuggestions, qNews] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "suggestions")),
        getDocs(collection(db, "news"))
    ]);

    // Llenar la caché y renderizar
    adminUsersCache = [];
    qUsers.forEach((d) => {
        if (d.data().role !== 'admin') adminUsersCache.push({ id: d.id, ...d.data() });
    });
    window.toggleAdminPlanFilter();

    // 2. Cargar Sugerencias
    const sBody = document.getElementById('adminSuggestionsBody'); sBody.innerHTML = '';
    let arrS = []; qSuggestions.forEach(d => arrS.push({ id: d.id, ...d.data() }));
    arrS.sort((a, b) => new Date(b.date) - new Date(a.date));

    arrS.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(s.date).toLocaleDateString('es-ES')}</td><td><strong>${s.userName}</strong></td><td style="color:var(--mac-text-secondary);">${s.text}</td><td>${s.approved ? '<span style="color:var(--mac-green);font-weight:bold;">✅ Aprobada</span>' : '<span style="color:var(--mac-orange);font-weight:bold;">⏳ Pendiente</span>'}</td><td class="actions-cell">${s.approved ? '' : `<button class="action-btn btn-wa" onclick="window.approveSuggestion('${s.id}')">✔️ Aprobar</button>`} <button class="action-btn btn-del" onclick="window.deleteSuggestion('${s.id}')">🗑️</button></td>`;
        sBody.appendChild(tr);
    });

    // 3. Cargar Noticias
    const nBody = document.getElementById('adminNewsBody'); nBody.innerHTML = '';
    let arrN = []; qNews.forEach(d => arrN.push({ id: d.id, ...d.data() }));

    arrN.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.fechaIso) - new Date(a.fechaIso);
    });

    arrN.forEach(n => {
        const dateStr = new Date(n.fechaIso).toLocaleDateString('es-ES');
        const imgHtml = n.img ? `<a href="${n.img}" target="_blank" style="color:var(--mac-blue); font-size:12px;">Ver Foto</a>` : '<span style="font-size:12px; color:var(--mac-text-secondary);">Sin foto</span>';

        const titleSafe = n.titulo ? n.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
        const descSafe = n.desc ? n.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n') : '';

        const pinnedIcon = n.isPinned ? '<i class="bx bxs-pin" style="color: var(--mac-orange); margin-right: 5px;" title="Noticia Fijada"></i>' : '';
        const pinBtnColor = n.isPinned ? 'var(--mac-orange)' : 'var(--mac-text-secondary)';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${pinnedIcon}<strong>${n.titulo}</strong></td>
            <td>${imgHtml}</td>
            <td class="actions-cell" style="display: flex; gap: 5px;">
                <button class="action-btn" style="border: 1px solid ${pinBtnColor}; color: ${pinBtnColor}; background: transparent;" onclick="window.togglePinNews('${n.id}', ${!!n.isPinned})" title="Fijar / Desfijar"><i class='bx bx-pin'></i></button>
                <button class="action-btn" style="border: 1px solid var(--mac-blue); color: var(--mac-blue); background: transparent;" onclick="window.startEditNews('${n.id}', '${titleSafe}', '${descSafe}', '${n.img || ''}')"><i class='bx bx-edit-alt'></i></button>
                <button class="action-btn btn-del" onclick="window.deleteNews('${n.id}')"><i class='bx bx-trash'></i></button>
            </td>`;
        nBody.appendChild(tr);
    });
}

/* --- FUNCIONES DE ADMINISTRAR NOTICIAS --- */
window.startEditNews = (id, title, desc, img) => {
    editingNewsId = id;
    editingNewsOldImg = img;

    document.getElementById('newsInputTitle').value = title;
    document.getElementById('newsInputDesc').value = desc;

    const btnSubmit = document.getElementById('btnSubmitNews');
    if (btnSubmit) btnSubmit.innerHTML = "<i class='bx bx-save'></i> Guardar Cambios";

    const btnCancel = document.getElementById('btnCancelEditNews');
    if (btnCancel) btnCancel.style.display = 'block';

    document.getElementById('newsInputTitle').scrollIntoView({ behavior: 'smooth' });
};

window.cancelEditNews = () => {
    editingNewsId = null;
    editingNewsOldImg = null;

    document.getElementById('newsInputTitle').value = '';
    document.getElementById('newsInputDesc').value = '';
    document.getElementById('newsInputImg').value = '';

    const btnSubmit = document.getElementById('btnSubmitNews');
    if (btnSubmit) btnSubmit.innerHTML = "<i class='bx bx-send'></i> Publicar Noticia a Todos";

    const btnCancel = document.getElementById('btnCancelEditNews');
    if (btnCancel) btnCancel.style.display = 'none';
};

window.saveNews = async () => {
    const title = document.getElementById('newsInputTitle').value;
    const desc = document.getElementById('newsInputDesc').value;
    const fileInput = document.getElementById('newsInputImg');

    if (!title || !desc) return window.showNotification("Falta título o descripción");

    const btn = document.getElementById('btnSubmitNews') || document.querySelector('#adminView .btn-primary');
    const origText = btn.innerHTML;
    btn.innerText = "Procesando... ⏳";
    btn.disabled = true;

    try {
        let imgUrl = editingNewsOldImg || ""; // Si editamos, usamos la antigua por defecto

        // Si el admin sube una nueva imagen, la reemplazamos
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `news/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(storageRef);
        }

        if (editingNewsId) {
            // MODO EDICIÓN
            await updateDoc(doc(db, "news", editingNewsId), {
                titulo: title,
                desc: desc,
                img: imgUrl
            });
            window.showNotification("Noticia actualizada con éxito ✏️");
            window.cancelEditNews();
        } else {
            // MODO CREACIÓN
            await addDoc(collection(db, "news"), {
                titulo: title,
                desc: desc,
                img: imgUrl,
                fechaIso: new Date().toISOString(),
                isPinned: false
            });

            // 🔥 EL GATILLO DEL MEGÁFONO (Avisa al bot para que haga sonar los celulares)
            fetch('https://bot.panelagc.com/api/notificar-noticia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: '📢 Nueva Noticia A.G.C.',
                    cuerpo: title
                })
            }).catch(e => console.error("Error al notificar al bot:", e));

            window.showNotification("Noticia publicada con éxito 📢");
            document.getElementById('newsInputTitle').value = '';
            document.getElementById('newsInputDesc').value = '';
            fileInput.value = '';
        }

        loadAdminData(); // Recarga la tabla
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        // Restaurar estado del botón si hubo error o si fue creación
        if (!editingNewsId) {
            btn.innerHTML = "<i class='bx bx-send'></i> Publicar Noticia a Todos";
        }
        btn.disabled = false;
    }
};

window.deleteNews = async (id) => {
    // ... tu código de deleteNews se queda igual ...
    if (confirm("¿Seguro que deseas eliminar esta noticia de todos los paneles?")) {
        await deleteDoc(doc(db, "news", id));
        window.showNotification("Noticia eliminada");
        loadAdminData();
    }
};
window.togglePinNews = async (id, currentStatus) => {
    try {
        await updateDoc(doc(db, "news", id), {
            isPinned: !currentStatus
        });
        window.showNotification(currentStatus ? "Noticia desfijada" : "Noticia fijada 📌");
        loadAdminData(); // Recarga la tabla
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};
window.approveSuggestion = async (id) => { await updateDoc(doc(db, "suggestions", id), { approved: true }); window.showNotification("Idea aprobada."); loadAdminData(); };
window.deleteSuggestion = async (id) => { if (confirm("¿Eliminar sugerencia?")) { await deleteDoc(doc(db, "suggestions", id)); loadAdminData(); } };

async function loadUserClients() {
    document.getElementById('tableLoader').style.display = 'block';
    document.getElementById('mainTable').style.display = 'none';
    if (document.getElementById('loadMoreContainer')) document.getElementById('loadMoreContainer').style.display = 'none';
    clients = [];

    try {
        const q = query(collection(db, "clients"), where("userId", "==", currentUser.uid), limit(30));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.docs.length === 30 && document.getElementById('loadMoreContainer')) {
                document.getElementById('loadMoreContainer').style.display = 'block';
            }
        }

        snapshot.forEach((d) => { clients.push({ id: d.id, ...d.data() }); });
        window.renderTable();
        document.getElementById('tableLoader').style.display = 'none';
        document.getElementById('mainTable').style.display = 'table';
    } catch (e) {
        window.showNotification("Error leyendo clientes: " + e.message);
        console.error(e);
    }
}

window.loadMoreClients = async () => {
    if (!lastVisibleDoc) return;
    const btn = document.querySelector('#loadMoreContainer button');
    btn.innerText = "Cargando..."; btn.disabled = true;

    try {
        const q = query(collection(db, "clients"), where("userId", "==", currentUser.uid), startAfter(lastVisibleDoc), limit(30));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            snapshot.forEach((d) => { clients.push({ id: d.id, ...d.data() }); });
            window.renderTable();
        }

        if (snapshot.docs.length < 30 && document.getElementById('loadMoreContainer')) {
            document.getElementById('loadMoreContainer').style.display = 'none';
        }
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerText = "⬇️ Cargar más clientes"; btn.disabled = false;
    }
};

const resetAccountButton = () => {
    multiAccData = {}; currentActiveTab = '';
    const btn = document.getElementById('btnAccountData');
    btn.innerText = "🔑 Ingresar Datos de Cuenta"; btn.style.backgroundColor = "var(--mac-gray)"; btn.style.color = "var(--mac-text-main)";
};
/* --- GUARDAR CLIENTE (CON HERENCIA DE COLOR INTELIGENTE) --- */
/* --- GUARDAR CLIENTE (CON LÍMITES, HERENCIA DE COLOR Y MATRIZ) --- */
window.saveClientData = async () => {
    const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(cb => cb.value);
    const phone = document.getElementById('phone').value.trim();

    if (!checked.length) return window.showNotification("Selecciona plataforma");
    if (!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE empezar con +");

    const cost = parseFloat(document.getElementById('clientCost').value) || 0;
    const price = parseFloat(document.getElementById('clientPrice').value) || 0;

    const btn = document.querySelector('#actionButtonsContainer .btn-primary');
    const origBtnText = btn.innerText;
    btn.innerText = "Verificando... ⏳";
    btn.disabled = true;

    try {
        // 🔒 EL CANDADO DE LÍMITES
        if (!editingClientId) {
            const plan = currentUserData.plan_actual || 'demo';
            const limitePermitido = currentUserData.limite_clientes || 20;

            const qCount = query(collection(db, "clients"), where("userId", "==", currentUser.uid));
            const snapshot = await getCountFromServer(qCount);
            const totalClientes = snapshot.data().count;

            if (totalClientes >= limitePermitido && plan !== 'pro' && plan !== 'elite') {
                Swal.fire({
                    icon: 'warning',
                    title: '¡Límite Alcanzado!',
                    text: `Tu plan ${plan.toUpperCase()} te permite gestionar hasta ${limitePermitido} perfiles.`,
                    confirmButtonText: '💎 Mejorar Plan',
                    confirmButtonColor: '#007AFF',
                    showCancelButton: true,
                    cancelButtonText: 'Cancelar',
                    background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
                    color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.mostrarPlanesSuscripcion();
                    }
                });
                btn.innerText = origBtnText;
                btn.disabled = false;
                return;
            }
        }

        // Sacamos la data principal de la primera plataforma seleccionada
        let primaryData = multiAccData[checked[0]] || window.getDefaultAccData();

        // 🛠️ VINCULACIÓN DINÁMICA INTELIGENTE
        let finalLinkedMasterId = null;
        if (primaryData.email) {
            const qMatriz = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid), where("email", "==", primaryData.email));
            const snapMatriz = await getDocs(qMatriz);
            if (!snapMatriz.empty) {
                finalLinkedMasterId = snapMatriz.docs[0].id;
            }
        }

        if (!finalLinkedMasterId && typeof variablesEnlaceMatriz !== 'undefined' && variablesEnlaceMatriz.masterId && !editingClientId) {
            finalLinkedMasterId = variablesEnlaceMatriz.masterId;
        }

        let generatedPortalCode = Math.random().toString(36).substring(2, 6).toUpperCase();

        // 🔥 MAGIA: Buscar si el teléfono ya tiene un código asignado en tu base de clientes
        const cleanPhoneToSave = phone.replace(/[^\d]/g, '');
        const existingClientWithPhone = clients.find(c => (c.phone ? c.phone.replace(/[^\d]/g, '') : '') === cleanPhoneToSave);

        if (existingClientWithPhone && existingClientWithPhone.portalCode) {
            generatedPortalCode = existingClientWithPhone.portalCode; // Recicla el código de su compra anterior
        }

        const data = {
            userId: currentUser.uid,
            name: document.getElementById('clientName').value,
            platform: checked.join(', '),
            phone: phone,
            date: document.getElementById('expirationDate').value,
            cost: cost,
            providerName: document.getElementById('clientProviderName').value,
            price: price,
            multiAccounts: multiAccData, // GUARDADO MULTI-PESTAÑA
            // Legacy fallbacks para que no se rompan las demás vistas
            accountSaleType: primaryData.saleType,
            accountEmail: primaryData.email,
            accountPassword: primaryData.password,
            accountProfile: primaryData.profile,
            accountPin: primaryData.pin,
            accountUnits: primaryData.units || 1,
            accountMonths: primaryData.months || 1,
            linkedMasterId: finalLinkedMasterId,
            accountDeviceName: primaryData.deviceName,
            accountDeviceType: primaryData.deviceType,
            portalCode: generatedPortalCode,
            notes: window.currentClientNote
        };

        if (editingClientId) {
            const clienteAEditar = clients.find(c => c.id === editingClientId);
            data.color = clienteAEditar.color || macPalette[Math.floor(Math.random() * macPalette.length)];
            if (clienteAEditar.portalCode) {
                data.portalCode = clienteAEditar.portalCode;
            }

            await updateDoc(doc(db, "clients", editingClientId), data);
            window.showNotification("Actualizado");
        }
        else {
            const clienteExistente = clients.find(c => c.name.trim().toLowerCase() === data.name.trim().toLowerCase() && c.phone === data.phone);
            if (clienteExistente && clienteExistente.color) {
                data.color = clienteExistente.color;
            } else {
                data.color = macPalette[Math.floor(Math.random() * macPalette.length)];
            }
            await addDoc(collection(db, "clients"), data);
            window.showNotification("Agregado");
        }

        // 🗑️ MAGIA AUTOMÁTICA: Eliminamos del stock lo que haya coincidido
        let stock = currentUserData.inventory || [];
        let updatedStock = false;

        Object.values(multiAccData).forEach(acc => {
            // Buscamos coincidencia por inventoryId o por coincidencia exacta de datos
            const matchIndex = stock.findIndex(item =>
                (acc.inventoryId && item.id === acc.inventoryId) ||
                (item.email && item.email.toLowerCase() === acc.email.toLowerCase() && String(item.profile) === String(acc.profile) && item.platform === acc.platform && item.status === 'libre')
            );

            if (matchIndex !== -1) {
                stock.splice(matchIndex, 1); // ELIMINA POR COMPLETO DEL INVENTARIO
                updatedStock = true;
            }
        });

        if (updatedStock) {
            await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
            currentUserData.inventory = stock;
        }

        // Limpiamos el puente de enlace de la Matriz para el siguiente registro
        if (typeof variablesEnlaceMatriz !== 'undefined') {
            variablesEnlaceMatriz = { masterId: null, profileNum: null };
        }
        window.currentClientNote = '';
        editingClientId = null;
        document.getElementById('clientForm').reset();
        resetAccountButton();
        document.getElementById('selectText').textContent = 'Plataforma(s)...';
        document.getElementById('selectText').classList.remove('has-selection');
        document.getElementById('actionButtonsContainer').innerHTML = `<button type="button" class="btn-primary" onclick="window.saveClientData()">Agregar Cliente</button>`;
        loadUserClients();

    } catch (e) {
        window.showNotification("Error al guardar: " + e.message);
    } finally {
        btn.innerText = origBtnText;
        btn.disabled = false;
    }
    // 💡 NOTIFICACIÓN ÚNICA EN LA VIDA PARA EDUCAR AL USUARIO SOBRE EL PORTAL
    const tipKey = 'portalTipSeen_' + currentUser.uid;
    if (!localStorage.getItem(tipKey)) {
        localStorage.setItem(tipKey, 'true'); // Guardar que ya se le mostró

        Swal.fire({
            title: '🌐 ¡Nueva Opción Profesional!',
            html: `
                <p style="font-size: 14px; color: var(--mac-text-main); margin-bottom: 12px;">
                    ¡Cliente guardado exitosamente! 🎉
                </p>
                <p style="font-size: 13px; color: var(--mac-text-secondary); line-height: 1.5; margin-bottom: 15px;">
                    Ahora puedes enviarle su <b>Portal Web de Cliente</b> en vez de mandarle textos largos. Tu cliente podrá ver sus credenciales y vencimiento en tiempo real con su <b>Código Web</b>.
                </p>
                <div style="background: rgba(94, 92, 230, 0.1); border: 1px solid #5e5ce6; padding: 12px; border-radius: 12px; text-align: left; font-size: 12px; color: var(--mac-text-main);">
                    💡 <b>¿Cómo usarlo?</b><br>
                    Presiona el botón de <b>WhatsApp (WA)</b> en la tabla y elige la opción <b>"Enlace del Portal + Código Web"</b> para enviárselo en 1 solo clic.
                </div>
                <p style="font-size: 11px; color: var(--mac-text-secondary); margin-top: 15px; font-style: italic;">
                    *(Esta ventana informativa solo aparecerá esta vez)*
                </p>
            `,
            icon: 'info',
            confirmButtonText: '¡Entendido, excelente!',
            confirmButtonColor: '#5e5ce6',
            background: 'var(--mac-surface, #1c1c1e)',
            color: 'var(--mac-text-main, #ffffff)'
        });
    }
};

window.deleteClient = async (id) => {
    Swal.fire({
        title: '¿Borrar cliente?',
        text: "Los datos de este cliente se perderán.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#FF3B30',
        cancelButtonColor: 'var(--mac-gray)',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: '<span style="color:var(--mac-text-main)">Cancelar</span>',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await deleteDoc(doc(db, "clients", id));
            loadUserClients();
            window.showNotification("🗑️ Cliente borrado");
        }
    });
};
window.renewClient = async (id) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;

    let [year, month, day] = c.date.split('-');
    let fechaAntigua = new Date(year, month - 1, day);
    const antiguaFechaBonita = fechaAntigua.toLocaleDateString('es-ES');

    // Variables globales temporales para que el modal sepa qué estamos haciendo
    window.currentRenewType = 'mes'; // Por defecto seleccionamos 'mes a mes'
    window.currentRenewBaseDate = fechaAntigua;

    // 1. Función para actualizar los números en tiempo real al escribir
    window.updateRenewDates = () => {
        let meses = parseInt(document.getElementById('swal-renew-months').value) || 1;

        // Cálculo Mes a Mes (De fecha a fecha)
        let dMes = new Date(window.currentRenewBaseDate);
        dMes.setMonth(dMes.getMonth() + meses);
        document.getElementById('date-mes').innerText = dMes.toLocaleDateString('es-ES');

        // Cálculo 30 Días Exactos
        let d30 = new Date(window.currentRenewBaseDate);
        d30.setDate(d30.getDate() + (30 * meses));
        document.getElementById('date-30d').innerText = d30.toLocaleDateString('es-ES');
    };

    // 2. Función para iluminar la tarjeta que el usuario seleccione
    window.selectRenewOpt = (type) => {
        window.currentRenewType = type;
        const cardMes = document.getElementById('optMesAMes');
        const card30d = document.getElementById('opt30Dias');

        if (type === 'mes') {
            cardMes.style.border = '2px solid var(--mac-blue)';
            cardMes.style.background = 'rgba(0, 122, 255, 0.15)';

            card30d.style.border = '1px solid var(--mac-border)';
            card30d.style.background = 'var(--mac-bg)';
        } else {
            card30d.style.border = '2px solid var(--mac-blue)';
            card30d.style.background = 'rgba(0, 122, 255, 0.15)';

            cardMes.style.border = '1px solid var(--mac-border)';
            cardMes.style.background = 'var(--mac-bg)';
        }
    };

    // Calculamos los valores iniciales (1 mes)
    let initMes = new Date(fechaAntigua); initMes.setMonth(initMes.getMonth() + 1);
    let init30d = new Date(fechaAntigua); init30d.setDate(init30d.getDate() + 30);

    const { value: confirmacion } = await Swal.fire({
        title: '🔄 Renovar Servicio',
        html: `
            <p style="color: var(--mac-text-secondary); font-size: 14px; margin-bottom: 15px;">
                Vencimiento actual: <strong style="color: var(--mac-text-main);">${antiguaFechaBonita}</strong>
            </p>
            
            <!-- Selector de cantidad de meses -->
            <div style="display:flex; align-items:center; justify-content:center; gap: 10px; margin-bottom: 20px;">
                <label style="font-size: 14px; font-weight: bold; color: var(--mac-text-main);">Renovar por:</label>
                <!-- Limitado a 2 dígitos máximo -->
                <input type="number" id="swal-renew-months" value="1" min="1" max="99" oninput="window.updateRenewDates()" style="width: 60px; text-align: center; font-size: 18px; font-weight: bold; padding: 8px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-blue); outline: none;">
                <label style="font-size: 14px; font-weight: bold; color: var(--mac-text-main);">mes(es)</label>
            </div>

            <p style="font-size: 11px; color: var(--mac-text-secondary); font-weight: bold; text-transform: uppercase; margin-bottom: 10px;">Selecciona la modalidad de cálculo:</p>

            <!-- Tarjetas Interactivas -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <!-- Tarjeta 1: Fecha a Fecha -->
                <div id="optMesAMes" onclick="window.selectRenewOpt('mes')" style="cursor: pointer; background: rgba(0, 122, 255, 0.15); padding: 15px 10px; border-radius: 12px; border: 2px solid var(--mac-blue); transition: 0.2s; display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 5px;">📆 Fecha a Fecha</span>
                    <span style="font-size: 10px; color: var(--mac-text-secondary);">(Ej: 22/8 al 22/9)</span>
                    <strong id="date-mes" style="font-size: 16px; color: var(--mac-blue); margin-top: 8px;">${initMes.toLocaleDateString('es-ES')}</strong>
                </div>

                <!-- Tarjeta 2: 30 Días Exactos -->
                <div id="opt30Dias" onclick="window.selectRenewOpt('30d')" style="cursor: pointer; background: var(--mac-bg); padding: 15px 10px; border-radius: 12px; border: 1px solid var(--mac-border); transition: 0.2s; display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 5px;">🔢 30 Días Exactos</span>
                    <span style="font-size: 10px; color: var(--mac-text-secondary);">(Multiplica por 30)</span>
                    <strong id="date-30d" style="font-size: 16px; color: var(--mac-blue); margin-top: 8px;">${init30d.toLocaleDateString('es-ES')}</strong>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: 'var(--mac-blue)',
        cancelButtonColor: 'var(--mac-gray)',
        confirmButtonText: 'Confirmar Renovación',
        cancelButtonText: '<span style="color:var(--mac-text-main)">Cancelar</span>',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        preConfirm: () => {
            // Evaluamos la selección al presionar Confirmar
            const meses = parseInt(document.getElementById('swal-renew-months').value) || 1;
            let finalDate = new Date(window.currentRenewBaseDate);

            if (window.currentRenewType === 'mes') {
                finalDate.setMonth(finalDate.getMonth() + meses);
            } else {
                finalDate.setDate(finalDate.getDate() + (30 * meses));
            }
            return finalDate;
        }
    });

    if (confirmacion) {
        let fechaNueva = confirmacion; // Recibimos la fecha exacta calculada
        const strFirebase = `${fechaNueva.getFullYear()}-${String(fechaNueva.getMonth() + 1).padStart(2, '0')}-${String(fechaNueva.getDate()).padStart(2, '0')}`;
        const bonitaNueva = fechaNueva.toLocaleDateString('es-ES');

        aplicarRenovacionFirebase(id, strFirebase, bonitaNueva, c);
    }
};
// Función auxiliar para guardar la fecha que el cliente seleccionó y avisar al BOT
const aplicarRenovacionFirebase = async (id, strFirebase, nuevaFechaBonita, c) => {
    try {
        const nuevasRenovaciones = (c.renovations || 0) + 1;
        await updateDoc(doc(db, "clients", id), {
            date: strFirebase,
            renovations: nuevasRenovaciones
        });
        window.showNotification("Servicio renovado ✅");
        loadUserClients();

        const plan = currentUserData.plan_actual || 'demo';
        if (plan === 'pro' || plan === 'elite') {

            // 👈 AHORA SÍ CONSTRUIMOS TU MENSAJE PERSONALIZADO DE RENOVACIÓN
            let baseMsg = currentUserData.waRenewMessage || "🎉 *¡Renovación Exitosa, {nombre}!*\n\nTu servicio de *{plataforma}* ha sido renovado correctamente.\n📅 Nueva fecha de vencimiento: *{fecha}*\n\n🌐 *Tu Portal:* {link}\n🔑 *Código Web:* {codigo}\n\n¡Gracias por seguir confiando en nosotros! 🚀";
            let uCount = c.accountUnits || 1;
            let precioCalculado = (c.price || 0) * uCount;
            let moneda = currentUserData.currency || "S/";

            const baseUrl = window.location.origin + window.location.pathname;
            const portalAlias = currentUserData.storeAlias || currentUser.uid;
            const portalUrl = `${baseUrl}?portal=${portalAlias}`;

            let finalMsg = baseMsg
                .replace(/{nombre}/g, c.name)
                .replace(/{plataforma}/g, c.platform)
                .replace(/{fecha}/g, nuevaFechaBonita)
                .replace(/{precio}/g, precioCalculado.toFixed(2))
                .replace(/{moneda}/g, moneda)
                .replace(/{link}/g, portalUrl)
                .replace(/{numero}/g, c.phone)
                .replace(/{codigo}/g, c.portalCode || 'N/A');

            const datosRenovacion = {
                distribuidorId: currentUser.uid,
                numeroCliente: c.phone,
                plataforma: c.platform,
                nuevaFecha: nuevaFechaBonita,
                mensajeRenovacion: finalMsg // 👈 SE LO PASAMOS AL BOT
            };
            fetch('https://bot.panelagc.com/api/confirmar-renovacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datosRenovacion) });
        }
    } catch (error) {
        window.showNotification("Error: " + error.message);
    }
};

window.startEdit = (id) => {
    editingClientId = id;
    const c = clients.find(x => x.id === id);
    window.currentClientNote = c.notes || '';
    document.getElementById('clientName').value = c.name;
    document.getElementById('phone').value = c.phone;
    document.getElementById('expirationDate').value = c.date;
    document.getElementById('clientCost').value = c.cost || '';
    document.getElementById('clientPrice').value = c.price || '';
    document.getElementById('clientProviderName').value = c.providerName || '';

    // 🔥 RECONSTRUIR multiAccData DESDE LA BASE DE DATOS
    if (c.multiAccounts) {
        multiAccData = c.multiAccounts;
    } else {
        // Soporte para clientes antiguos que no tenían pestañas
        const platforms = c.platform.split(', ');
        multiAccData = {};
        platforms.forEach(p => {
            multiAccData[p] = {
                email: c.accountEmail || '',
                password: c.accountPassword || '',
                profile: c.accountProfile || '',
                pin: c.accountPin || '',
                saleType: c.accountSaleType || 'Perfil',
                units: c.accountUnits || 1,
                deviceName: c.accountDeviceName || '',
                deviceType: c.accountDeviceType || ''
            };
        });
    }

    if (typeof variablesEnlaceMatriz !== 'undefined') {
        variablesEnlaceMatriz.masterId = c.linkedMasterId || null;
        variablesEnlaceMatriz.profileNum = c.accountProfile || null;
        variablesEnlaceMatriz.originalEmail = c.accountEmail || '';
        variablesEnlaceMatriz.originalPass = c.accountPassword || '';
    }

    const totalUnits = Object.values(multiAccData).reduce((sum, acc) => sum + (parseInt(acc.units) || 1), 0);
    const btn = document.getElementById('btnAccountData');
    btn.innerText = `✅ Datos de Cuenta (${totalUnits} ud)`;
    btn.style.backgroundColor = "var(--mac-green)";
    btn.style.color = "white";

    const cbs = document.querySelectorAll('#checkboxDropdown input');
    cbs.forEach(cb => cb.checked = false);
    c.platform.split(', ').forEach(p => { cbs.forEach(cb => { if (cb.value === p) cb.checked = true; }); });
    document.getElementById('selectText').textContent = c.platform;
    document.getElementById('selectText').classList.add('has-selection');
    document.getElementById('actionButtonsContainer').innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><button type="button" class="btn-primary" onclick="window.saveClientData()">Guardar</button><button type="button" class="btn-secondary" onclick="window.cancelEdit()">Cancelar</button></div>`;
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
};

window.cancelEdit = () => {
    window.currentClientNote = '';
    editingClientId = null;
    document.getElementById('clientForm').reset();
    resetAccountButton();
    if (typeof variablesEnlaceMatriz !== 'undefined') { variablesEnlaceMatriz = { masterId: null, profileNum: null }; }
    document.getElementById('selectText').textContent = 'Plataforma(s)...';
    document.getElementById('selectText').classList.remove('has-selection');
    document.getElementById('actionButtonsContainer').innerHTML = `<button type="button" class="btn-primary" onclick="window.saveClientData()">Agregar Cliente</button>`;
};
/* --- RENDERIZAR TABLA (NOMBRES DE COLORES) --- */
window.renderTable = () => {
    const tbody = document.getElementById('tableBody'); tbody.innerHTML = ''; const today = new Date(); today.setHours(0, 0, 0, 0);
    const search = document.getElementById('searchInput').value.toLowerCase(); const filter = document.getElementById('filterSelect').value;
    let proc = clients.map(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0); const diff = Math.ceil((exp - today) / 86400000); return { ...c, expDate: exp, diffDays: diff, statusCat: diff > 3 ? 'active' : (diff >= 0 ? 'warning' : 'expired') }; }).sort((a, b) => a.diffDays - b.diffDays);

    proc.forEach(c => {
        if (filter !== 'all' && c.statusCat !== filter) return;
        if (search && !c.name.toLowerCase().includes(search) && !c.phone.toLowerCase().includes(search) && !c.platform.toLowerCase().includes(search)) return;
        const stText = c.diffDays > 0 ? `Faltan ${c.diffDays} d` : (c.diffDays === 0 ? 'Hoy' : 'Vencido');
        const uCount = c.accountUnits || 1; const prof = ((c.price || 0) - (c.cost || 0)) * uCount; const dispUnits = uCount > 1 ? `<span style="font-size:11px;color:var(--mac-text-secondary);display:block;">(${uCount} unidades)</span>` : ''; // UI de Etiquetas, Notas y Lealtad
        let tagHtml = c.tag ? `<span style="background: ${c.tagColor}15; color: ${c.tagColor}; font-size: 10px; padding: 2px 6px; border-radius: 6px; border: 1px solid ${c.tagColor}50; display:inline-block; margin-top:4px; font-weight:bold;">${c.tag}</span>` : '';
        // 1. Creamos la "N" estilo Notion (Clickeable)
        let notionNoteHtml = c.notes ? `<div onclick="window.viewClientNote('${c.id}')" title="Ver Nota" style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:#000; color:#fff; border-radius:6px; font-weight:900; font-family:sans-serif; font-size:12px; cursor:pointer; flex-shrink:0; box-shadow:0 2px 5px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);">N</div>` : '';
        let loyatyHtml = (c.renovations > 0) ? `<span title="${c.renovations} renovaciones continuas" style="font-size: 12px; color: #FFD700; margin-left: 5px;"><i class='bx bxs-star'></i>${c.renovations}</span>` : '';
        // LOGICA DE DISPOSITIVOS CON BOXICONS
        let deviceIndicator = '';
        if (c.accountDeviceType) {
            let iconHtml = '';
            if (c.accountDeviceType === 'TV') iconHtml = "<i class='bx bx-tv'></i>";
            if (c.accountDeviceType === 'PC') iconHtml = "<i class='bx bx-laptop'></i>";
            if (c.accountDeviceType === 'Celular') iconHtml = "<i class='bx bx-mobile-alt'></i>";

            let tooltip = c.accountDeviceName ? `Dispositivo: ${c.accountDeviceName}` : 'Dispositivo Activo';
            deviceIndicator = `<span title="${tooltip}" style="cursor:help; margin-left:5px; font-size:14px;">${iconHtml}<span class="device-dot-green"></span></span>`;
        } else {
            deviceIndicator = `<span title="Sin dispositivo configurado" class="device-dot-red"></span>`;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="Cliente" onclick="if(window.innerWidth <= 768) window.openMobileClientModal('${c.id}')">
            <div class="client-profile">
                <!-- 🔥 FIX: LA ETIQUETA AHORA TIENE LA CLASE 'mobile-inline-badge' PARA DESAPARECER EN PC -->
                <span style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span style="color:${c.color || 'var(--mac-text-main)'}; font-weight: 800; font-size: 15px; letter-spacing: 0.5px;">${c.name}</span>
                    <span class="status ${c.statusCat} mobile-inline-badge" style="font-size: 10px; padding: 2px 6px; border-radius: 6px; line-height: 1;">${stText}</span>
                </span>
                ${loyatyHtml}<br>${tagHtml} <!-- 👈 ELIMINAMOS EL VIEJO ÍCONO DE AQUÍ -->
            </div>
        </td>
        <td data-label="Plataformas" style="font-weight: 500;">${c.platform}${deviceIndicator}</td>
        <td data-label="Cuenta">
            <div style="display:flex; align-items:center; gap:8px;">
                ${notionNoteHtml}
                <button class="action-btn" style="color:var(--mac-text-main); font-weight:bold; border: 1px solid var(--mac-border);" onclick="window.viewAccountData('${c.id}')"><i class='bx bx-key'></i> Ver Datos</button>
            </div>
        </td>
        <td data-label="WhatsApp">${c.phone}</td>
        <td data-label="Utilidad (${globalCurrency})"><span style="color:var(--mac-green); font-weight:bold;">+${globalCurrency}${prof.toFixed(2)}</span>${dispUnits}</td>
        <td data-label="Vencimiento">${c.expDate.toLocaleDateString('es-ES')}</td>
        <td data-label="Estado"><span class="status ${c.statusCat}">${stText}</span></td>
        <td data-label="Acciones" class="actions-cell" style="overflow: visible;">
            <div style="position: relative; display: inline-block;">
                <button class="action-btn" onclick="window.toggleClientMenu(event, 'menu-${c.id}')" style="background: var(--mac-blue); color: white; border:none; padding: 8px 12px;">
                    ⚙️ Opciones <i class='bx bx-chevron-down'></i>
                </button>
                <div id="menu-${c.id}" class="settings-dropdown client-action-menu" style="top: 110%; right: 0; min-width: 150px; z-index: 999;">
                    <button class="dropdown-item" onclick="window.openWaSendModal('${c.id}')" style="color: var(--mac-green);"><i class='bx bxl-whatsapp'></i> WhatsApp</button>
                    <button class="dropdown-item" onclick="window.downloadTicket('${c.id}', event)" style="color: #AF52DE;"><i class='bx bx-receipt'></i> Recibo</button>
                    <button class="dropdown-item" onclick="window.openLinkModal('${c.id}', '${c.platform}')" style="color: #007AFF;"><i class='bx bx-link'></i> Vincular a Matriz</button>
                    ${c.statusCat !== 'active' ? `<button class="dropdown-item" onclick="window.renewClient('${c.id}')"><i class='bx bx-refresh'></i> Renovar</button>` : ''}
                    <button class="dropdown-item" onclick="window.startEdit('${c.id}')"><i class='bx bx-edit-alt'></i> Editar</button>
                    <button class="dropdown-item text-danger" onclick="window.deleteClient('${c.id}')"><i class='bx bx-trash'></i> Borrar</button>
                </div>
            </div>
        </td>`;
        tbody.appendChild(tr);
    });
    if (document.getElementById('statsPanel').style.display === 'grid') window.toggleStats(true);
};

/* --- SISTEMA MULTI-PLATAFORMA AVANZADO DE ENVÍO POR WHATSAPP --- */
/* =========================================================
   SISTEMA AVANZADO MULTI-PLATAFORMA Y PORTAL DE WHATSAPP
========================================================= */
let currentWaClientId = null;
let currentWaType = null;

window.openWaSendModal = (id) => {
    currentWaClientId = id;
    currentWaType = null;
    const c = clients.find(x => x.id === id);
    if (!c) return;

    // Reset de botones principales
    const btnR = document.getElementById('btnWaRenovacion');
    const btnD = document.getElementById('btnWaDatos');
    const btnP = document.getElementById('btnWaPortal');

    if (btnR) { btnR.style.border = '1px solid var(--mac-blue)'; btnR.style.background = 'rgba(0, 122, 255, 0.1)'; btnR.style.color = 'var(--mac-blue)'; }
    if (btnD) { btnD.style.border = '1px solid var(--mac-green)'; btnD.style.background = 'rgba(52, 199, 89, 0.1)'; btnD.style.color = 'var(--mac-green)'; }
    if (btnP) { btnP.style.border = '1px solid var(--mac-blue)'; btnP.style.background = 'rgba(94, 92, 230, 0.1)'; btnP.style.color = 'var(--mac-blue)'; }

    document.getElementById('waDataOptionsContainer').style.display = 'none';
    document.getElementById('btnConfirmWaSend').style.display = 'none';

    // 🎬 GENERACIÓN DINÁMICA DE TARJETAS POR PLATAFORMA
    const container = document.getElementById('dynamicWaPlatformsContainer');
    if (container) {
        container.innerHTML = '';

        let platformsList = [];
        if (c.multiAccounts && Object.keys(c.multiAccounts).length > 0) {
            platformsList = Object.keys(c.multiAccounts);
        } else {
            platformsList = c.platform ? c.platform.split(',').map(p => p.trim()) : ['Servicio'];
        }

        platformsList.forEach(platName => {
            const options = [
                { val: 'correo', label: '📧 Correo' },
                { val: 'pass', label: '🔑 Clave' },
                { val: 'perfil', label: '👤 Perfil' },
                { val: 'pin', label: '📌 PIN' },
                { val: 'fecha', label: '📅 Venc.' },
                { val: 'reglas', label: '⚠️ Reglas' }
            ];

            let cardsHtml = options.map(opt => `
                <label class="wa-chk-card" onclick="window.updateWaChkCard(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); color: var(--mac-text-main); font-weight: 500; transition: all 0.2s;">
                    <span>${opt.label}</span>
                    <input type="checkbox" class="wa-data-chk" data-platform="${platName}" value="${opt.val}" checked style="display:none;">
                    <i class='bx bx-check-circle wa-chk-icon' style="color: var(--mac-green); font-size: 16px;"></i>
                </label>
            `).join('');

            const blockHtml = `
                <div style="background: var(--mac-bg); padding: 12px; border-radius: 10px; border: 1px solid var(--mac-border);">
                    <div style="font-size: 13px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 10px; text-transform: uppercase;">🎬 ${platName}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                        ${cardsHtml}
                    </div>
                </div>
            `;
            container.innerHTML += blockHtml;
        });
    }

    const btnToggle = document.getElementById('btnToggleAllWaBoxes');
    if (btnToggle) btnToggle.innerText = 'Desmarcar Todo';

    document.getElementById('waSendOptionsModal').style.display = 'flex';
};

window.closeWaSendModal = () => {
    document.getElementById('waSendOptionsModal').style.display = 'none';
    currentWaClientId = null;
};

window.selectWaType = (type) => {
    currentWaType = type;
    const btnR = document.getElementById('btnWaRenovacion');
    const btnD = document.getElementById('btnWaDatos');
    const btnP = document.getElementById('btnWaPortal');

    if (btnR) { btnR.style.background = 'rgba(0, 122, 255, 0.1)'; btnR.style.color = 'var(--mac-blue)'; btnR.style.border = '1px solid var(--mac-blue)'; }
    if (btnD) { btnD.style.background = 'rgba(52, 199, 89, 0.1)'; btnD.style.color = 'var(--mac-green)'; btnD.style.border = '1px solid var(--mac-green)'; }
    if (btnP) { btnP.style.background = 'rgba(94, 92, 230, 0.1)'; btnP.style.color = 'var(--mac-blue)'; btnP.style.border = '1px solid var(--mac-blue)'; }

    if (type === 'renovacion' && btnR) {
        btnR.style.border = '2px solid var(--mac-blue)'; btnR.style.background = 'var(--mac-blue)'; btnR.style.color = 'white';
        document.getElementById('waDataOptionsContainer').style.display = 'none';
    } else if (type === 'datos' && btnD) {
        btnD.style.border = '2px solid var(--mac-green)'; btnD.style.background = 'var(--mac-green)'; btnD.style.color = 'white';
        document.getElementById('waDataOptionsContainer').style.display = 'block';
    } else if (type === 'portal' && btnP) {
        btnP.style.border = '2px solid #5e5ce6'; btnP.style.background = '#5e5ce6'; btnP.style.color = 'white';
        document.getElementById('waDataOptionsContainer').style.display = 'none';
    }

    document.getElementById('btnConfirmWaSend').style.display = 'block';
};

window.updateWaChkCard = (labelEl) => {
    setTimeout(() => {
        const chk = labelEl.querySelector('.wa-data-chk');
        const icon = labelEl.querySelector('.wa-chk-icon');
        if (!chk || !icon) return;
        if (chk.checked) {
            labelEl.style.border = '1px solid var(--mac-green)';
            labelEl.style.background = 'rgba(52, 199, 89, 0.15)';
            labelEl.style.opacity = '1';
            icon.className = 'bx bx-check-circle wa-chk-icon';
            icon.style.color = 'var(--mac-green)';
        } else {
            labelEl.style.border = '1px solid var(--mac-border)';
            labelEl.style.background = 'var(--mac-surface)';
            labelEl.style.opacity = '0.5';
            icon.className = 'bx bx-circle wa-chk-icon';
            icon.style.color = 'var(--mac-text-secondary)';
        }
    }, 10);
};
window.toggleSwalChk = (labelEl) => {
    setTimeout(() => {
        const chk = labelEl.querySelector('input[type="checkbox"]');
        const icon = labelEl.querySelector('i');
        if (chk.checked) {
            labelEl.style.border = '1px solid var(--mac-green)';
            labelEl.style.background = 'rgba(52, 199, 89, 0.15)';
            icon.className = 'bx bx-check-circle';
            icon.style.color = 'var(--mac-green)';
        } else {
            labelEl.style.border = '1px solid var(--mac-border)';
            labelEl.style.background = 'var(--mac-surface)';
            icon.className = 'bx bx-circle';
            icon.style.color = 'var(--mac-text-secondary)';
        }
    }, 10);
};
window.toggleAllWaBoxes = () => {
    const btn = document.getElementById('btnToggleAllWaBoxes');
    const cards = document.querySelectorAll('.wa-chk-card');
    const checkboxes = document.querySelectorAll('.wa-data-chk');
    const allChecked = Array.from(checkboxes).every(c => c.checked);

    checkboxes.forEach((c, idx) => {
        c.checked = !allChecked;
        const labelEl = cards[idx];
        if (!labelEl) return;
        const icon = labelEl.querySelector('.wa-chk-icon');
        if (c.checked) {
            labelEl.style.border = '1px solid var(--mac-green)';
            labelEl.style.background = 'rgba(52, 199, 89, 0.15)';
            labelEl.style.opacity = '1';
            if (icon) { icon.className = 'bx bx-check-circle wa-chk-icon'; icon.style.color = 'var(--mac-green)'; }
        } else {
            labelEl.style.border = '1px solid var(--mac-border)';
            labelEl.style.background = 'var(--mac-surface)';
            labelEl.style.opacity = '0.5';
            if (icon) { icon.className = 'bx bx-circle wa-chk-icon'; icon.style.color = 'var(--mac-text-secondary)'; }
        }
    });
    if (btn) btn.innerText = !allChecked ? 'Desmarcar Todo' : 'Marcar Todo';
};

window.confirmSendWa = () => {
    if (!currentWaClientId) return;
    const c = clients.find(x => x.id === currentWaClientId);
    if (!c) return window.showNotification("Cliente no encontrado");

    let num = c.phone.replace(/[^\d+]/g, '');
    let finalMsg = '';

    const exp = new Date(c.date);
    exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
    const dateStr = exp.toLocaleDateString('es-ES');

    if (currentWaType === 'renovacion') {
        let baseMsg = currentUserData.waTemplate || "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*.";

        const baseUrl = window.location.origin + window.location.pathname;
        const portalAlias = currentUserData.storeAlias || currentUser.uid;
        const portalUrl = `${baseUrl}?portal=${portalAlias}`;

        finalMsg = baseMsg
            .replace(/{nombre}/g, c.name)
            .replace(/{plataforma}/g, c.platform)
            .replace(/{fecha}/g, dateStr)
            .replace(/{link}/g, portalUrl)
            .replace(/{numero}/g, c.phone)
            .replace(/{codigo}/g, c.portalCode || 'N/A');

    } else if (currentWaType === 'portal') {
        const baseUrl = window.location.origin + window.location.pathname;
        const portalAlias = currentUserData.storeAlias || currentUser.uid;
        const portalUrl = `${baseUrl}?portal=${portalAlias}`;

        finalMsg = `¡Hola, *${c.name}*! 👋\n\nPuedes consultar el estado de tu servicio de *${c.platform}* y tus datos de acceso en tiempo real desde tu portal web personal:\n\n🌐 *Link del Portal:* ${portalUrl}\n📱 *WhatsApp:* ${c.phone}\n🔑 *Código Web:* ${c.portalCode || 'N/A'}\n\n_Guarda este mensaje para ingresar a consultar tus accesos cuando quieras._`;

    } else if (currentWaType === 'datos') {
        const checkboxes = Array.from(document.querySelectorAll('.wa-data-chk:checked'));
        if (checkboxes.length === 0) return window.showNotification("⚠️ Selecciona al menos un dato.");

        let selectionsByPlatform = {};
        checkboxes.forEach(chk => {
            const plat = chk.getAttribute('data-platform');
            if (!selectionsByPlatform[plat]) selectionsByPlatform[plat] = [];
            selectionsByPlatform[plat].push(chk.value);
        });

        let platformsList = c.multiAccounts && Object.keys(c.multiAccounts).length > 0
            ? Object.keys(c.multiAccounts)
            : (c.platform ? c.platform.split(',').map(p => p.trim()) : ['Servicio']);

        finalMsg = `*Tus accesos activos (${c.name}):*\n\n`;

        platformsList.forEach((platName) => {
            if (!selectionsByPlatform[platName] || selectionsByPlatform[platName].length === 0) return;

            const selectedData = selectionsByPlatform[platName];
            let accountData = c.multiAccounts && c.multiAccounts[platName]
                ? c.multiAccounts[platName]
                : {
                    email: c.accountEmail || '-',
                    password: c.accountPassword || '-',
                    profile: c.accountProfile || '-',
                    pin: c.accountPin || '-'
                };

            finalMsg += `🎬 *${platName.toUpperCase()}*\n`;
            if (selectedData.includes('correo')) finalMsg += `📧 *Correo:* ${accountData.email || '-'}\n`;
            if (selectedData.includes('pass')) finalMsg += `🔑 *Clave:* ${accountData.password || '-'}\n`;
            if (selectedData.includes('perfil')) finalMsg += `👤 *N° Perfil:* ${accountData.profile || '-'}\n`;
            if (selectedData.includes('pin')) finalMsg += `📌 *PIN:* ${accountData.pin || '-'}\n`;
            if (selectedData.includes('fecha')) finalMsg += `📅 *Vencimiento:* ${dateStr}\n`;
            if (selectedData.includes('reglas')) {
                const rulesDB = currentUserData.platformRules || {};
                let rulesText = rulesDB[platName] || "Uso personal en el perfil asignado.";
                finalMsg += `⚠️ *Reglas:* ${rulesText}\n`;
            }
            finalMsg += `\n`;
        });
    }

    window.open(`https://wa.me/${num}?text=${encodeURIComponent(finalMsg)}`, '_blank');
    window.closeWaSendModal();
};
/* --- MANEJO DE MENÚS DESPLEGABLES --- */
window.toggleSettingsMenu = (e) => {
    document.getElementById('settingsDropdown').classList.toggle('show');
    e.stopPropagation();
};

window.togglePlatformDropdown = (event) => {
    document.getElementById('checkboxDropdown').classList.toggle('show');
    event.stopPropagation();
};

document.addEventListener('click', (e) => {
    // Cierra el menú de Plataformas si se hace clic fuera
    const chkDrop = document.getElementById('checkboxDropdown');
    if (chkDrop && !chkDrop.contains(e.target) && e.target.id !== 'selectBox') {
        chkDrop.classList.remove('show');
    }

    // Cierra el menú de Configuración si se hace clic fuera
    const setDrop = document.getElementById('settingsDropdown');
    if (setDrop && !setDrop.contains(e.target) && e.target.textContent !== '⚙️') {
        setDrop.classList.remove('show');
    }
});
document.addEventListener('click', (e) => { if (!document.getElementById('checkboxDropdown').contains(e.target) && e.target.id !== 'selectBox') document.getElementById('checkboxDropdown').classList.remove('show'); });
document.querySelectorAll('#checkboxDropdown input').forEach(cb => { cb.addEventListener('change', () => { const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value); const el = document.getElementById('selectText'); if (checked.length) { el.textContent = checked.join(', '); el.classList.add('has-selection'); } else { el.textContent = 'Plataforma(s)...'; el.classList.remove('has-selection'); } }); });

window.toggleStats = (forceUpdate = false) => {
    const p = document.getElementById('statsPanel');
    const a = document.getElementById('analyticsSection');

    if (!forceUpdate) {
        const isVisible = p.style.display === 'grid';
        p.style.display = isVisible ? 'none' : 'grid';
        a.style.display = isVisible ? 'none' : 'flex';
    }

    if (p.style.display === 'grid') {
        let act = 0, w = 0, e = 0, profit = 0, income = 0, cost = 0; const t = new Date(); t.setHours(0, 0, 0, 0);
        clients.forEach(c => {
            const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0, 0, 0, 0);
            const d = Math.ceil((x - t) / 86400000);
            if (d >= 0) { if (d > 3) act++; else w++; const uCount = c.accountUnits || 1; profit += ((c.price || 0) - (c.cost || 0)) * uCount; income += (c.price || 0) * uCount; cost += (c.cost || 0) * uCount; } else e++;
        });
        document.getElementById('statActive').innerText = act; document.getElementById('statWarning').innerText = w; document.getElementById('statExpired').innerText = e;
        document.getElementById('statProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`; document.getElementById('bdIncome').innerText = `${globalCurrency}${income.toFixed(2)}`; document.getElementById('bdCost').innerText = `${globalCurrency}${cost.toFixed(2)}`; document.getElementById('bdProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`;

        // ¡Magia! Renderizamos los gráficos si la librería ya cargó
        if (typeof ApexCharts !== 'undefined') {
            setTimeout(() => {
                window.renderCharts(income, cost, profit);
            }, 100);
        }
    }
};

window.exportToExcel = () => { if (!clients.length) return window.showNotification("No hay datos"); let csv = `data:text/csv;charset=utf-8,Cliente,Plataformas,WhatsApp,Unidades,Costo Total(${globalCurrency}),Precio Total(${globalCurrency}),Vencimiento\n`; clients.forEach(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); const u = c.accountUnits || 1; csv += `"${c.name}","${c.platform}",${c.phone},${u},${(c.cost || 0) * u},${(c.price || 0) * u},${exp.toLocaleDateString('es-ES')}\n`; }); const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", `Clientes_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
window.copyExpiredList = () => { const t = new Date(); t.setHours(0, 0, 0, 0); let exp = []; clients.forEach(c => { const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0, 0, 0, 0); if (x < t) exp.push(`- ${c.name} | ${c.platform} | ${c.phone}`); }); if (!exp.length) return window.showNotification("Sin vencidos"); navigator.clipboard.writeText("🚨 VENCEDORES:\n\n" + exp.join('\n')).then(() => window.showNotification("Lista copiada")); }


/* --- GENERADOR DE RECIBOS EN IMAGEN (VERSIÓN DEFINITIVA IPHONE + PC) --- */
window.downloadTicket = async (clientId, event) => {
    // Capturamos el botón correctamente
    const btn = event.currentTarget || event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Gen...";
    btn.disabled = true;

    try {
        const c = clients.find(x => x.id === clientId);
        if (!c) return window.showNotification("Cliente no encontrado");

        // 1. Llenar los datos de texto del ticket
        document.getElementById('ticketBrand').innerText = currentUserData.name || 'Mi Panel';
        document.getElementById('ticketClient').innerText = c.name;
        document.getElementById('ticketPlatform').innerText = c.platform;

        const exp = new Date(c.date);
        exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
        document.getElementById('ticketDate').innerText = exp.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

        const total = (c.price || 0) * (c.accountUnits || 1);
        document.getElementById('ticketPrice').innerText = `${globalCurrency}${total.toFixed(2)}`;

        // 1.5 Hack Supremo: Engañar a la caché y crear un lienzo virtual (Para el Logo)
        const ticketLogo = document.getElementById('ticketLogo');
        if (ticketLogo) {
            if (currentUserData.logoUrl) {
                await new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = currentUserData.logoUrl + (currentUserData.logoUrl.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();

                    img.onload = () => {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = img.width;
                        tempCanvas.height = img.height;
                        const ctx = tempCanvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        ticketLogo.src = tempCanvas.toDataURL('image/png');
                        ticketLogo.style.display = 'inline-block';
                        resolve();
                    };
                    img.onerror = () => {
                        console.error("Firebase bloqueó la lectura de la imagen.");
                        ticketLogo.style.display = 'none';
                        resolve();
                    };
                });
                await new Promise(r => setTimeout(r, 150));
            } else {
                ticketLogo.style.display = 'none';
            }
        }

        // 2. Tomar la foto
        const ticketEl = document.getElementById('ticketTemplate');
        ticketEl.style.left = '0px';

        // 🔴 CORRECCIÓN: SIN allowTaint PARA EVITAR SECURITY ERROR
        const canvas = await html2canvas(ticketEl, {
            backgroundColor: '#1c1c1e',
            scale: 2,
            useCORS: true
        });

        ticketEl.style.left = '-9999px';

        // 3. COMPARTIR EN IPHONE / DESCARGAR EN PC (Blob API)
        canvas.toBlob(async (blob) => {
            const fileName = `Recibo_${c.name.replace(/\s+/g, '_')}.png`;
            const file = new File([blob], fileName, { type: "image/png" });

            // Función interna para forzar descarga si el navegador bloquea el menú
            const forceDownload = () => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = fileName;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                window.showNotification("✅ Recibo descargado en tu dispositivo");
            };

            // Detectamos si es celular (soporta menú de compartir nativo)
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Recibo de Compra',
                        text: 'Aquí tienes tu recibo.'
                    });
                    window.showNotification("✅ Menú de compartir abierto");
                } catch (err) {
                    console.warn("El menú de compartir fue bloqueado (posible demora por datos móviles). Forzando descarga...", err);
                    // ¡AQUÍ ESTÁ LA MAGIA! Si falla por demora en datos, fuerza la descarga directa.
                    forceDownload();
                }
            } else {
                // Modo PC o Navegadores antiguos (Descarga Directa)
                forceDownload();
            }
        }, 'image/png');

    } catch (e) {
        console.error("Error completo en Recibo:", e);
        window.showNotification("Error al generar el recibo.");
    } finally {
        // Restaurar el botón original
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
/* --- SISTEMA DE NOTICIAS PARA EL CLIENTE (FIREBASE) --- */
window.openNewsModal = async () => {
    // 1. Apagamos el punto rojo y guardamos el "Visto"
    const badge = document.getElementById('newsBadge');
    if (badge) badge.style.display = 'none';
    localStorage.setItem('lastSeenNews', new Date().toISOString());
    document.getElementById('newsModal').style.display = 'flex';
    const sidebar = document.getElementById('newsSidebar');
    const content = document.getElementById('newsContentArea');

    // 1. LIMPIEZA INMEDIATA (Evita que se vea el Wrapped fantasma)
    sidebar.innerHTML = '<div style="padding:20px; text-align:center; color: var(--mac-text-secondary);">⏳ Buscando novedades...</div>';
    content.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center;"><p style="color: var(--mac-text-secondary); text-align: center;">⏳ Cargando información...</p></div>';

    try {
        const qNews = await getDocs(collection(db, "news"));
        let noticias = [];
        qNews.forEach(d => noticias.push({ id: d.id, ...d.data() }));

        // ORDEN INTELIGENTE PARA EL CLIENTE: 1ro Fijados, 2do por fecha
        noticias.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.fechaIso) - new Date(a.fechaIso);
        });

        sidebar.innerHTML = '';
        content.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center;"><p style="color: var(--mac-text-secondary); text-align: center;">👈 Selecciona una noticia de la izquierda para ver los detalles.</p></div>';

        if (noticias.length === 0) {
            sidebar.innerHTML = '<div style="padding:15px; text-align:center; color:var(--mac-text-secondary);">No hay noticias nuevas por ahora.</div>';
            return;
        }

        noticias.forEach((noticia) => {
            const dateStr = new Date(noticia.fechaIso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

            // Etiqueta visual de anclado
            const pinnedLabel = noticia.isPinned ? `<span style="background:var(--mac-orange); color:white; font-size:9px; padding:2px 6px; border-radius:10px; margin-right:5px; font-weight: bold;">FIJADO <i class='bx bxs-pin'></i></span>` : '';

            const div = document.createElement('div');
            div.className = 'news-item-title';
            div.innerHTML = `<strong>${noticia.titulo}</strong><br><span style="font-size:11px; font-weight:normal; opacity: 0.8; display:flex; align-items:center; margin-top: 4px;">${pinnedLabel}${dateStr}</span>`;
            div.onclick = () => window.viewNewsDetail({ ...noticia, fecha: dateStr }, div);
            sidebar.appendChild(div);
        });
    } catch (e) {
        sidebar.innerHTML = '<div style="padding:10px; color:var(--mac-red);">Error al cargar las noticias.</div>';
        content.innerHTML = '';
        console.error(e);
    }
};

window.viewNewsDetail = (noticia, element) => {
    document.querySelectorAll('.news-item-title').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const content = document.getElementById('newsContentArea');
    let imgHtml = noticia.img ? `<img src="${noticia.img}" class="news-content-img" alt="Noticia">` : '';
    content.innerHTML = `
        ${imgHtml}
        <h2 style="margin-top: 0; margin-bottom: 10px; font-size: 20px;">${noticia.titulo}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: var(--mac-text-main); margin-bottom: 20px; white-space: pre-wrap;">${noticia.desc}</p>
    `;
};

/* =========================================================
   A.G.C. WRAPPED - ALGORITMO DE MÉTRICAS PREMIUM SIN LOGO
========================================================= */
// 1. Guardar la meta mensual en Firebase
// 1. Guardar la meta mensual en Firebase
window.setFinancialGoal = async () => {
    const { value: goal } = await Swal.fire({
        title: '🎯 Define tu Meta',
        input: 'number',
        inputLabel: '¿Cuánto de GANANCIA NETA quieres lograr este mes?',
        inputPlaceholder: 'Ej: 1500',
        inputValue: currentUserData.financialGoal || '',
        showCancelButton: true,
        confirmButtonColor: 'var(--mac-blue)',
        confirmButtonText: 'Guardar Meta',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    if (goal) {
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { financialGoal: parseFloat(goal) });
            currentUserData.financialGoal = parseFloat(goal);
            window.showNotification("✅ Proyección financiera actualizada");
            window.loadFinanceData();
        } catch (e) { window.showNotification("Error: " + e.message); }
    }
};

// 2. Procesar todos los datos y dar consejos inteligentes
// --- NUEVO SISTEMA DE FILTROS FINANCIEROS (CON UI PERSONALIZADA) ---
window.currentDashboardFilter = 'proyeccion';

// 1. Abrir/Cerrar el menú
window.toggleTimeFilter = () => {
    document.getElementById('customTimeFilter').classList.toggle('open');
};

// 2. Al hacer clic en una opción
window.selectTimeFilter = (value, text, iconClass, event) => {
    event.stopPropagation(); // Evita que el clic lo cierre e inmediatamente lo abra

    // Cambiar el texto y el ícono principal
    document.getElementById('timeFilterText').innerText = text;
    document.querySelector('.time-filter-selected i:first-child').className = `bx ${iconClass}`;

    // Iluminar la opción seleccionada
    document.querySelectorAll('.time-option').forEach(opt => opt.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Cerrar el menú
    document.getElementById('customTimeFilter').classList.remove('open');

    // Ejecutar tu lógica de gráficos existente
    window.changeDashboardFilter(value);
};

// 3. Cerrar el menú si hacen clic en cualquier otra parte de la pantalla
document.addEventListener('click', (e) => {
    const filter = document.getElementById('customTimeFilter');
    if (filter && !filter.contains(e.target)) {
        filter.classList.remove('open');
    }
});

window.changeDashboardFilter = (val) => {
    window.currentDashboardFilter = val;
    window.loadFinanceData();
};

window.loadFinanceData = () => {
    let act = 0, profit = 0, income = 0, cost = 0;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    let validAccountsCount = 0;
    const filter = window.currentDashboardFilter;

    // Fechas límite para filtros históricos
    const semanaInicio = new Date(t); semanaInicio.setDate(semanaInicio.getDate() - 6);
    const mesInicio = new Date(t.getFullYear(), t.getMonth(), 1);
    const anioInicio = new Date(t.getFullYear(), 0, 1);

    clients.forEach(c => {
        const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);

        // Magia: Extraer fecha de pago aproximada restando los meses contratados
        const mesesContratados = c.accountMonths || 1;
        const fechaPago = new Date(exp);
        fechaPago.setMonth(fechaPago.getMonth() - mesesContratados);

        const d = Math.ceil((exp - t) / 86400000); // Días para vencer
        let entraEnFiltro = false;

        // Evaluador de filtros
        if (filter === 'proyeccion') { if (d >= 0 && d <= 14) entraEnFiltro = true; }
        else if (filter === 'hoy') { if (fechaPago.getTime() === t.getTime()) entraEnFiltro = true; }
        else if (filter === 'semana') { if (fechaPago >= semanaInicio && fechaPago <= t) entraEnFiltro = true; }
        else if (filter === 'mes') { if (fechaPago >= mesInicio && fechaPago <= t) entraEnFiltro = true; }
        else if (filter === 'anio') { if (fechaPago >= anioInicio && fechaPago <= t) entraEnFiltro = true; }

        // Sumar a tarjetas principales SOLO si pasa el filtro
        if (entraEnFiltro) {
            const uCount = c.accountUnits || 1;
            profit += ((c.price || 0) - (c.cost || 0)) * uCount;
            income += (c.price || 0) * uCount;
            cost += (c.cost || 0) * uCount;
            validAccountsCount += uCount;
        }

        // Las cuentas activas siempre se muestran en global para no asustar al usuario
        if (d >= 0) act++;
    });

    if (document.getElementById('bdIncomeFin')) document.getElementById('bdIncomeFin').innerText = `${globalCurrency}${income.toFixed(2)}`;
    if (document.getElementById('bdCostFin')) document.getElementById('bdCostFin').innerText = `${globalCurrency}${cost.toFixed(2)}`;
    if (document.getElementById('bdProfitFin')) document.getElementById('bdProfitFin').innerText = `${globalCurrency}${profit.toFixed(2)}`;
    if (document.getElementById('chartHeaderCuentas')) document.getElementById('chartHeaderCuentas').innerText = act;
    if (document.getElementById('chartHeaderCuentasFin')) document.getElementById('chartHeaderCuentasFin').innerText = act;

    // --- LÓGICA DE METAS Y ASESOR FINANCIERO (Se mantiene igual) ---
    const goal = currentUserData.financialGoal || 0;
    const displayGoal = document.getElementById('displayFinancialGoal');
    const progressBar = document.getElementById('goalProgressBar');
    const progressText = document.getElementById('goalProgressText');
    const advisorBox = document.getElementById('financeAdvisorBox');

    if (displayGoal) displayGoal.innerText = `${globalCurrency}${goal.toFixed(2)}`;

    if (goal > 0) {
        let pct = (profit / goal) * 100;
        if (pct < 0) pct = 0;

        if (progressBar) progressBar.style.width = `${Math.min(pct, 100)}%`;
        if (progressText) progressText.innerText = `${pct.toFixed(1)}%`;

        if (profit >= goal) {
            if (advisorBox) { advisorBox.innerHTML = `<strong>¡Felicidades! 🏆</strong> Has superado tu meta mensual de ganancia. Estás obteniendo una rentabilidad del <strong>${((profit / cost) * 100).toFixed(0)}%</strong> sobre tu inversión total.`; advisorBox.style.borderLeftColor = 'var(--mac-green)'; }
        } else {
            const faltante = goal - profit;
            const avgCost = validAccountsCount > 0 ? (cost / validAccountsCount) : 0;
            const avgProfitPerAccount = validAccountsCount > 0 ? (profit / validAccountsCount) : 0;

            let adviceHTML = `Te faltan <strong>${globalCurrency}${faltante.toFixed(2)}</strong> de ganancia para lograr tu meta mensual.<br><br>`;
            if (avgProfitPerAccount > 0) {
                const accountsNeeded = Math.ceil(faltante / avgProfitPerAccount);
                const suggestedPriceFor10 = avgCost + (faltante / 10);
                adviceHTML += `💡 <strong>¿Cómo lograrlo?</strong><br>• Puedes vender <strong>${accountsNeeded} cuentas más</strong> manteniendo tu precio actual.<br>• ⚡ <strong>Vía rápida:</strong> Si prefieres llegar a la meta vendiendo <strong>solo 10 cuentas nuevas</strong>, deberías venderlas a <strong>${globalCurrency}${suggestedPriceFor10.toFixed(2)}</strong> cada una.`;
            } else if (validAccountsCount > 0) { adviceHTML += `⚠️ Actualmente estás vendiendo a un precio menor o igual a tu inversión.`; }
            else { adviceHTML += `💡 Registra tus primeras ventas (con Costo y Precio) para que la IA calcule las estrategias necesarias.`; }

            if (advisorBox) { advisorBox.innerHTML = adviceHTML; advisorBox.style.borderLeftColor = 'var(--mac-orange)'; }
        }
    } else {
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.innerText = '0%';
        if (advisorBox) { advisorBox.innerHTML = `💡 Aún no has definido una meta. Haz clic en <strong>Fijar Meta</strong> para proyectar tus ganancias.`; advisorBox.style.borderLeftColor = 'var(--mac-blue)'; }
    }

    // --- NUEVO: CÁLCULOS DE RETENCIÓN, CRECIMIENTO Y RENTABILIDAD ---
    let totalActivos = 0;
    let clientesRenovados = 0;
    let ingresosMesActual = 0;
    let ingresosMesAnterior = 0;
    let margenesPlataforma = {};

    const currentMonth = t.getMonth();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? t.getFullYear() - 1 : t.getFullYear();

    clients.forEach(c => {
        // Tasa de Retención
        if (c.statusCat !== 'expired') {
            totalActivos++;
            if (c.renovations > 0) clientesRenovados++;
        }

        const exp = new Date(c.date);
        exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
        const fechaPago = new Date(exp);
        fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));

        const pIncome = (c.price || 0) * (c.accountUnits || 1);
        const pCost = (c.cost || 0) * (c.accountUnits || 1);

        // Crecimiento Mensual
        if (fechaPago.getMonth() === currentMonth && fechaPago.getFullYear() === t.getFullYear()) {
            ingresosMesActual += pIncome;
        } else if (fechaPago.getMonth() === lastMonth && fechaPago.getFullYear() === lastMonthYear) {
            ingresosMesAnterior += pIncome;
        }

        // Top Margen Rentabilidad
        let platKey = c.platform || 'Otros';
        if (!margenesPlataforma[platKey]) margenesPlataforma[platKey] = { income: 0, cost: 0, profit: 0 };
        margenesPlataforma[platKey].income += pIncome;
        margenesPlataforma[platKey].profit += (pIncome - pCost);
    });

    // Pintar Retención
    const tasaRetencion = totalActivos > 0 ? (clientesRenovados / totalActivos) * 100 : 0;
    if (document.getElementById('retentionRateText')) document.getElementById('retentionRateText').innerText = `${tasaRetencion.toFixed(1)}%`;
    if (document.getElementById('retentionBar')) document.getElementById('retentionBar').style.width = `${tasaRetencion}%`;
    if (document.getElementById('retentionDetailsText')) document.getElementById('retentionDetailsText').innerText = `${clientesRenovados} de ${totalActivos} clientes activos renovaron este mes.`;

    // Pintar Crecimiento
    let tasaCrecimiento = 0;
    if (ingresosMesAnterior > 0) {
        tasaCrecimiento = ((ingresosMesActual - ingresosMesAnterior) / ingresosMesAnterior) * 100;
    } else if (ingresosMesActual > 0) {
        tasaCrecimiento = 100;
    }
    if (document.getElementById('growthRateText')) document.getElementById('growthRateText').innerText = `${tasaCrecimiento >= 0 ? '+' : ''}${tasaCrecimiento.toFixed(1)}%`;
    if (document.getElementById('growthDetailsText')) document.getElementById('growthDetailsText').innerText = `Mes actual: ${globalCurrency}${ingresosMesActual.toFixed(2)} | Mes anterior: ${globalCurrency}${ingresosMesAnterior.toFixed(2)}`;

    // Pintar Top Rentabilidad (Margen)
    let marginArray = Object.keys(margenesPlataforma).map(key => {
        let m = margenesPlataforma[key];
        let marginPct = m.income > 0 ? (m.profit / m.income) * 100 : 0;
        return { platform: key, margin: marginPct, profit: m.profit };
    }).sort((a, b) => b.margin - a.margin).slice(0, 5);

    const topMarginList = document.getElementById('topMarginStatsList');
    if (topMarginList) {
        topMarginList.innerHTML = marginArray.length === 0 ? '<p style="font-size:12px; color:var(--mac-text-secondary);">No hay datos suficientes.</p>' : '';
        marginArray.forEach(item => {
            topMarginList.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    <strong style="color:var(--mac-text-main); font-size:13px;">${item.platform}</strong>
                    <div style="text-align:right;">
                        <span style="color:var(--mac-green); font-weight:bold; font-size:14px;">${item.margin.toFixed(1)}%</span><br>
                        <span style="color:var(--mac-text-secondary); font-size:11px;">Neta: ${globalCurrency}${item.profit.toFixed(2)}</span>
                    </div>
                </div>
            `;
        });
    }

    // Pintar Ingresos por Método de Pago
    const pmContainer = document.getElementById('paymentMethodsStatsList');
    if (pmContainer && currentUserData.paymentMethods && currentUserData.paymentMethods.length > 0) {
        pmContainer.innerHTML = '';
        const methods = currentUserData.paymentMethods;
        const avg = income / methods.length; // Estimado estadístico visual
        methods.forEach(m => {
            const pct = income > 0 ? ((avg / income) * 100).toFixed(1) : 0;
            pmContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    <strong style="color:var(--mac-text-main); font-size:13px;">🏦 ${m.bank}</strong>
                    <div style="text-align:right;">
                        <span style="color:#bf5af2; font-weight:bold; font-size:14px;">${globalCurrency}${avg.toFixed(2)}</span><br>
                        <span style="color:var(--mac-text-secondary); font-size:11px;">${pct}% del ingreso total</span>
                    </div>
                </div>
            `;
        });
    } else if (pmContainer) {
        pmContainer.innerHTML = '<p style="color: #888; font-size: 13px;">Aún no tienes métodos de pago agregados.</p>';
    }
    // --- FIN NUEVOS CÁLCULOS ---

    // Dibujar Gráficos enviando el filtro
    setTimeout(() => {
        if (typeof ApexCharts !== 'undefined') window.renderCharts(income, cost, profit, filter);
    }, 100);
};

window.downloadWrapup = async (acc, platform, day, clientName, clientUnits, frase, mes, event) => {
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Creando Estado HD...";
    btn.disabled = true;

    try {
        document.getElementById('wrapupBrand').innerText = currentUserData.name || 'Mi Panel';
        document.getElementById('wrapupMonth').innerText = mes;
        document.getElementById('wrapupPhrase').innerText = `"${frase}"`;
        document.getElementById('wrapupAccounts').innerText = acc;
        document.getElementById('wrapupTopPlatform').innerText = platform;
        document.getElementById('wrapupTopDay').innerText = day;
        document.getElementById('wrapupTopClient').innerText = clientName;
        document.getElementById('wrapupClientAccounts').innerText = `${clientUnits} cuentas registradas en el mes`;

        setTimeout(async () => {
            const wrapupEl = document.getElementById('wrapupTemplate');
            wrapupEl.style.left = '0px';
            wrapupEl.style.top = '0px';

            const canvas = await html2canvas(wrapupEl, {
                backgroundColor: '#000000',
                scale: 2
            });

            wrapupEl.style.left = '-9999px';
            wrapupEl.style.top = '-9999px';

            const link = document.createElement('a');
            link.download = `AGC_Wrapped_${mes.replace(/\s+/g, '_')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            window.showNotification("¡Tu tarjeta Wrapped se descargó con éxito! 🏆");
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 150);

    } catch (e) {
        console.error(e);
        window.showNotification("Error al compilar la imagen.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.openMobileClientModal = (id) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;

    // 1. Llenar textos principales
    const mcName = document.getElementById('mcName');
    if (mcName) mcName.innerText = c.name;

    const mcPhone = document.getElementById('mcPhone');
    if (mcPhone) mcPhone.innerText = c.phone;

    const uCount = c.accountUnits || 1;
    const total = (c.price || 0) * uCount;
    const mcPrice = document.getElementById('mcPrice');
    if (mcPrice) mcPrice.innerText = `${globalCurrency}${total.toFixed(2)}`;

    const exp = new Date(c.date);
    exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
    exp.setHours(0, 0, 0, 0);

    const mcDate = document.getElementById('mcDate');
    if (mcDate) mcDate.innerText = exp.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    // 🛡️ CORRECCIÓN 1: Validar que el HTML de Novedades exista antes de modificarlo
    const badgesContainer = document.getElementById('mcBadges');
    if (badgesContainer) {
        badgesContainer.innerHTML = '';
        if (c.tag) badgesContainer.innerHTML += `<span style="background: ${c.tagColor}15; color: ${c.tagColor}; font-size: 11px; padding: 4px 8px; border-radius: 6px; border: 1px solid ${c.tagColor}50; font-weight:bold;">${c.tag}</span>`;
        if (c.renovations > 0) badgesContainer.innerHTML += `<span style="font-size: 11px; color: #5c4000; background: linear-gradient(110deg, #FFD700 0%, #FFF8DC 50%, #FFD700 100%); padding: 4px 8px; border-radius: 6px; font-weight: bold; border: 1px solid #FFD700;"><i class='bx bxs-star'></i> Cliente Fiel (${c.renovations})</span>`;
    }

    const notesContainer = document.getElementById('mcNotesContainer');
    if (notesContainer) {
        if (c.notes) {
            const mcNotes = document.getElementById('mcNotes');
            if (mcNotes) mcNotes.innerText = c.notes;
            notesContainer.style.display = 'block';
        } else {
            notesContainer.style.display = 'none';
        }
    }

    // 2. Calcular estado
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((exp - today) / 86400000);
    const statusCat = diffDays > 3 ? 'active' : (diffDays >= 0 ? 'warning' : 'expired');
    const stText = diffDays > 0 ? `Faltan ${diffDays} d` : (diffDays === 0 ? 'Hoy' : 'Vencido');

    const statusBadge = document.getElementById('mcStatus');
    if (statusBadge) {
        statusBadge.className = `status ${statusCat}`;
        statusBadge.innerText = stText;
    }

    // 🛡️ CORRECCIÓN 2: Limpiar nombres con comillas (Ej: McDonald's) para que no rompan el botón HTML
    const safeName = c.name ? c.name.replace(/'/g, "\\'") : '';
    const safePlatform = c.platform ? c.platform.replace(/'/g, "\\'") : '';

    // 3. Inyectar Botones Grandes
    const renewBtn = statusCat !== 'active' ? `<button class="action-btn btn-renew" style="padding:12px; font-size:14px;" onclick="window.closeModals(); window.renewClient('${c.id}')"><i class='bx bx-refresh'></i> Renovar</button>` : '';

    const mcActions = document.getElementById('mcActions');
    if (mcActions) {
        mcActions.innerHTML = `
            <button class="action-btn btn-wa" style="padding:12px; font-size:14px;" onclick="window.closeModals(); window.openWaSendModal('${c.id}')"><i class='bx bxl-whatsapp'></i> WhatsApp</button>
            <button class="action-btn" style="padding:12px; font-size:14px; background: rgba(94, 92, 230, 0.15); color: var(--mac-blue); font-weight: bold;" onclick="window.closeModals(); window.sendClientPortalWa('${c.phone}', '${c.id}')"><i class='bx bx-globe'></i> Link Portal</button>
            <button class="action-btn" style="padding:12px; font-size:14px; background: rgba(175, 82, 222, 0.15); color: #AF52DE; font-weight: bold;" onclick="window.downloadTicket('${c.id}', event)"><i class='bx bx-receipt'></i> Recibo</button>
            <button class="action-btn" style="padding:12px; font-size:14px; background: rgba(0, 122, 255, 0.15); color: #007AFF; font-weight: bold;" onclick="window.closeModals(); window.openLinkModal('${c.id}', '${safePlatform}')"><i class='bx bx-link'></i> Vincular</button>
            <button class="action-btn" style="padding:12px; font-size:14px; color: var(--mac-text-main);" onclick="window.closeModals(); window.startEdit('${c.id}')"><i class='bx bx-edit-alt'></i> Editar</button>
            <button class="action-btn btn-del" style="padding:12px; font-size:14px;" onclick="window.closeModals(); window.deleteClient('${c.id}')"><i class='bx bx-trash'></i> Borrar</button>
            ${renewBtn}
        `;
    }

    // 4. Mostrar el modal
    const mobileModal = document.getElementById('mobileClientModal');
    if (mobileModal) {
        mobileModal.style.display = 'flex';
    } else {
        console.warn("No se encontró el contenedor con ID 'mobileClientModal' en el HTML.");
    }
};

/* --- SISTEMA DE NOTIFICACIONES PUSH (FCM) --- */
window.requestNotificationPermission = async () => {
    try {
        console.log("Solicitando permiso de notificaciones...");
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            console.log("Permiso concedido. Obteniendo token...");
            const currentToken = await getToken(messaging, { vapidKey: 'BKBlbQcgMzLg-oCuFXjhn_2ekkAcrsGRS49RP3mKBvJDB-fPLzovUeYnNfmFi96ib5RtjJzta5nMlm7VsmSJC7k' });

            if (currentToken) {
                // MODIFICACIÓN: En lugar de fcmToken (texto), usamos fcmTokens (Lista/Array)
                // arrayUnion asegura que si el token ya existe, no lo duplique.
                await updateDoc(doc(db, "users", currentUser.uid), {
                    fcmTokens: arrayUnion(currentToken)
                });
                console.log("Token de notificaciones agregado a la lista con éxito.");
            } else {
                console.log("No se pudo generar el token de registro.");
            }
        } else {
            console.log("El usuario bloqueó las notificaciones.");
        }
    } catch (error) {
        console.error("Error al solicitar permiso de notificaciones:", error);
    }
};

/* --- SISTEMA DE INSTALACIÓN DE LA APP (PWA) --- */
let deferredPrompt;

// Escucha el evento del navegador que dice "Listo para instalar"
window.addEventListener('beforeinstallprompt', (e) => {
    // Evita que el navegador muestre su propia alerta predeterminada
    e.preventDefault();
    // Guarda el evento para usarlo luego
    deferredPrompt = e;
    // Muestra nuestro botón de instalación
    const installBtn = document.getElementById('btnInstallApp');
    if (installBtn) installBtn.style.display = 'block';
});

// Función que se ejecuta al darle clic al botón
window.installApp = async () => {
    if (deferredPrompt) {
        // Lanza la ventana oficial de instalación
        deferredPrompt.prompt();
        // Espera a ver qué decide el usuario
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('App A.G.C. instalada con éxito');
        }
        // Limpia la variable y oculta el botón porque ya se instaló
        deferredPrompt = null;
        document.getElementById('btnInstallApp').style.display = 'none';
    }
};

// Si la app ya se instaló con éxito, nos aseguramos de ocultar el botón
window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('btnInstallApp');
    if (installBtn) installBtn.style.display = 'none';
    window.showNotification("¡App instalada correctamente! 📱");
});

/* --- CONEXIÓN CON EL BACKEND DE WHATSAPP (CON MURO DE PAGO) --- */
window.vincularBot = async () => {
    // 🔒 Verificamos si es un usuario Demo
    const plan = currentUserData.plan_actual || 'demo';
    if (plan === 'demo' || plan === 'basico') { // Ahora bloqueamos a demo y básico

        window.closeModals();

        Swal.fire({
            icon: 'lock',
            title: 'Función Premium',
            text: 'Conectar tu propio número de WhatsApp para enviar recordatorios es exclusivo del Plan PRO.',
            confirmButtonText: '💎 Ver Planes',
            confirmButtonColor: '#007AFF',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        }).then((result) => {
            if (result.isConfirmed) {
                window.mostrarPlanesSuscripcion(); // <-- Aquí llamamos al catálogo
            }
        });
        return;
    }

    const qrContainer = document.getElementById('qrContainer');
    const botStatus = document.getElementById('botStatus');
    const botQrImage = document.getElementById('botQrImage');

    qrContainer.style.display = 'block';
    botQrImage.style.display = 'none';
    botStatus.innerText = "⏳ Conectando con el servidor...";

    try {
        // Reemplaza los números por la IP real de tu servidor en DigitalOcean
        const response = await fetch(`https://bot.panelagc.com/api/conectar/${currentUser.uid}`);
        const data = await response.json();

        if (data.status === 'qr') {
            botQrImage.src = data.qr;
            botQrImage.style.display = 'inline-block';
            botStatus.innerText = "📱 Escanea este código con tu WhatsApp para activar el bot.";
            botStatus.style.color = "var(--mac-text-main)";
        }
        else if (data.status === 'conectado') {
            botQrImage.style.display = 'none';
            botStatus.innerText = "✅ " + data.message;
            botStatus.style.color = "var(--mac-green)";
        }
    } catch (e) {
        botQrImage.style.display = 'none';
        botStatus.innerText = "❌ Error: El servidor central de A.G.C. está apagado.";
        botStatus.style.color = "var(--mac-red)";
        console.error(e);
    }
};

/* --- MOSTRAR CATÁLOGO DE PLANES A LOS DISTRIBUIDORES --- */
window.mostrarPlanesSuscripcion = () => {
    Swal.fire({
        title: '💎 Mejora tu Panel',
        html: `
            <div style="text-align: left; margin-top: 15px;">
                <div style="background: rgba(52, 199, 89, 0.1); border: 1px solid var(--mac-green); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <h4 style="margin: 0 0 5px 0; color: var(--mac-green); display: flex; justify-content: space-between;"><span>Plan Básico</span> <span>S/ 15.00</span></h4>
                    <p style="margin: 0; font-size: 13px; color: var(--mac-text-main);">Gestión de hasta 100 clientes + Recordatorios desde el bot central.</p>
                </div>
                <div style="background: rgba(255, 215, 0, 0.1); border: 1px solid #FFD700; padding: 15px; border-radius: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #FFD700; display: flex; justify-content: space-between;"><span>Plan PRO</span> <span>S/ 30.00</span></h4>
                    <p style="margin: 0; font-size: 13px; color: var(--mac-text-main);">Clientes ilimitados + <strong>Tu propio número de WhatsApp</strong> enviando los mensajes automáticos.</p>
                </div>
            </div>
            <p style="font-size: 13px; margin-top: 20px; color: var(--mac-text-secondary);">Para activar tu plan, contáctanos con tu comprobante de Yape/Plin.</p>
        `,
        confirmButtonText: '<i class="bx bxl-whatsapp"></i> Contactar Administrador',
        confirmButtonColor: '#25D366',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    }).then((result) => {
        if (result.isConfirmed) {
            // Reemplaza los 9 con tu número de WhatsApp real
            window.open('https://wa.me/51961341323?text=Hola,%20quiero%20mejorar%20mi%20plan%20en%20el%20Panel%20A.G.C.', '_blank');
        }
    });
};

/* --- SISTEMA DE ALERTA DE NUEVAS NOTICIAS --- */
window.checkNewNews = async () => {
    try {
        // Traemos solo la noticia más reciente para no gastar lecturas en Firebase
        const qNews = query(collection(db, "news"), limit(1));
        const snap = await getDocs(qNews);

        if (!snap.empty) {
            let noticias = [];
            snap.forEach(d => noticias.push(d.data()));
            // Ordenamos para asegurar que tenemos la más nueva
            noticias.sort((a, b) => new Date(b.fechaIso) - new Date(a.fechaIso));

            const latestNewsDate = noticias[0].fechaIso;
            const lastSeen = localStorage.getItem('lastSeenNews');

            // Si nunca ha visto las noticias, o si la noticia más nueva es más reciente que su última visita
            if (!lastSeen || new Date(latestNewsDate) > new Date(lastSeen)) {
                const badge = document.getElementById('newsBadge');
                if (badge) badge.style.display = 'block';
            }
        }
    } catch (e) {
        console.error("Error revisando noticias:", e);
    }
};

/* ==========================================
   MÓDULO: MI TIENDITA (EXCLUSIVO PLAN PRO)
========================================== */

window.openStoreModal = () => {
    const plan = currentUserData.plan_actual || 'demo';

    if (plan !== 'basico' && plan !== 'pro' && plan !== 'elite') {
        window.closeModals(true);
        Swal.fire({
            icon: 'lock', title: 'Función de Suscripción', text: 'Tener tu propio Catálogo Web para vender en automático requiere el Plan Básico o PRO.',
            confirmButtonText: '💎 Ver Planes', confirmButtonColor: '#007AFF', showCancelButton: true, cancelButtonText: 'Cancelar',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff', color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        }).then((result) => { if (result.isConfirmed) window.mostrarPlanesSuscripcion(); });
        return;
    }

    window.closeModals(false);
    const aliasOrUid = currentUserData.storeAlias || currentUser.uid;
    const linkInput = document.getElementById('storeLinkInput');
    if (linkInput) {
        linkInput.value = window.location.origin + window.location.pathname + "?tienda=" + aliasOrUid;
    }

    // 🔥 ACTUALIZAR EL SWITCH DE ESTADO
    const storeToggle = document.getElementById('storeActiveToggle');
    if (storeToggle) storeToggle.checked = currentUserData.storeActive !== false; // true por defecto

    // 🔥 Renderizamos los productos y categorías directamente
    window.renderStoreItems();
    window.syncStoreCategories();

    // 🪄 MAGIA EXTRA: Resetea el modal a la primera pestaña (Catálogo) siempre que se abra
    const tabBtn = document.querySelector('#storeModal .chrome-tab');
    if (tabBtn) {
        window.switchStoreAdminTab('tabCatalogo', tabBtn);
    }
    // --- NUEVO: MOSTRAR ESTADÍSTICAS AL DUEÑO ---
    const ownerStatsContainer = document.getElementById('ownerStoreStats');
    if (ownerStatsContainer) {
        const vistas = currentUserData.storeViews || 0;
        const ventas = currentUserData.storeSalesCount || 0;
        const ingresos = currentUserData.storeRevenue || 0;

        ownerStatsContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px;">
                <div style="background: var(--mac-surface); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border); text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <i class='bx bx-show' style="font-size: 24px; color: var(--mac-blue); margin-bottom: 5px;"></i>
                    <h4 style="margin: 0 0 5px 0; color: var(--mac-text-main); font-size: 20px;">${vistas}</h4>
                    <span style="font-size: 10px; color: var(--mac-text-secondary); text-transform: uppercase; font-weight: bold;">Visitas Únicas</span>
                </div>
                <div style="background: var(--mac-surface); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border); text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <i class='bx bx-shopping-bag' style="font-size: 24px; color: var(--mac-green); margin-bottom: 5px;"></i>
                    <h4 style="margin: 0 0 5px 0; color: var(--mac-text-main); font-size: 20px;">${ventas}</h4>
                    <span style="font-size: 10px; color: var(--mac-text-secondary); text-transform: uppercase; font-weight: bold;">Ventas Tiendita</span>
                </div>
                <div style="background: var(--mac-surface); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border); text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <i class='bx bx-money' style="font-size: 24px; color: var(--mac-orange); margin-bottom: 5px;"></i>
                    <h4 style="margin: 0 0 5px 0; color: var(--mac-text-main); font-size: 20px;">${globalCurrency}${ingresos.toFixed(2)}</h4>
                    <span style="font-size: 10px; color: var(--mac-text-secondary); text-transform: uppercase; font-weight: bold;">Ingresos Tiendita</span>
                </div>
            </div>
        `;
    }
    document.getElementById('storeModal').style.display = 'flex';
};

// 🔥 NUEVA FUNCIÓN: Apagar o Prender la tienda
window.toggleStoreActive = async (checkbox) => {
    try {
        const isActive = checkbox.checked;
        await updateDoc(doc(db, "users", currentUser.uid), { storeActive: isActive });
        currentUserData.storeActive = isActive;
        window.showNotification(isActive ? "Tienda Abierta 🟢" : "Tienda Cerrada 🔴");
    } catch (e) {
        window.showNotification("Error guardando el estado: " + e.message);
        checkbox.checked = !checkbox.checked; // Revierte si hay error
    }
};

window.saveExternalStore = async () => {
    const url = document.getElementById('storeExternalInput').value.trim();
    if (!url) return window.showNotification("Por favor, ingresa un link válido.");
    if (!url.startsWith('http')) return window.showNotification("⚠️ El link debe empezar con http:// o https://");
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { externalStoreUrl: url });
        currentUserData.externalStoreUrl = url;
        document.getElementById('storeExternalInput').value = '';
        window.showNotification("¡Catálogo externo vinculado con éxito! 🔗");
        window.openStoreModal();
    } catch (e) { window.showNotification("Error: " + e.message); }
};

window.removeExternalStore = async () => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { externalStoreUrl: null });
        currentUserData.externalStoreUrl = null;
        window.showNotification("Catálogo desvinculado. Tiendita interna reactivada 🏪");
        window.openStoreModal();
    } catch (e) { window.showNotification("Error: " + e.message); }
};

window.handleStoreTypeChange = () => {
    const isAutoStock = document.getElementById('storeAutoStock').checked;
    if (isAutoStock) window.toggleStoreStockFields();
};

window.toggleStoreStockFields = () => {
    const isChecked = document.getElementById('storeAutoStock').checked;
    const configDiv = document.getElementById('storeStockConfig');
    const type = document.getElementById('storeType') ? document.getElementById('storeType').value : 'Servicio';
    const addComboBtn = document.getElementById('btnAddComboPlatformBtn');
    const label = document.getElementById('storeStockLabel');

    if (isChecked) {
        configDiv.style.display = 'flex';
        const listContainer = document.getElementById('storeStockPlatformsList');
        listContainer.innerHTML = '';
        if (type === 'Combo') {
            label.innerText = 'Selecciona las plataformas del inventario que integran este Combo:';
            if (addComboBtn) addComboBtn.style.display = 'inline-flex';
            window.addStoreStockSelectRow();
            window.addStoreStockSelectRow();
        } else {
            label.innerText = 'Selecciona la plataforma del inventario vinculada a este servicio:';
            if (addComboBtn) addComboBtn.style.display = 'none';
            window.addStoreStockSelectRow();
        }
    } else {
        configDiv.style.display = 'none';
        document.getElementById('storeStockPlatformsList').innerHTML = '';
        window.updateStoreStockCount();
    }
};

window.addStoreStockSelectRow = () => {
    const listContainer = document.getElementById('storeStockPlatformsList');
    const stock = currentUserData.inventory || [];
    const platformsEnStock = [...new Set(stock.filter(i => i.status === 'libre').map(i => i.platform))];

    const rowDiv = document.createElement('div');
    rowDiv.className = 'store-stock-row';
    rowDiv.style.cssText = 'display: flex; gap: 8px; align-items: center;';

    let selectHTML = `<select class="store-stock-select" onchange="window.updateStoreStockCount()" style="flex: 1; padding: 6px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); font-size: 12px;">`;
    selectHTML += `<option value="">Selecciona plataforma...</option>`;
    platformsEnStock.forEach(p => {
        const countLibres = stock.filter(i => i.status === 'libre' && i.platform === p).length;
        selectHTML += `<option value="${p}">${p} (${countLibres} en stock)</option>`;
    });
    selectHTML += `</select>`;

    const removeBtnHTML = listContainer.children.length > 0 ?
        `<button type="button" class="action-btn btn-del" style="padding: 4px 8px; font-size: 11px;" onclick="this.parentElement.remove(); window.updateStoreStockCount();"><i class='bx bx-trash'></i></button>` : '';

    rowDiv.innerHTML = selectHTML + removeBtnHTML;
    listContainer.appendChild(rowDiv);
    window.updateStoreStockCount();
};

window.updateStoreStockCount = () => {
    const countText = document.getElementById('storeStockCountText');
    const selects = document.querySelectorAll('.store-stock-select');
    const selectedPlatforms = Array.from(selects).map(s => s.value).filter(val => val !== '');

    if (selectedPlatforms.length === 0) {
        countText.innerText = '0 disp.'; countText.style.color = 'var(--mac-text-secondary)'; return;
    }

    const stock = currentUserData.inventory || [];
    const type = document.getElementById('storeType') ? document.getElementById('storeType').value : 'Servicio';

    if (type === 'Combo') {
        const counts = selectedPlatforms.map(plat => stock.filter(i => i.status === 'libre' && i.platform === plat).length);
        const minStock = Math.min(...counts);
        countText.innerText = `${minStock} Combos disp.`; countText.style.color = minStock > 0 ? 'var(--mac-green)' : 'var(--mac-red)';
    } else {
        const count = stock.filter(i => i.status === 'libre' && i.platform === selectedPlatforms[0]).length;
        countText.innerText = `${count} disp.`; countText.style.color = count > 0 ? 'var(--mac-green)' : 'var(--mac-red)';
    }
};
/* --- GESTIÓN DE CATEGORÍAS DE LA TIENDA --- */
window.syncStoreCategories = () => {
    let cats = currentUserData.storeCategories || [];
    const select = document.getElementById('storeCategorySelect');
    if (select) {
        select.innerHTML = '<option value="">Sin Categoría</option>';
        cats.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
    }
    window.renderStoreCategoryChips();
};

window.renderStoreCategoryChips = () => {
    const container = document.getElementById('storeCategoryChips');
    if (!container) return;
    container.innerHTML = '';
    const cats = currentUserData.storeCategories || [];

    cats.forEach((c, index) => {
        const chip = document.createElement('div');
        chip.style.cssText = "background: rgba(94, 92, 230, 0.1); border: 1px solid var(--mac-blue); color: var(--mac-blue); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; display: flex; align-items: center; gap: 8px;";
        chip.innerHTML = `<span>${c}</span> <i class='bx bx-x' style='cursor:pointer; color:var(--mac-red); font-size:16px;' onclick="window.removeStoreCategory(${index})"></i>`;
        container.appendChild(chip);
    });
};

window.addStoreCategory = async () => {
    const input = document.getElementById('newStoreCategoryInput');
    const name = input.value.trim();
    if (!name) return window.showNotification("Escribe una categoría");

    let cats = currentUserData.storeCategories || [];
    if (cats.includes(name)) return window.showNotification("La categoría ya existe");

    cats.push(name);
    currentUserData.storeCategories = cats;
    input.value = '';

    await updateDoc(doc(db, "users", currentUser.uid), { storeCategories: cats });
    window.syncStoreCategories();
};

window.removeStoreCategory = async (index) => {
    let cats = currentUserData.storeCategories || [];
    cats.splice(index, 1);
    currentUserData.storeCategories = cats;
    await updateDoc(doc(db, "users", currentUser.uid), { storeCategories: cats });
    window.syncStoreCategories();
};
window.addStoreItem = async () => {
    const type = document.getElementById('storeType') ? document.getElementById('storeType').value : 'Servicio';
    const plat = document.getElementById('storePlatform').value.trim();

    // Leemos el nuevo builder visual
    const storeTabs = window.extractBuilderData('builder-crear');

    if (!plat || storeTabs.length === 0) return window.showNotification("Completa la plataforma y al menos una Pestaña con precio");

    const p1P = storeTabs[0].options[0].price; // Precio base visual

    const cat = document.getElementById('storeCategorySelect').value;
    const desc = document.getElementById('storeDesc') ? document.getElementById('storeDesc').value.trim() : '';
    const autoStock = document.getElementById('storeAutoStock').checked;
    const requiresInvite = document.getElementById('storeRequiresInvite') ? document.getElementById('storeRequiresInvite').checked : false;
    const badgeOption = document.getElementById('storeBadgeOption').value;

    const selects = document.querySelectorAll('.store-stock-select');
    const stockPlatforms = Array.from(selects).map(s => s.value).filter(val => val !== '');

    if (autoStock && stockPlatforms.length === 0 && badgeOption !== 'a_pedido') {
        return window.showNotification("⚠️ Selecciona una plataforma del inventario para conectar el stock.");
    }

    const btn = document.querySelector('#storeModal .btn-primary');
    btn.innerText = "⏳ Subiendo..."; btn.disabled = true;

    try {
        const fileInput = document.getElementById('storeImg');
        const file = fileInput ? fileInput.files[0] : null;
        let imgUrl = "";

        if (file) {
            const storageRef = ref(storage, `store_images/${currentUser.uid}_${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(snapshot.ref);
        }
        const autoDeliver = document.getElementById('storeAutoDeliver') ? document.getElementById('storeAutoDeliver').checked : false;
        let catalog = currentUserData.storeCatalog || [];
        catalog.push({
            id: 'item_' + Date.now(), platform: plat, price: p1P,
            storeTabs: storeTabs, pricingOptions: storeTabs[0].options, // Guardado Dual (Soporta Legacy)
            category: cat, desc: desc, imgUrl: imgUrl, type: type,
            autoStock: autoStock, stockPlatforms: stockPlatforms, requiresInvite: requiresInvite, badgeOption: badgeOption, status: 'disponible',
            autoDeliver: autoDeliver
        });

        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;

        // Limpiar
        document.getElementById('storePlatform').value = '';
        if (document.getElementById('storeDesc')) document.getElementById('storeDesc').value = '';
        if (fileInput) fileInput.value = '';
        document.getElementById('builder-crear').innerHTML = ''; // Resetea el builder
        window.addTabToBuilder('builder-crear', '1 Mes', [{ label: 'Perfil', price: '' }]); // Tab Default

        document.getElementById('storeAutoStock').checked = false;
        if (document.getElementById('storeRequiresInvite')) document.getElementById('storeRequiresInvite').checked = false;

        document.querySelectorAll('.store-toggle-card').forEach(label => {
            label.style.border = '1px solid var(--mac-border)'; label.style.background = 'var(--mac-surface)';
            const icon = label.querySelector('.store-toggle-icon');
            if (icon) { icon.className = 'bx bx-circle store-toggle-icon'; icon.style.color = 'var(--mac-text-secondary)'; }
        });

        document.getElementById('storeBadgeOption').value = '';
        window.toggleStoreStockFields();
        window.renderStoreItems();
        window.showNotification("✅ Producto añadido al catálogo");
    } catch (e) { window.showNotification("Error: " + e.message); }
    finally { btn.innerHTML = "<i class='bx bx-plus-circle' style='font-size: 22px;'></i> Añadir al Catálogo"; btn.disabled = false; }
};
window.renderStoreItems = () => {
    const list = document.getElementById('storeItemsList');
    list.innerHTML = '';
    const catalog = currentUserData.storeCatalog || [];

    if (catalog.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); font-size:12px;">Tu catálogo está vacío.</p>';
        return;
    }

    catalog.forEach((item, index) => {
        let isAgotado = item.status === 'agotado';

        const statusBadge = isAgotado ? `<span style="background:var(--mac-red); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">AGOTADO</span>` : `<span style="background:var(--mac-green); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">DISPONIBLE</span>`;
        const typeBadge = item.type === 'Combo' ? `<span style="background:var(--mac-orange); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold; margin-right:5px;"><i class='bx bx-gift'></i> COMBO</span>` : '';

        const titleSafe = item.platform.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descSafe = item.desc ? item.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '') : 'Sin detalles adicionales.';

        // 🔥 FIX: Un solo div con el diseño correcto
        const div = document.createElement('div');
        div.style.cssText = `display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; background:var(--mac-surface); padding:15px; border-radius:12px; border:1px solid var(--mac-border); opacity: ${isAgotado ? '0.7' : '1'}; gap: 15px;`;

        div.innerHTML = `
            <div style="flex:1; min-width:200px; overflow:hidden;">
                ${typeBadge}
                <strong style="color:var(--mac-text-main); font-size:15px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.platform}</strong>
                <span style="color:var(--mac-text-secondary); font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; margin:4px 0;">${item.desc || ''}</span>
                <span style="color:var(--mac-green); font-size:14px; font-weight:bold; display:block; margin-top:2px;">${globalCurrency}${window.formatStorePrice(item.price)}</span>
                <div style="margin-top: 8px;">${statusBadge}</div>
            </div>
            <div style="display:flex; flex-direction:row; gap:8px; flex-shrink: 0; flex-wrap:wrap; justify-content:flex-end;">
                <button class="action-btn" style="border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px; padding: 8px 12px; border-radius:8px; background:var(--mac-bg); font-weight: bold;" onclick="window.toggleStoreItemStatus(${index})">🔄 Cambiar Estado</button>
                <button class="action-btn" style="border: 1px solid var(--mac-blue); color: var(--mac-blue); font-size: 12px; padding: 8px 12px; border-radius:8px; background:rgba(0, 122, 255, 0.05); font-weight: bold;" onclick="window.editStoreItem(${index})"><i class='bx bx-edit'></i> Editar</button>
                <button class="action-btn btn-del" style="padding: 8px 12px; font-size: 12px; border-radius:8px; font-weight: bold;" onclick="window.deleteStoreItem(${index})"><i class='bx bx-trash'></i> Borrar</button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.editStoreItem = (index) => {
    const item = currentUserData.storeCatalog[index];
    document.getElementById('editProdIndex').value = index;
    document.getElementById('editProdName').value = item.platform;

    // Cargar categorías disponibles
    const catSelect = document.getElementById('editProdCat');
    catSelect.innerHTML = '<option value="">Sin Categoría</option>';
    const userCats = currentUserData.storeCategories || [];
    userCats.forEach(c => {
        catSelect.innerHTML += `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`;
    });

    document.getElementById('editProdInvite').checked = item.requiresInvite || false;
    document.getElementById('editProdDesc').value = item.desc || '';
    document.getElementById('editProdImg').value = '';

    // Llenar el Builder de Pestañas
    const builder = document.getElementById('builder-editar');
    builder.innerHTML = '';

    let tabsData = item.storeTabs || [];
    if (tabsData.length === 0) {
        const opts = item.pricingOptions && item.pricingOptions.length > 0 ? item.pricingOptions : [{ label: 'Opciones', price: item.price }];
        tabsData = [{ name: 'General', options: opts }];
    }

    tabsData.forEach(tab => {
        window.addTabToBuilder('builder-editar', tab.name, tab.options);
    });

    document.getElementById('editProductModal').style.display = 'flex';
};

window.saveEditedProduct = async () => {
    const index = document.getElementById('editProdIndex').value;
    let catalog = currentUserData.storeCatalog;

    const plat = document.getElementById('editProdName').value.trim();
    const cat = document.getElementById('editProdCat').value;
    const invite = document.getElementById('editProdInvite').checked;
    const desc = document.getElementById('editProdDesc').value.trim();
    const fileInput = document.getElementById('editProdImg');

    const storeTabs = window.extractBuilderData('builder-editar');
    if (!plat || storeTabs.length === 0) return window.showNotification("⚠️ Faltan datos o precios.");

    const btn = document.querySelector('#editProductModal .btn-primary');
    const origTxt = btn.innerHTML;
    btn.innerHTML = "Guardando... ⏳"; btn.disabled = true;

    try {
        let newImgUrl = catalog[index].imgUrl || "";
        if (fileInput && fileInput.files.length > 0) {
            const storageRef = ref(storage, `store_images/${currentUser.uid}_${Date.now()}_${fileInput.files[0].name}`);
            const snapshot = await uploadBytes(storageRef, fileInput.files[0]);
            newImgUrl = await getDownloadURL(snapshot.ref);
        }

        catalog[index].platform = plat;
        catalog[index].category = cat;
        catalog[index].requiresInvite = invite;
        catalog[index].desc = desc;
        catalog[index].storeTabs = storeTabs;
        catalog[index].price = storeTabs[0].options[0].price; // Base referencial
        catalog[index].pricingOptions = storeTabs[0].options; // Dual save
        catalog[index].imgUrl = newImgUrl;

        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;

        window.renderStoreItems();
        document.getElementById('editProductModal').style.display = 'none';
        window.showNotification("✅ Producto editado y actualizado");
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerHTML = origTxt; btn.disabled = false;
    }
};
window.toggleStoreItemStatus = async (index) => {
    let catalog = currentUserData.storeCatalog || [];
    catalog[index].status = catalog[index].status === 'agotado' ? 'disponible' : 'agotado';
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;
        window.renderStoreItems();
    } catch (e) { window.showNotification("Error al cambiar estado"); }
};

window.deleteStoreItem = async (index) => {
    let catalog = currentUserData.storeCatalog || [];
    catalog.splice(index, 1);
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;
        window.renderStoreItems();
    } catch (e) { window.showNotification("Error al borrar"); }
};

window.copyStoreLink = () => {
    const link = document.getElementById('storeLinkInput').value;
    navigator.clipboard.writeText(link).then(() => window.showNotification("¡Link copiado! Pégalo en tu Instagram/WhatsApp."));
};

window.openProductDesc = (title, desc) => {
    document.getElementById('descModalTitle').innerText = title;
    document.getElementById('descModalText').innerText = desc;
    document.getElementById('productDescModal').style.display = 'flex';
};

/* =========================================================
   MOTOR DE CARRITO, BUSCADOR SPOTLIGHT Y COMPARTIR
========================================================= */
window.storeCart = [];
window.currentStoreFilter = 'Todos';

// COMPARTIR NATIVO (WEB SHARE API)
window.shareProduct = async (itemId) => {
    const data = window.publicStoreDataCache;
    const catalog = window.publicCatalogCache || [];
    const item = catalog.find(i => i.id === itemId);
    if (!item) return;

    const storeUrl = window.location.origin + window.location.pathname + "?tienda=" + data.storeAlias;
    const priceStr = window.formatStorePrice(item.price);
    const text = `🔥 ¡Mira esta oferta de *${item.platform}* a solo *${priceStr}* en la tienda oficial de ${data.name}!`;

    if (navigator.share) {
        try {
            await navigator.share({ title: data.name, text: text, url: storeUrl });
        } catch (err) { console.log("Compartir cancelado o no soportado"); }
    } else {
        window.copyToClipboard(text + " " + storeUrl, "Link de Oferta");
    }
};
window.addToCartConDuracion = (itemId) => {
    const catalog = window.publicCatalogCache || [];
    const originalItem = catalog.find(i => i.id === itemId);
    if (!originalItem) return;

    // Leemos cuántos meses seleccionó el cliente
    const selectElement = document.getElementById('duracion_' + itemId);
    const meses = parseInt(selectElement.value) || 1;

    // Clonamos el producto para no alterar el catálogo original
    const cartItem = { ...originalItem };

    // Multiplicamos el precio y actualizamos el nombre
    cartItem.price = originalItem.price * meses;
    if (meses > 1) {
        cartItem.platform = `${originalItem.platform} (${meses} Meses)`;
    }

    // Agregamos al carrito e invocamos la animación
    window.storeCart.push(cartItem);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    document.getElementById('floatingCartBtn').style.display = 'flex';

    document.getElementById('cartPanelOverlay').classList.add('active');
    document.getElementById('cartPanel').classList.add('active');
    window.renderCartItems();
};
// CARRITO DE COMPRAS
window.addToCart = (itemId) => {
    const item = window.publicCatalogCache.find(i => i.id === itemId);
    if (!item) return;

    window.storeCart.push(item);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    document.getElementById('floatingCartBtn').style.display = 'flex';

    // Abre el panel automáticamente como UX Premium
    document.getElementById('cartPanelOverlay').classList.add('active');
    document.getElementById('cartPanel').classList.add('active');
    window.renderCartItems();
};

window.toggleCartPanel = () => {
    document.getElementById('cartPanelOverlay').classList.toggle('active');
    document.getElementById('cartPanel').classList.toggle('active');
    if (document.getElementById('cartPanel').classList.contains('active')) window.renderCartItems();
};

window.renderCartItems = () => {
    const container = document.getElementById('cartItemsContainer');
    const totalEl = document.getElementById('cartTotalPrice');
    const data = window.publicStoreDataCache;

    container.innerHTML = '';
    let total = 0;

    if (window.storeCart.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--mac-text-secondary); margin-top: 50px;"><i class="bx bx-shopping-bag" style="font-size: 64px; opacity: 0.3; margin-bottom: 15px;"></i><p style="font-weight: bold; font-size: 16px;">Tu carrito está vacío</p></div>';
        totalEl.innerText = `${data.currency || 'S/'}0.00`;
        document.getElementById('floatingCartBtn').style.display = 'none';
        return;
    }

    window.storeCart.forEach((item, index) => {
        total += item.price;
        const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}">` : `<div style="width:65px; height:65px; border-radius:12px; background:var(--mac-gray); display:flex; align-items:center; justify-content:center; border: 1px solid var(--mac-border);"><i class="bx bx-play-circle" style="color:var(--mac-text-secondary); font-size:24px;"></i></div>`;

        container.innerHTML += `
            <div class="cart-item">
                ${imgHTML}
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.platform}</div>
                    <div class="cart-item-price">${window.formatStorePrice(item.price)}</div>
                </div>
                <button class="cart-item-remove" onclick="window.removeFromCart(${index})" title="Quitar"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });
    totalEl.innerText = `${data.currency || 'S/'}${total.toFixed(2)}`;
};

window.removeFromCart = (index) => {
    window.storeCart.splice(index, 1);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    window.renderCartItems();
};

window.openCheckoutFromCart = () => {
    if (window.storeCart.length === 0) return window.showNotification("Tu carrito está vacío.");

    window.toggleCartPanel(); // Cerramos el panel lateral

    const data = window.publicStoreDataCache;
    let totalPrice = 0;
    let platforms = [];
    let requiresInvite = false;
    let isCombo = false;

    window.storeCart.forEach(item => {
        totalPrice += item.price;
        platforms.push(item.platform);
        if (item.requiresInvite) requiresInvite = true;
        if (item.type === 'Combo') isCombo = true;
    });

    const joinedPlatforms = platforms.join(' + ');
    const finalType = window.storeCart.length > 1 || isCombo ? 'Paquete' : 'Servicio';

    let autoDeliver = true;
    window.storeCart.forEach(item => {
        if (!item.autoDeliver) autoDeliver = false;
    });
    currentCheckoutItem = {
        platform: joinedPlatforms,
        price: totalPrice,
        requiresInvite: requiresInvite,
        type: finalType,
        autoDeliver: autoDeliver
    };

    document.getElementById('checkoutItemName').innerText = window.storeCart.length > 1 ? `Paquete (${window.storeCart.length} servicios)` : joinedPlatforms;
    document.getElementById('cartTotalPrice').innerText = window.formatStorePrice(window.currentCartFinalTotal || totalPrice);

    const emailContainer = document.getElementById('checkoutEmailContainer');
    if (emailContainer) {
        emailContainer.style.display = requiresInvite ? 'flex' : 'none';
        document.getElementById('checkoutClientEmail').value = '';
    }

    const pmContainer = document.getElementById('checkoutPaymentMethods');
    pmContainer.innerHTML = '';
    const methods = data.paymentMethods || [];

    // --- NUEVO: BOTONES DE PAGO AUTOMÁTICOS ---
    let botonesAutomaticos = `
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <button class="btn-primary" style="background: #009EE3; border: none; padding: 14px; font-weight: 800; font-size: 14px;" onclick="window.iniciarPagoAutomatico('mercadopago')">
                Pagar con Mercado Pago
            </button>
            <button class="btn-primary" style="background: #FCD535; color: #1E2329; border: none; padding: 14px; font-weight: 800; font-size: 14px;" onclick="window.iniciarPagoAutomatico('binance')">
                Pagar con Binance
            </button>
        </div>
        <p style="text-align: center; color: var(--mac-text-secondary); font-size: 12px; margin-bottom: 15px; font-weight: bold;">--- O PAGO MANUAL ---</p>
    `;

    if (methods.length === 0) {
        pmContainer.innerHTML = botonesAutomaticos + '<p style="font-size: 12px; color: var(--mac-red); text-align: center;">El vendedor aún no ha configurado métodos de pago manuales.</p>';
    } else {
        let selectHtml = `<select id="pmSelectDropdown" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 14px; font-weight: bold; outline: none; margin-bottom: 10px;" onchange="window.showPaymentDetails(this.value)">`;
        selectHtml += `<option value="">-- Elige un pago manual (Yape, Transf) --</option>`;
        methods.forEach((m, idx) => { selectHtml += `<option value="${idx}">🏦 ${m.bank}</option>`; });
        selectHtml += `</select><div id="pmDetailsContainer" style="display:none; background: var(--mac-bg); padding: 15px; border-radius: 10px; border: 1px dashed var(--mac-border);"></div>`;
        pmContainer.innerHTML = botonesAutomaticos + selectHtml;
    }

    document.getElementById('checkoutPhone').value = '';
    document.getElementById('checkoutClientName').value = '';
    document.getElementById('checkoutReceipt').value = '';
    document.getElementById('checkoutModal').style.display = 'flex';
};
/* =========================================================
   SISTEMA DE FILTROS, BUSCADOR Y RENDERIZADO (TIENDITA)
========================================================= */
window.currentStoreTypeFilter = 'Todos';
window.currentStoreCatFilter = 'Todas';

window.searchPublicStore = () => {
    window.renderPublicCatalog();
};

window.filterStoreType = (type, event) => {
    window.currentStoreTypeFilter = type;
    document.querySelectorAll('#publicStoreFilters .spotify-type-btn').forEach(btn => btn.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');
    window.renderPublicCatalog();
};

window.filterStoreCategory = (cat, event) => {
    window.currentStoreCatFilter = cat;
    document.querySelectorAll('#publicStoreCategoryFilters .spotify-chip-btn').forEach(btn => btn.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');
    window.renderPublicCatalog();
};
// EL DETECTOR DEL CLIENTE PÚBLICO (MÓDULO DE TIENDITA OPTIMIZADO)
const checkPublicStore = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('tienda');

    if (storeId) {
        document.getElementById('authView').style.display = 'none';
        document.getElementById('appView').style.display = 'none';
        document.getElementById('adminView').style.display = 'none';

        const storeView = document.getElementById('publicStoreView');
        storeView.style.display = 'block';

        try {
            let data = null;
            const q = query(collection(db, "users"), where("storeAlias", "==", storeId));
            const snap = await getDocs(q);

            if (!snap.empty) {
                data = snap.docs[0].data();
                data.uid = snap.docs[0].id; // 🔥 FIX: Atrapa el ID oculto del vendedor
            }
            else {
                const docRef = await getDoc(doc(db, "users", storeId));
                if (docRef.exists()) {
                    data = docRef.data();
                    data.uid = docRef.id; // 🔥 FIX: Atrapa el ID oculto del vendedor
                }
            }

            if (!data) {
                document.getElementById('publicStoreName').innerText = "Tienda no encontrada";
                return;
            }

            const plan = data.plan_actual || 'demo';
            if ((plan !== 'pro' && plan !== 'basico') || data.active === false) {
                document.getElementById('publicStoreName').innerText = "Tienda inactiva";
                document.getElementById('publicStoreCatalog').innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary);">Este distribuidor no tiene su catálogo habilitado en este momento.</p>';
                return;
            }

            document.getElementById('publicStoreName').innerText = data.name || "Distribuidor A.G.C.";
            // 🪄 NUEVO: Mostramos el check verificado y el Footer SOLO cuando la tienda cargó con éxito
            const verifiedBadge = document.getElementById('publicStoreVerified');
            if (verifiedBadge) verifiedBadge.style.display = 'inline-flex';

            const storeFooter = document.getElementById('publicStoreFooter');
            if (storeFooter) storeFooter.style.display = 'flex';

            const logoEl = document.getElementById('publicStoreLogo');
            if (data.logoUrl) {
                logoEl.src = data.logoUrl;
                logoEl.style.display = 'block';
            }

            const bannerEl = document.getElementById('publicStoreBanner');
            const headerProfileEl = document.getElementById('publicStoreHeaderProfile');

            if (data.bannerUrl) {
                bannerEl.style.backgroundImage = `url(${data.bannerUrl})`;
                bannerEl.style.display = 'block';
                if (headerProfileEl) headerProfileEl.classList.add('profile-overlap');
            } else {
                bannerEl.style.display = 'none';
                if (headerProfileEl) headerProfileEl.classList.remove('profile-overlap');
            }

            // Guardamos la información en memoria caché global para agilizar los filtros instantáneos
            window.publicCatalogCache = data.storeCatalog || [];
            window.publicStoreDataCache = data;
            const currencyBtn = document.getElementById('storeCurrencyToggleBtn');
            if (currencyBtn) {
                if (data.binanceExchangeRate && parseFloat(data.binanceExchangeRate) > 0) {
                    currencyBtn.style.display = 'block';
                    currencyBtn.innerHTML = `<i class='bx bx-transfer-alt'></i> Mostrar en USDT`;
                    window.storeDisplayCurrency = 'local'; // Reset por seguridad
                } else {
                    currencyBtn.style.display = 'none';
                }
            }
            // Activamos Filtros y Buscador estilo Spotify
            const filtersWrapper = document.getElementById('storeAppFiltersWrapper');
            if (window.publicCatalogCache.length > 0) {
                if (filtersWrapper) filtersWrapper.style.display = 'flex';
            }

            const supportBtn = document.getElementById('publicStoreSupportBtn');
            if (supportBtn) {
                const numLimpio = data.phone.replace(/[^\d+]/g, '');
                supportBtn.href = `https://wa.me/${numLimpio}?text=${encodeURIComponent('¡Hola! Estoy visitando tu catálogo virtual y me gustaría hacerte una consulta.')}`;
                supportBtn.style.display = 'inline-flex';
            }
            // Activamos el botón de Referencias si el usuario configuró su link
            const refBtn = document.getElementById('publicStoreReferencesBtn');
            if (refBtn) {
                if (data.referencesLink && data.referencesLink !== '') {
                    refBtn.href = data.referencesLink;
                    refBtn.style.display = 'inline-flex';
                } else {
                    refBtn.style.display = 'none'; // Se oculta si no hay link
                }
            }
            // 🔥 Cuando el catálogo carga con éxito, movemos todo hacia arriba
            const storeViewEl = document.getElementById('publicStoreView');
            if (storeViewEl) {
                storeViewEl.style.justifyContent = 'flex-start';
                storeViewEl.style.paddingTop = '30px';
            }
            // --- NUEVO: CONTADOR DE VISITAS ÚNICAS ---
            const viewerUid = localStorage.getItem('agc_owner_uid');
            if (viewerUid !== data.uid) { // No cuenta si el dueño está mirando
                const visitKey = 'visited_store_' + data.uid;
                if (!localStorage.getItem(visitKey)) {
                    localStorage.setItem(visitKey, 'true'); // Evita contar al mismo cliente si recarga la página
                    const currentViews = data.storeViews || 0;
                    await updateDoc(doc(db, "users", data.uid), { storeViews: currentViews + 1 });
                    data.storeViews = currentViews + 1;
                }
            }

            // --- NUEVO: RENDERIZAR ESTADÍSTICAS PÚBLICAS ESTILO TELEGRAM ---
            const statsContainer = document.getElementById('publicStoreCornerStats');
            if (statsContainer) {
                const vistas = data.storeViews || 0;
                const compradores = data.storeSalesCount || 0;
                statsContainer.innerHTML = `
                    <div style="background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: white; font-size: 11px; padding: 6px 14px; border-radius: 20px; display: flex; gap: 12px; font-weight: bold; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                        <span style="display:flex; align-items:center; gap:5px;"><i class='bx bx-show' style="color: #007AFF; font-size: 14px;"></i> ${vistas} Visitas</span>
                        <span style="display:flex; align-items:center; gap:5px;"><i class='bx bx-shopping-bag' style="color: #34C759; font-size: 14px;"></i> ${compradores} Compradores</span>
                    </div>
                `;
            }
            // --- NUEVO: OBTENER RESEÑAS APROBADAS PARA LA TIENDA ---
            try {
                const qRev = query(collection(db, "reviews"), where("vendedorId", "==", data.uid), where("status", "==", "aprobada"));
                const snapRev = await getDocs(qRev);
                window.publicReviewsCache = snapRev.docs.map(d => d.data());
            } catch (errRev) {
                console.error("Error cargando reseñas:", errRev);
                window.publicReviewsCache = [];
            }
            // Primer renderizado general automático
            window.renderPublicCatalog('Todos');
            // Primer renderizado general automático
            window.renderPublicCatalog('Todos');

        } catch (e) {
            console.error("Error cargando la tienda pública:", e);
        }
    }
};

let currentCheckoutItem = null;

window.openCheckoutModal = (itemId) => {
    const data = window.publicStoreDataCache;
    const catalog = window.publicCatalogCache || [];
    currentCheckoutItem = catalog.find(i => i.id === itemId);

    if (!currentCheckoutItem) return;

    document.getElementById('checkoutItemName').innerText = currentCheckoutItem.platform;
    document.getElementById('checkoutItemPrice').innerText = `${data.currency || 'S/'}${currentCheckoutItem.price.toFixed(2)}`;

    // Si requiere invitación, pedimos correo
    const emailContainer = document.getElementById('checkoutEmailContainer');
    if (emailContainer) {
        emailContainer.style.display = currentCheckoutItem.requiresInvite ? 'flex' : 'none';
        document.getElementById('checkoutClientEmail').value = '';
    }

    const pmContainer = document.getElementById('checkoutPaymentMethods');
    pmContainer.innerHTML = '';

    const methods = data.paymentMethods || [];
    if (methods.length === 0) {
        pmContainer.innerHTML = '<p style="font-size: 12px; color: var(--mac-red); text-align: center;">El vendedor aún no ha configurado métodos de pago.</p>';
    } else {
        let selectHtml = `<select id="pmSelectDropdown" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 14px; font-weight: bold; outline: none; margin-bottom: 10px;" onchange="window.showPaymentDetails(this.value)">`;
        selectHtml += `<option value="">-- Elige un método de pago --</option>`;
        methods.forEach((m, idx) => { selectHtml += `<option value="${idx}">🏦 ${m.bank}</option>`; });
        selectHtml += `</select>`;
        selectHtml += `<div id="pmDetailsContainer" style="display:none; background: var(--mac-bg); padding: 15px; border-radius: 10px; border: 1px dashed var(--mac-border);"></div>`;
        pmContainer.innerHTML = selectHtml;
    }

    document.getElementById('checkoutPhone').value = '';
    document.getElementById('checkoutReceipt').value = '';
    document.getElementById('checkoutModal').style.display = 'flex';
};

// 🔥 NUEVA FUNCIÓN: Muestra los datos según lo que elija en la lista
window.showPaymentDetails = (idx) => {
    const container = document.getElementById('pmDetailsContainer');
    if (idx === "") {
        container.style.display = 'none'; // Si no elige nada, oculta los datos
        return;
    }

    // 🔥 FIX: Leer datos tanto de la Tiendita como del Portal
    const data = window.publicStoreDataCache || portalStoreData;
    const m = data.paymentMethods[idx];

    let qrBtn = '';
    if (m.qrUrl) {
        // 🔥 BOTÓN DE DESCARGA en lugar de mostrar la imagen
        qrBtn = `<button class="btn-secondary" style="width: 100%; margin-top: 15px; font-size: 13px; font-weight: bold; background: rgba(0, 122, 255, 0.1); border: 1px solid var(--mac-blue); color: var(--mac-blue);" onclick="window.descargarQR('${m.qrUrl}', '${m.bank}')"><i class='bx bx-download'></i> Descargar QR de Pago</button>`;
    }

    container.innerHTML = `
        <p style="margin: 0 0 8px 0; font-size: 13px; color: var(--mac-text-secondary);">Titular: <strong style="color: var(--mac-text-main);">${m.holder}</strong></p>
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--mac-gray); padding: 8px 12px; border-radius: 8px; border: 1px dashed var(--mac-border);">
            <span style="font-size: 16px; font-weight: 900; color: var(--mac-blue); letter-spacing: 1px;">${m.number}</span>
            <button class="action-btn" style="background: transparent; border: 1px solid var(--mac-border); color: var(--mac-text-main); padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: bold;" onclick="window.copyToClipboard('${m.number}', 'Número de ${m.bank}')"><i class='bx bx-copy'></i> Copiar</button>
        </div>
        ${qrBtn}
    `;
    container.style.display = 'block';
};

// 🔥 NUEVA FUNCIÓN: Descarga el QR forzosamente a la galería del cliente
window.descargarQR = async (url, banco) => {
    try {
        window.showNotification("⏳ Descargando QR...");
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `QR_${banco}_Pago.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        window.showNotification("✅ QR Guardado en tu dispositivo");
    } catch (e) {
        // Plan B: Si el navegador bloquea descargas silenciosas (algunos Iphones), se lo abre en pestaña nueva
        window.open(url, '_blank');
    }
};
window.openRenewFromPortal = (clientId, platform, price) => {
    const data = portalStoreData;

    document.getElementById('checkoutItemName').innerText = `Renovación: ${platform}`;
    document.getElementById('checkoutItemPrice').innerText = window.formatStorePrice(currentCheckoutItem.price);

    const emailContainer = document.getElementById('checkoutEmailContainer');
    if (emailContainer) emailContainer.style.display = 'none';

    const pmContainer = document.getElementById('checkoutPaymentMethods');
    pmContainer.innerHTML = '';
    const methods = data.paymentMethods || [];

    // BOTONES AUTOMÁTICOS
    let botonesAutomaticos = `
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <button class="btn-primary" style="background: #009EE3; border: none; padding: 14px; font-weight: 800; font-size: 14px;" onclick="window.iniciarPagoAutomatico('mercadopago')">
                Pagar con Mercado Pago
            </button>
            <button class="btn-primary" style="background: #FCD535; color: #1E2329; border: none; padding: 14px; font-weight: 800; font-size: 14px;" onclick="window.iniciarPagoAutomatico('binance')">
                Pagar con Binance
            </button>
        </div>
        <p style="text-align: center; color: var(--mac-text-secondary); font-size: 12px; margin-bottom: 15px; font-weight: bold;">--- O PAGO MANUAL ---</p>
    `;

    if (methods.length === 0) {
        pmContainer.innerHTML = botonesAutomaticos + '<p style="font-size: 12px; color: var(--mac-red); text-align: center;">El administrador no ha configurado métodos de pago manuales.</p>';
    } else {
        let selectHtml = `<select id="pmSelectDropdown" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 14px; font-weight: bold; outline: none; margin-bottom: 10px;" onchange="window.showPaymentDetails(this.value)">`;
        selectHtml += `<option value="">-- Elige un pago manual (Yape, Transf) --</option>`;
        methods.forEach((m, idx) => { selectHtml += `<option value="${idx}">🏦 ${m.bank}</option>`; });
        selectHtml += `</select><div id="pmDetailsContainer" style="display:none; background: var(--mac-bg); padding: 15px; border-radius: 10px; border: 1px dashed var(--mac-border);"></div>`;
        pmContainer.innerHTML = botonesAutomaticos + selectHtml;
    }

    currentCheckoutItem = {
        isRenewal: true,
        clientId: clientId,
        platform: platform,
        price: parseFloat(price),
        requiresInvite: false,
        autoDeliver: true // Siempre true para renovaciones
    };

    document.getElementById('checkoutPhone').value = '';
    document.getElementById('checkoutClientName').value = '';
    document.getElementById('checkoutReceipt').value = '';
    document.getElementById('checkoutModal').style.display = 'flex';
};

window.iniciarPagoAutomatico = async (metodo) => {
    const name = document.getElementById('checkoutClientName').value.trim();
    const phone = document.getElementById('checkoutPhone').value.trim();

    if (!name) return window.showNotification("⚠️ Por favor, ingresa tu nombre.");
    if (!phone || !phone.startsWith('+')) return window.showNotification("⚠️ Ingresa tu WhatsApp incluyendo el código de país (Ej: +51...)");

    let clienteCorreo = '';
    if (currentCheckoutItem.requiresInvite) {
        clienteCorreo = document.getElementById('checkoutClientEmail').value.trim();
        if (!clienteCorreo) return window.showNotification("⚠️ Debes ingresar tu correo para recibir la invitación.");
    }

    // Modal de Carga
    Swal.fire({
        title: 'Generando Pago...',
        html: 'Por favor espera, te estamos redirigiendo a la pasarela segura.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading() }
    });

    try {
        const dataTienda = window.publicStoreDataCache || portalStoreData;
        const vendedorId = dataTienda.uid;
        const pedidoId = `ped_${Date.now()}`;

        // 1. Guardar el pedido en Firebase (esperando_pago)
        await setDoc(doc(db, "pedidos", pedidoId), {
            vendedorId: vendedorId,
            clienteId: currentCheckoutItem.isRenewal ? currentCheckoutItem.clientId : null,
            clienteNombre: name,
            clienteNumero: phone,
            tipo: currentCheckoutItem.isRenewal ? 'renovacion' : (currentCheckoutItem.type || 'Servicio'),
            plataforma: currentCheckoutItem.platform,
            precio: currentCheckoutItem.price,
            comprobanteUrl: 'PAGO_AUTOMATICO', // Indicador de que no hay captura
            metodoPago: metodo,
            requiereInvitacion: currentCheckoutItem.requiresInvite || false,
            clienteCorreo: clienteCorreo,
            entregaAutomatica: currentCheckoutItem.autoDeliver || false, // Enviar instrucción al Bot
            estado: 'esperando_pago', // El Webhook de la VPS lo cambiará a 'aprobado'
            fecha: new Date().toISOString()

        });

        // 2. Hacer fetch a tu VPS en DigitalOcean
        if (metodo === 'binance') {
            Swal.close();

            const dataTienda = window.publicStoreDataCache || portalStoreData;
            // Cálculo Dinámico USDT
            const rate = parseFloat(dataTienda.binanceExchangeRate) || 1;
            const priceUSDT = (currentCheckoutItem.price / rate).toFixed(2);

            const payId = dataTienda.binancePayId || 'No configurado';
            const alias = dataTienda.binanceAlias || '';

            const { value: transactionId } = await Swal.fire({
                title: 'Pagar con Binance',
                html: `
            <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <p style="margin-bottom: 15px; font-size: 15px; color: var(--mac-text-main);">
                    Envía exactamente <b style="color: #FCD535; font-size: 18px;">${priceUSDT} USDT</b> a nuestro Binance Pay.
                </p>
                <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 12px; border: 1px dashed #555; margin-bottom: 20px; width: 100%; box-sizing: border-box;">
                    <p style="margin: 0; font-size: 13px; color: var(--mac-text-secondary);">Binance Pay ID:</p>
                    <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: 800; color: #fff; letter-spacing: 1.5px;">${payId}</p>
                    ${alias ? `<p style="margin: 5px 0 0 0; font-size: 13px; color: #FCD535; font-weight: bold;">Alias: ${alias}</p>` : ''}
                </div>
                <p style="font-size: 14px; color: var(--mac-text-secondary); margin-bottom: 10px;">
                    Una vez transferido, pega aquí el <b>Order ID (Número de Orden)</b> de tu pago:
                </p>
            </div>
        `,
                input: 'text',
                inputPlaceholder: 'Ej: 1234567890123456',
                inputAttributes: {
                    // 🟢 AQUÍ CENTRAMOS EL RECUADRO Y LE DAMOS UN ANCHO MÁS PEQUEÑO
                    style: 'text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 1px; max-width: 80%; margin: 0 auto; display: block;'
                },
                showCancelButton: true,
                confirmButtonText: 'Verificar Pago',
                cancelButtonText: 'Cancelar'
            });

            if (!transactionId) return;

            // Mostrar modal de verificación
            Swal.fire({
                title: 'Verificando pago...',
                html: 'Estamos buscando tu transacción en Binance. Esto tomará unos segundos...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading() }
            });

            const response = await fetch('https://bot.panelagc.com/api/verificar-pago-binance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendedorId: vendedorId,
                    pedidoId: pedidoId,
                    transactionId: transactionId.trim(),
                    precio: currentCheckoutItem.price
                })
            });

            const dataResp = await response.json();

            if (dataResp.status === 'ok') {
                window.storeCart = [];
                document.getElementById('cartBadge').innerText = '0';
                document.getElementById('floatingCartBtn').style.display = 'none';
                document.getElementById('checkoutModal').style.display = 'none';

                Swal.fire({
                    title: '¡Pago Confirmado!',
                    text: 'Tu pago fue verificado correctamente. Tu servicio llegará a tu WhatsApp en unos instantes.',
                    icon: 'success',
                    confirmButtonText: 'Excelente'
                });
            } else {
                Swal.fire('Error al Verificar', dataResp.error || 'No se encontró tu pago. Revisa el ID e intenta nuevamente.', 'error');
            }

        } else {
            // LÓGICA DE MERCADO PAGO (Automática con Redirección)
            const response = await fetch('https://bot.panelagc.com/api/crear-pago-mp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendedorId: vendedorId,
                    pedidoId: pedidoId,
                    titulo: currentCheckoutItem.platform,
                    precio: currentCheckoutItem.price
                })
            });

            const dataResp = await response.json();

            if (dataResp.status === 'ok') {
                window.storeCart = [];
                document.getElementById('cartBadge').innerText = '0';
                document.getElementById('floatingCartBtn').style.display = 'none';
                document.getElementById('checkoutModal').style.display = 'none';

                // Redirigir a Mercado Pago
                window.location.href = dataResp.init_point;
            } else {
                Swal.fire('Error', dataResp.error || 'El vendedor no tiene configurado este método de pago.', 'error');
            }
        }

    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'Hubo un problema de red al contactar al servidor.', 'error');
    }
};

window.submitCheckout = async () => {
    const name = document.getElementById('checkoutClientName').value.trim();
    const phone = document.getElementById('checkoutPhone').value.trim();
    const fileInput = document.getElementById('checkoutReceipt');
    const file = fileInput.files.length > 0 ? fileInput.files[0] : null;

    if (!name) return window.showNotification("⚠️ Por favor, ingresa tu nombre.");
    if (!phone || !phone.startsWith('+')) return window.showNotification("⚠️ Ingresa tu WhatsApp incluyendo el código de país (Ej: +51...)");
    if (!file) return window.showNotification("⚠️ Sube la foto de tu comprobante de pago.");

    let clienteCorreo = '';
    if (currentCheckoutItem.requiresInvite) {
        clienteCorreo = document.getElementById('checkoutClientEmail').value.trim();
        if (!clienteCorreo) return window.showNotification("⚠️ Debes ingresar tu correo para recibir la invitación.");
    }

    const btn = document.getElementById('btnSubmitCheckout');
    const origText = btn.innerHTML;
    btn.innerHTML = "Procesando... <i class='bx bx-loader-alt bx-spin'></i>";
    btn.disabled = true;

    try {
        // 🔥 FIX: Leer el ID del vendedor desde la Tiendita o desde el Portal
        const data = window.publicStoreDataCache || portalStoreData;
        const vendedorId = data.uid;

        const storageRef = ref(storage, `comprobantes/${vendedorId}_${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const comprobanteUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "pedidos"), {
            vendedorId: vendedorId,
            clienteId: currentCheckoutItem.isRenewal ? currentCheckoutItem.clientId : null,
            clienteNombre: name,
            clienteNumero: phone,
            tipo: currentCheckoutItem.isRenewal ? 'renovacion' : (currentCheckoutItem.type || 'Servicio'),
            plataforma: currentCheckoutItem.platform,
            precio: currentCheckoutItem.price,
            comprobanteUrl: comprobanteUrl,
            requiereInvitacion: currentCheckoutItem.requiresInvite || false,
            clienteCorreo: clienteCorreo,
            entregaAutomatica: currentCheckoutItem.autoDeliver || false,
            estado: 'pendiente',
            fecha: new Date().toISOString()
        });

        // Reemplaza el fetch de notificación por esto:
        fetch('https://bot.panelagc.com/api/notificar-venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendedorId: vendedorId,
                plataforma: currentCheckoutItem.platform,
                precio: currentCheckoutItem.price,
                moneda: data.currency || 'S/',
                tipo: currentCheckoutItem.isRenewal ? 'renovacion' : 'venta'
            })
        }).catch(err => console.error("Error enviando alerta de venta:", err));

        document.getElementById('checkoutModal').style.display = 'none';
        // Vaciar carrito
        window.storeCart = [];
        document.getElementById('cartBadge').innerText = '0';
        document.getElementById('floatingCartBtn').style.display = 'none';
        document.getElementById('checkoutModal').style.display = 'none';

        // --- NUEVO: REDIRECCIÓN AL WHATSAPP DEL VENDEDOR ---
        const dataTienda = window.publicStoreDataCache || portalStoreData;
        const vendedorNum = dataTienda.phone ? dataTienda.phone.replace(/[^\d]/g, '') : '';
        const wsText = `Hola, acabo de pagar mi pedido en tu tienda web.\n\n*🛒 Producto:* ${currentCheckoutItem.platform}\n*💰 Total Pagado:* ${window.formatStorePrice(currentCheckoutItem.price)}\n*👤 A nombre de:* ${name}\n\nPor favor, verifica mi comprobante para entregarme el acceso.`;
        const waUrl = `https://wa.me/${vendedorNum}?text=${encodeURIComponent(wsText)}`;

        Swal.fire({
            icon: 'success',
            title: '¡Pago Enviado con Éxito!',
            html: '<p style="font-size:14px; color:var(--mac-text-secondary);">Tu comprobante está en revisión. <b>Por favor, avísale al vendedor por WhatsApp</b> haciendo clic en el botón de abajo para agilizar tu entrega.</p>',
            confirmButtonText: '<i class="bx bxl-whatsapp" style="font-size:20px; vertical-align:middle;"></i> Avisar por WhatsApp',
            confirmButtonColor: '#25D366',
            showCancelButton: true,
            cancelButtonText: 'Cerrar',
            allowOutsideClick: false,
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        }).then((result) => {
            if (result.isConfirmed) {
                window.open(waUrl, '_blank');
            }
        });

    } catch (error) { window.showNotification("Error: " + error.message); }
    finally { btn.innerHTML = origText; btn.disabled = false; }
};
// --- SISTEMA DE REGLAS POR PLATAFORMA ---
window.openRulesModal = () => {
    document.getElementById('rulesModal').style.display = 'flex';
    window.loadPlatformRule();
};

window.loadPlatformRule = () => {
    const p = document.getElementById('rulePlatformSelect').value;
    const rules = currentUserData.platformRules || {};
    document.getElementById('ruleText').value = rules[p] || '';
};

window.savePlatformRule = async () => {
    const p = document.getElementById('rulePlatformSelect').value;
    const txt = document.getElementById('ruleText').value.trim();
    let rules = currentUserData.platformRules || {};
    rules[p] = txt;

    try {
        const btn = document.querySelector('#rulesModal .btn-primary');
        btn.innerText = "Guardando...";
        await updateDoc(doc(db, "users", currentUser.uid), { platformRules: rules });
        currentUserData.platformRules = rules;
        window.showNotification("✅ Regla de " + p + " guardada.");
        btn.innerText = "Guardar Regla";
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};

/* --- CONTROLADOR DE VISTAS (CLIENTES VS CUENTAS MATRICES) --- */
window.switchMainTab = (tab) => {
    const btnClientes = document.getElementById('btnTabClientes');
    const btnCuentas = document.getElementById('btnTabCuentas');

    // FIX: Atrapamos al contenedor general que envuelve a toda la tabla y botones
    const mainTableEl = document.getElementById('mainTable');
    const tableClientesWrapper = mainTableEl ? mainTableEl.parentElement : null;

    const tableCuentas = document.getElementById('accountsTableContainer');
    const subtitle = document.getElementById('userGreeting');
    const filterSelect = document.getElementById('filterSelect');
    const searchInput = document.getElementById('searchInput');

    if (tab === 'clientes') {
        if (btnClientes) { btnClientes.style.background = 'var(--mac-blue)'; btnClientes.style.color = 'white'; }
        if (btnCuentas) { btnCuentas.style.background = 'transparent'; btnCuentas.style.color = 'var(--mac-text-secondary)'; }

        if (tableClientesWrapper) tableClientesWrapper.style.setProperty('display', 'block', 'important');
        if (tableCuentas) tableCuentas.style.setProperty('display', 'none', 'important');
        if (subtitle) subtitle.innerText = 'Gestión de clientes';

        if (filterSelect) filterSelect.style.display = 'block';
        if (searchInput) searchInput.value = '';
        window.renderTable();

    } else if (tab === 'cuentas') {
        if (btnCuentas) { btnCuentas.style.background = 'var(--mac-blue)'; btnCuentas.style.color = 'white'; }
        if (btnClientes) { btnClientes.style.background = 'transparent'; btnClientes.style.color = 'var(--mac-text-secondary)'; }

        if (tableClientesWrapper) tableClientesWrapper.style.setProperty('display', 'none', 'important');
        if (tableCuentas) tableCuentas.style.setProperty('display', 'block', 'important');
        if (subtitle) subtitle.innerText = 'Gestión de cuentas';

        if (filterSelect) filterSelect.style.display = 'none';
        if (searchInput) searchInput.value = '';
        if (typeof window.renderMasterAccounts === 'function') window.renderMasterAccounts();
    }
};
/* ==========================================
   MÓDULO DE INVENTARIO (CUENTAS LIBRES)
========================================== */
// --- ABRIR INVENTARIO SIN SCROLL FANTASMA ---
window.openInventoryModal = () => {
    window.closeModals(false); // 🧹 LIMPIEZA SILENCIOSA ANTES DE ABRIR
    document.getElementById('inventoryModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    window.renderInventory();
};
let editingInvId = null; // Variable global para saber si estamos editando

window.addInventoryAccount = async () => {
    const platform = document.getElementById('invPlatform').value;
    const type = document.getElementById('invType').value;
    const email = document.getElementById('invEmail').value.trim();
    const pass = document.getElementById('invPass').value.trim();
    const profile = document.getElementById('invProfile').value.trim();
    const pin = document.getElementById('invPin').value.trim() || 'N/A';

    if (!platform || !email || !pass) return window.showNotification("Plataforma, Correo y Contraseña son obligatorios.");
    if (type === 'Perfil' && (!profile || !/\d/.test(profile))) return window.showNotification("⚠️ En 'N° Perfil' debes incluir al menos un NÚMERO (Ej: 3, J3).");

    const btn = document.getElementById('btnSaveInv');
    btn.innerHTML = "⏳ Procesando..."; btn.disabled = true;

    try {
        let stock = currentUserData.inventory || [];

        if (editingInvId) {
            // MODO EDICIÓN: Actualizamos los datos del objeto existente
            stock = stock.map(item => item.id === editingInvId ? { ...item, platform, type, email, pass, profile, pin } : item);
            window.showNotification("✅ Cuenta actualizada");
        } else {
            // MODO CREACIÓN
            const accountId = 'acc_' + Date.now();
            stock.push({ id: accountId, platform, type, email, pass, profile, pin, status: 'libre' });
            window.showNotification("✅ Cuenta añadida al stock");
        }

        await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
        currentUserData.inventory = stock;

        window.cancelInventoryEdit(); // Limpia el formulario
        window.renderInventory();
    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerHTML = "<i class='bx bx-save'></i> Guardar en stock"; btn.disabled = false;
    }
};

window.editInventoryAccount = (id) => {
    const stock = currentUserData.inventory || [];
    const item = stock.find(i => i.id === id);
    if (!item) return;

    document.getElementById('invPlatform').value = item.platform || '';
    document.getElementById('invType').value = item.type || 'Perfil';
    document.getElementById('invEmail').value = item.email || '';
    document.getElementById('invPass').value = item.pass || '';
    document.getElementById('invProfile').value = item.profile || '';
    document.getElementById('invPin').value = item.pin || '';

    editingInvId = id;

    // Cambiamos el aspecto visual del formulario
    document.getElementById('btnSaveInv').innerHTML = "<i class='bx bx-check-double'></i> Actualizar Cuenta";
    document.getElementById('btnSaveInv').style.backgroundColor = "var(--mac-orange)";
    document.getElementById('btnCancelInv').style.display = "block";
};

window.cancelInventoryEdit = () => {
    editingInvId = null;
    document.getElementById('invPlatform').value = '';
    document.getElementById('invType').value = 'Perfil';
    document.getElementById('invEmail').value = '';
    document.getElementById('invPass').value = '';
    document.getElementById('invProfile').value = '';
    document.getElementById('invPin').value = '';

    document.getElementById('btnSaveInv').innerHTML = "<i class='bx bx-save'></i> Guardar en stock";
    document.getElementById('btnSaveInv').style.backgroundColor = "var(--mac-blue)";
    document.getElementById('btnCancelInv').style.display = "none";
};

window.renderInventory = () => {
    const list = document.getElementById('inventoryList');
    if (!list) return;
    list.innerHTML = '';
    const stock = currentUserData.inventory || [];
    const cuentasLibres = stock.filter(item => item.status === 'libre');

    if (cuentasLibres.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); font-size:13px; margin-top:20px;">Tu inventario está vacío.</p>';
        return;
    }

    cuentasLibres.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = "background:var(--mac-surface); padding:12px; border-radius:8px; border:1px solid var(--mac-border); display:flex; justify-content:space-between; align-items:center;";
        const tipoBadge = item.type === 'Completa' ? `<span style="background:var(--mac-orange); color:white; font-size:10px; padding:2px 6px; border-radius:10px; margin-left:5px; font-weight:bold;"><i class='bx bxs-star'></i> COMPLETA</span>` : `<span style="background:var(--mac-blue); color:white; font-size:10px; padding:2px 6px; border-radius:10px; margin-left:5px; font-weight:bold;"><i class='bx bxs-user'></i> PERFIL</span>`;

        div.innerHTML = `
            <div>
                <strong style="color:var(--mac-text-main); font-size:15px;">${item.platform}</strong>${tipoBadge}
                <div style="color:var(--mac-text-secondary); font-size:12px; margin-top:4px;">
                    <i class='bx bx-envelope'></i> ${item.email}<br>
                    <i class='bx bx-lock-alt'></i> ${item.pass} | <i class='bx bx-user-circle'></i>: ${item.profile} | <i class='bx bx-pin'></i>: ${item.pin}
                </div>
            </div>
            <div style="display:flex; gap: 5px;">
                <button class="action-btn" style="color:var(--mac-text-main); border:1px solid var(--mac-border);" onclick="window.copyFromInventory('${item.id}')" title="Copiar Datos"><i class='bx bx-copy'></i></button>
                <button class="action-btn" style="color:var(--mac-green); border:1px solid var(--mac-green); background: rgba(52, 199, 89, 0.1);" onclick="window.deliverFromInventory('${item.id}')" title="Entregar a Cliente"><i class='bx bx-send'></i></button>
                <!-- EL NUEVO BOTÓN DE EDITAR -->
                <button class="action-btn" style="color:var(--mac-orange); border:1px solid var(--mac-orange); background: rgba(255, 149, 0, 0.1);" onclick="window.editInventoryAccount('${item.id}')" title="Editar Cuenta"><i class='bx bx-edit-alt'></i></button>
                <button class="action-btn btn-del" onclick="window.deleteInventoryAccount('${item.id}')"><i class='bx bx-trash'></i></button>
            </div>
        `;
        list.appendChild(div);
    });
};
window.deliverFromInventory = (id) => {
    const stock = currentUserData.inventory || [];
    const item = stock.find(i => i.id === id);
    if (!item) return;

    // 1. Ir a la vista principal
    window.closeModals(true);
    window.switchMainTab('clientes');

    // 🔥 NUEVA LÓGICA DE PESTAÑAS (MULTI-ACC)
    multiAccData = {};
    multiAccData[item.platform] = window.getDefaultAccData();
    multiAccData[item.platform].email = item.email || '';
    multiAccData[item.platform].password = item.pass || '';
    multiAccData[item.platform].profile = item.profile || '';
    multiAccData[item.platform].pin = item.pin || '';
    multiAccData[item.platform].units = 1;
    multiAccData[item.platform].saleType = item.type === 'Completa' ? 'Cuenta Completa' : 'Perfil';
    multiAccData[item.platform].inventoryId = item.id;

    // 3. Seleccionar la plataforma en el multiselect
    const cbs = document.querySelectorAll('#checkboxDropdown input');
    cbs.forEach(cb => cb.checked = false);
    cbs.forEach(cb => { if (cb.value === item.platform) cb.checked = true; });
    const selectText = document.getElementById('selectText');
    if (selectText) {
        selectText.textContent = item.platform;
        selectText.classList.add('has-selection');
    }

    // 4. Cambiar el botón verde
    const btnAcc = document.getElementById('btnAccountData');
    if (btnAcc) {
        btnAcc.innerText = `✅ Datos de Cuenta Cargados`;
        btnAcc.style.backgroundColor = "var(--mac-green)";
        btnAcc.style.color = "white";
    }

    // 5. Scroll al formulario
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
    window.showNotification("✅ Datos cargados. Completa la info del cliente.");
};

window.copyFromInventory = (id) => {
    const stock = currentUserData.inventory || [];
    const item = stock.find(i => i.id === id);
    if (!item) return;

    // Obtener formato desde configuración de WhatsApp del usuario
    const baseMsg = currentUserData.waDeliveryMessage || "🎉 *¡Gracias por tu compra!*\n\nAquí tienes los datos de tu nueva cuenta de *{plataforma}*:\n\n📧 *Correo:* {correo}\n🔑 *Clave:* {pass}\n📌 *PIN:* {pin}\n\n📅 *Vence el:* {fecha}\n\n⚠️ *Reglas:* {reglas}\n\n¡Que disfrutes el contenido! 🍿";

    // Calcular 1 mes desde hoy
    const h = new Date();
    h.setMonth(h.getMonth() + 1);
    const dateStr = h.toLocaleDateString('es-ES');

    // Obtener reglas de la plataforma
    const rulesDB = currentUserData.platformRules || {};
    const itemRules = rulesDB[item.platform] || "Uso personal, no modificar los datos de acceso.";

    // Reemplazar las variables dinámicas
    const finalMsg = baseMsg
        .replace(/{plataforma}/gi, item.platform || '-')
        .replace(/{correo}/gi, item.email || '-')
        .replace(/{pass}/gi, item.pass || '-')
        .replace(/{pin}/gi, item.pin || 'N/A')
        .replace(/{profile}/gi, item.profile || 'N/A')
        .replace(/{fecha}/gi, dateStr)
        .replace(/{reglas}/gi, itemRules);

    // Copiar al portapapeles
    navigator.clipboard.writeText(finalMsg).then(() => {
        window.showNotification("📋 Formato de entrega copiado con fecha a 1 mes");
    }).catch(e => {
        window.showNotification("Error al copiar");
    });
};
window.deleteInventoryAccount = async (id) => {
    if (!confirm("¿Eliminar esta cuenta del inventario?")) return;
    try {
        let stock = currentUserData.inventory || [];
        stock = stock.filter(item => item.id !== id);
        await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
        currentUserData.inventory = stock;
        window.renderInventory();
        window.showNotification("🗑️ Cuenta eliminada");
    } catch (e) {
        window.showNotification("Error al eliminar: " + e.message);
    }
};
/* ==========================================
   MÓDULO DE VENTAS PENDIENTES (COMBOS Y ENTREGAS)
========================================== */

// 1. Abrir modal y cargar los pedidos desde Firebase
window.openPedidosModal = async () => {
    window.closeModals(false);
    document.getElementById('pedidosModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const list = document.getElementById('pedidosList');
    list.innerHTML = '<p style="text-align:center;">Cargando ventas pendientes...</p>';

    try {
        const q = query(collection(db, "pedidos"), where("vendedorId", "==", currentUser.uid), where("estado", "==", "pendiente"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            list.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); margin-top:20px;">No tienes ventas pendientes.</p>';
            return;
        }

        list.innerHTML = '';

        // 1. Obtener Cuentas libres (para compras normales)
        const inventarioLimpio = (currentUserData.inventory || []).filter(i => i.status === 'libre');
        window.opcionesCuentasGlobal = `<option value="">-- Selecciona una cuenta para entregar --</option>`;
        inventarioLimpio.forEach(acc => {
            window.opcionesCuentasGlobal += `<option value="${acc.id}">[${acc.platform} - ${acc.type}] ${acc.email} ${acc.type === 'Perfil' ? '(P: ' + acc.profile + ')' : ''}</option>`;
        });

        // 2. Obtener Matrices (para compras por invitación)
        const qMat = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
        const snapMat = await getDocs(qMat);
        let opcionesMatricesGlobal = `<option value="">-- Elige la Cuenta Matriz --</option>`;
        snapMat.forEach(d => {
            const m = d.data();
            opcionesMatricesGlobal += `<option value="${d.id}">[${m.platform}] ${m.email}</option>`;
        });

        snapshot.forEach(docSnap => {
            const pedido = docSnap.data();
            const pId = docSnap.id;
            const nombreCli = pedido.clienteNombre || "Cliente Nuevo";

            // HTML Dinámico (Invitación vs Normal)
            let dynamicControls = '';
            let btnAction = '';

            if (pedido.tipo === 'renovacion') {
                dynamicControls = `
                    <div style="background: rgba(0, 122, 255, 0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--mac-blue); margin-bottom: 10px; text-align: center;">
                        <span style="color: var(--mac-blue); font-weight: bold; font-size: 13px;"><i class='bx bx-refresh'></i> SOLICITUD DE RENOVACIÓN</span>
                        <p style="font-size: 11px; color: var(--mac-text-main); margin: 5px 0 0 0;">El cliente ya tiene la cuenta, solo debes verificar el pago y extender sus días.</p>
                    </div>
                `;
                btnAction = `<button class="btn-primary" style="width:100%; background:var(--mac-blue); border:none; padding:14px; font-size:14px; font-weight:bold;" onclick="window.aprobarRenovacionPedido('${pId}', '${pedido.clienteId}', '${pedido.plataforma}', ${pedido.precio})">
                    <i class='bx bx-check-shield'></i> Aprobar y Actualizar Fecha
                </button>`;
            } else {
                if (pedido.requiereInvitacion) {
                    dynamicControls = `
                        <p style="font-size: 13px; color: var(--mac-orange); font-weight: bold; margin-bottom:10px; background: rgba(255, 149, 0, 0.1); padding: 8px; border-radius: 6px;"><i class='bx bx-envelope'></i> Correo cliente: ${pedido.clienteCorreo}</p>
                        <label style="font-size: 11px; font-weight:bold; color:var(--mac-text-secondary);">¿En qué Matriz vas a guardar este registro?</label>
                        <div id="cuentas_container_${pId}">
                            <select class="select_matriz_${pId}" style="width:100%; margin-bottom:5px; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border);">
                                ${opcionesMatricesGlobal}
                            </select>
                            <input type="text" id="input_perfil_${pId}" placeholder="N° Perfil / Espacio (Opcional)" style="width:100%; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border); margin-bottom:10px;">
                        </div>
                    `;
                    btnAction = `<button class="btn-primary" style="width:100%; background:var(--mac-green); border:none; padding:14px; font-size:14px; font-weight:bold;" onclick="window.aprobarVenta('${pId}', '${pedido.clienteNumero}', true, '${pedido.clienteCorreo || ''}', '${pedido.plataforma}', '${nombreCli.replace(/'/g, "\\'")}')">
                        <i class='bx bx-check-shield'></i> Aprobar y Entregar Automático
                    </button>`;
                } else {
                    dynamicControls = `
                        <label style="font-size: 11px; font-weight:bold; color:var(--mac-text-secondary);">Elige qué cuenta(s) despachar:</label>
                        <div id="cuentas_container_${pId}">
                            <select class="select_acc_${pId}" style="width:100%; margin-bottom:5px; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border);">
                                ${window.opcionesCuentasGlobal}
                            </select>
                        </div>
                        <button class="action-btn" style="color:var(--mac-blue); font-size:12px; margin-bottom:12px; font-weight:bold; background:transparent; border:none; padding:0; cursor:pointer;" onclick="window.addSelectToPedido('${pId}')">
                            + Añadir otra cuenta al despacho
                        </button>
                    `;
                    btnAction = `<button class="btn-primary" style="width:100%; background:var(--mac-green); border:none; padding:14px; font-size:14px; font-weight:bold;" onclick="window.aprobarVenta('${pId}', '${pedido.clienteNumero}', false, '', '${pedido.plataforma}', '${nombreCli.replace(/'/g, "\\'")}')">
                        <i class='bx bx-check-shield'></i> Aprobar y Entregar Automático
                    </button>`;
                }
            }

            const div = document.createElement('div');
            div.style.cssText = "background:var(--mac-bg); padding:15px; border-radius:10px; border:1px solid var(--mac-border);";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; border-bottom: 1px solid var(--mac-border); padding-bottom: 10px;">
                    <div>
                        <strong style="color:var(--mac-blue); font-size:16px;"><i class='bx bx-cart-add'></i> ${pedido.plataforma}</strong><br>
                        <span style="color:var(--mac-text-main); font-size:13px; font-weight: 600;">👤 ${nombreCli} | 📞 WA: ${pedido.clienteNumero}</span>
                        <span style="display:block; font-size:12px; color:var(--mac-text-secondary); margin-top:2px;">Tipo: ${pedido.tipo.toUpperCase()} | Monto: <b style="color:var(--mac-green);">${globalCurrency}${pedido.precio.toFixed(2)}</b></span>
                    </div>
                    <button class="action-btn btn-del" onclick="window.rechazarPedido('${pId}')"><i class='bx bx-x'></i></button>
                </div>
                
                <div style="text-align: center; margin-bottom: 15px; background: rgba(0,0,0,0.02); padding: 10px; border-radius: 8px;">
                    <a href="${pedido.comprobanteUrl}" target="_blank">
                        <img src="${pedido.comprobanteUrl}" style="height: 140px; border-radius: 8px; object-fit: contain; border: 1px solid var(--mac-border);">
                    </a>
                </div>
                
                ${dynamicControls}
                
                <div style="margin-bottom:15px;">
                    <input type="number" id="precio_venta_${pId}" placeholder="Confirma Precio Total Cobrado" value="${pedido.precio}" style="width:100%; padding:10px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border); font-weight:bold;">
                </div>

                ${btnAction}
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Error: ${e.message}</p>`;
    }
};

window.addSelectToPedido = (pId) => {
    const container = document.getElementById(`cuentas_container_${pId}`);
    const select = document.createElement('select');
    select.className = `select_acc_${pId}`;
    select.style.cssText = "width:100%; margin-bottom:5px; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border);";
    select.innerHTML = window.opcionesCuentasGlobal;
    container.appendChild(select);
};

// 2. Rechazar (Eliminar el ticket)
window.rechazarPedido = async (pedidoId) => {
    if (!confirm("¿Seguro que deseas rechazar y borrar este comprobante? No se enviará nada al cliente.")) return;
    try {
        await deleteDoc(doc(db, "pedidos", pedidoId));
        window.showNotification("🚫 Solicitud rechazada");
        window.openPedidosModal();
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};

// 3. Aprobar y Liberar Cuenta(s) (SISTEMA DE COMBOS)
window.aprobarVenta = async (pedidoId, numeroCliente, requiereInvitacion, clienteCorreo, plataforma, nombreCliente = "Cliente Nuevo") => {
    let cuentasIds = [];
    let matrizId = null;
    let perfilMatriz = '';

    // Validar según el tipo de pedido
    if (requiereInvitacion) {
        matrizId = document.querySelector(`.select_matriz_${pedidoId}`).value;
        if (!matrizId) return window.showNotification("⚠️ Selecciona la Cuenta Matriz donde registrarás al cliente.");
        perfilMatriz = document.getElementById(`input_perfil_${pedidoId}`).value.trim();
    } else {
        const selects = document.querySelectorAll(`.select_acc_${pedidoId}`);
        cuentasIds = Array.from(selects).map(s => s.value).filter(val => val !== "");
        if (cuentasIds.length === 0) return window.showNotification("⚠️ Debes seleccionar al menos una cuenta del inventario para entregar.");
    }

    const precioTotal = parseFloat(document.getElementById(`precio_venta_${pedidoId}`).value) || 0;

    // 🔥 NUEVA VENTANITA UNIFICADA (MESES EN LÍNEA + TARJETAS DE DATOS)
    const confirmacion = await Swal.fire({
        title: 'Configurar Entrega',
        html: `
            <div style="text-align: left; display: flex; flex-direction: column; gap: 15px;">
                
                <!-- BLOQUE 1: Meses (Todo en una fila) -->
                <div style="background: var(--mac-bg); padding: 15px; border-radius: 12px; border: 1px dashed var(--mac-border); display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <label style="font-size: 13px; font-weight: bold; color: var(--mac-text-main); margin: 0;">¿Por cuántos meses pagó?</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" id="swal-meses-venta" value="1" min="1" style="width: 55px; text-align: center; font-size: 16px; font-weight: bold; padding: 6px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text-main); outline: none;">
                        <span style="font-size: 13px; color: var(--mac-text-secondary); font-weight: bold;">Mes(es)</span>
                    </div>
                </div>
                
                <!-- BLOQUE 2: Datos a enviar (Tarjetas Premium) -->
                <div style="background: var(--mac-bg); padding: 15px; border-radius: 12px; border: 1px dashed var(--mac-border);">
                    <label style="font-size: 13px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 12px; display: block;">¿Qué datos enviarás por WhatsApp?</label>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                            <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">📧 Correo</span>
                            <input type="checkbox" id="chk-correo" checked style="display:none;">
                            <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                        </label>
                        
                        <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                            <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">🔑 Clave</span>
                            <input type="checkbox" id="chk-pass" checked style="display:none;">
                            <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                        </label>
                        
                        <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                            <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">👤 N° Perfil</span>
                            <input type="checkbox" id="chk-perfil" checked style="display:none;">
                            <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                        </label>
                        
                        <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                            <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">📌 PIN</span>
                            <input type="checkbox" id="chk-pin" checked style="display:none;">
                            <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                        </label>
                    </div>
                    
                    <p style="font-size: 10px; color: var(--mac-text-secondary); margin: 10px 0 0 0; line-height: 1.3;">* El sistema siempre guardará todos los datos completos en tu panel por seguridad.</p>
                </div>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="bx bx-send"></i> Aprobar y Enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#34C759',
        cancelButtonColor: '#FF3B30',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        preConfirm: () => {
            return {
                meses: parseInt(document.getElementById('swal-meses-venta').value) || 1,
                sendCorreo: document.getElementById('chk-correo').checked,
                sendPass: document.getElementById('chk-pass').checked,
                sendPerfil: document.getElementById('chk-perfil').checked,
                sendPin: document.getElementById('chk-pin').checked
            };
        }
    });

    if (!confirmacion.isConfirmed) return;
    const mesesContratados = confirmacion.value.meses;
    const opcEnvio = confirmacion.value; // Guardamos qué casillas marcó

    try {
        window.showNotification("⏳ Procesando entrega...");

        let stock = currentUserData.inventory || [];
        let cuentasEntregar = [];

        // Calcular fecha
        const h = new Date();
        h.setDate(h.getDate() + (mesesContratados * 30));
        const dateFirebase = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
        const dateWhatsApp = h.toLocaleDateString('es-ES');

        const numeroLimpio = numeroCliente.replace(/[^\d]/g, '');
        const numeroBonito = "+" + numeroLimpio;
        const rulesDB = currentUserData.platformRules || {};

        let primerClienteId = null;
        let textoFinal = "";

        if (requiereInvitacion) {
            // LÓGICA DE INVITACIÓN DIRECTA
            const rulesText = rulesDB[plataforma] || "";
            const multiAcc = {};
            multiAcc[plataforma] = window.getDefaultAccData();
            multiAcc[plataforma].email = clienteCorreo;
            multiAcc[plataforma].profile = perfilMatriz;
            multiAcc[plataforma].months = mesesContratados;
            multiAcc[plataforma].masterAccountId = matrizId;
            multiAcc[plataforma].saleType = 'Perfil';

            const docRef = await addDoc(collection(db, "clients"), {
                userId: currentUser.uid,
                name: nombreCliente,
                phone: numeroBonito,
                platform: plataforma,
                accountEmail: clienteCorreo,
                accountPassword: "",
                accountPin: "",
                accountProfile: perfilMatriz,
                accountUnits: 1,
                accountMonths: mesesContratados,
                cost: 0,
                price: precioTotal,
                date: dateFirebase,
                linkedMasterId: matrizId,
                multiAccounts: multiAcc,
                color: macPalette[Math.floor(Math.random() * macPalette.length)]
            });
            primerClienteId = docRef.id;

            let reglasStr = rulesText ? `\n⚠️ *Reglas:* ${rulesText}` : "";
            textoFinal = `🎉 *¡Gracias por tu compra!*\n\nLa invitación de *${plataforma}* ha sido enviada con éxito a tu correo: *${clienteCorreo}*.\n\n📅 *Vence el:* ${dateWhatsApp}${reglasStr}\n\n¡Revisa tu bandeja de entrada y acepta la invitación para empezar a disfrutar del servicio! 🍿`;

        } else {
            // LÓGICA TRADICIONAL (INVENTARIO)
            for (let id of cuentasIds) {
                const acc = stock.find(c => c.id === id);
                if (!acc) return window.showNotification("Error: Una cuenta ya no está en stock.");
                cuentasEntregar.push(acc);
            }

            const precioDividido = precioTotal / cuentasIds.length;
            for (let cuenta of cuentasEntregar) {
                let matrizAsignada = null;
                const qMatriz = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid), where("email", "==", cuenta.email));
                const snapMatriz = await getDocs(qMatriz);
                if (!snapMatriz.empty) matrizAsignada = snapMatriz.docs[0].id;

                const docRef = await addDoc(collection(db, "clients"), {
                    userId: currentUser.uid,
                    name: "Cliente Nuevo", phone: numeroBonito, platform: cuenta.platform,
                    accountEmail: cuenta.email, accountPassword: cuenta.pass,
                    accountPin: cuenta.pin, accountProfile: cuenta.profile || "1",
                    accountUnits: 1, accountMonths: mesesContratados, cost: 0, price: precioDividido,
                    date: dateFirebase, linkedMasterId: matrizAsignada,
                    color: macPalette[Math.floor(Math.random() * macPalette.length)]
                });

                if (!primerClienteId) primerClienteId = docRef.id;
                cuenta.rules = rulesDB[cuenta.platform] || "Uso personal, no modificar los datos de acceso.";
                stock = stock.filter(item => item.id !== cuenta.id);
            }
            await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
            currentUserData.inventory = stock;

            let bloqueCuentas = "";
            cuentasEntregar.forEach((c, index) => {
                bloqueCuentas += `\n🍿 *CUENTA ${index + 1}: ${c.platform}*\n`;
                if (opcEnvio.sendCorreo) bloqueCuentas += `📧 *Correo:* ${c.email}\n`;
                if (opcEnvio.sendPass) bloqueCuentas += `🔑 *Clave:* ${c.pass}\n`;
                if (opcEnvio.sendPerfil) bloqueCuentas += `👤 *Perfil:* ${c.profile || '1'}\n`;
                if (opcEnvio.sendPin) bloqueCuentas += `📌 *PIN:* ${c.pin || 'N/A'}\n`;
                bloqueCuentas += `⚠️ *Reglas:* ${c.rules}\n`;
            });

            let templateMsg = currentUserData.waDeliveryMessage || `🎉 *¡Gracias por tu compra!*\n\nAquí tienes los datos de tus cuentas:\n{bloqueCuentas}\n📅 *Vence el:* {fecha}\n\n¡Que disfrutes el contenido! 🍿`;

            // Verificamos si el usuario borró la variable {bloqueCuentas} de su plantilla
            if (!templateMsg.includes('{bloqueCuentas}')) {
                templateMsg = `🎉 *¡Gracias por tu compra!*\n\nAquí tienes los datos de tus cuentas:\n{bloqueCuentas}\n📅 *Vence el:* {fecha}\n\n¡Que disfrutes el contenido! 🍿`;
            }

            textoFinal = templateMsg
                .replace(/{nombre}/g, nombreCliente)
                .replace(/{bloqueCuentas}/g, bloqueCuentas)
                .replace(/{fecha}/g, dateWhatsApp || '');
        }

        await updateDoc(doc(db, "pedidos", pedidoId), { estado: "aprobado" });
        // --- NUEVO: ACTUALIZAR ESTADÍSTICAS DE LA TIENDA TRAS LA VENTA ---
        try {
            const newSalesCount = (currentUserData.storeSalesCount || 0) + 1;
            const newRevenue = (currentUserData.storeRevenue || 0) + precioTotal;
            await updateDoc(doc(db, "users", currentUser.uid), {
                storeSalesCount: newSalesCount,
                storeRevenue: newRevenue
            });
            currentUserData.storeSalesCount = newSalesCount;
            currentUserData.storeRevenue = newRevenue;
        } catch (errStoreStats) {
            console.error("Error actualizando stats de la tienda:", errStoreStats);
        }
        window.renderInventory();
        loadUserClients();

        const plan = (currentUserData.plan_actual || 'demo').toLowerCase();

        if (plan === 'pro' || plan === 'elite') {
            const payloadEntrega = {
                distribuidorId: currentUser.uid,
                numeroCliente: numeroLimpio + '@s.whatsapp.net',
                cuentas: requiereInvitacion ? [{ platform: plataforma }] : cuentasEntregar,
                fechaVencimiento: dateWhatsApp,
                mensajeEntrega: textoFinal
            };

            fetch('https://bot.panelagc.com/api/entregar-cuenta', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadEntrega)
            }).catch(err => console.error("Error de red al contactar al bot:", err));

            Swal.fire({
                icon: 'success', title: '¡Venta Aprobada!',
                html: '<p style="color:var(--mac-text-secondary);">El Bot ya le está enviando la información al cliente.</p><p style="margin-top:10px; font-size:14px; font-weight:bold;">¿Deseas completar el nombre del cliente ahora?</p>',
                confirmButtonColor: '#34C759', confirmButtonText: 'Completar Datos', showCancelButton: true, cancelButtonText: 'Más Tarde',
                background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff', color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
            }).then((result) => {
                if (result.isConfirmed && primerClienteId) {
                    window.closeModals(true); window.switchMainTab('clientes'); window.startEdit(primerClienteId);
                } else { window.openPedidosModal(); }
            });

        } else {
            const waUrl = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(textoFinal)}`;
            window.open(waUrl, '_blank');

            Swal.fire({
                icon: 'success', title: '¡Venta Aprobada!',
                html: `<div style="margin-bottom:15px;"><a href="${waUrl}" target="_blank" style="display:inline-block; background:#25D366; color:white; padding:10px 15px; border-radius:8px; text-decoration:none; font-weight:bold;"><i class="bx bxl-whatsapp"></i> Reenviar Accesos (Clic Aquí)</a></div><p style="margin-top:10px; font-size:14px; font-weight:bold;">2. ¿Deseas completar el nombre del cliente ahora?</p>`,
                confirmButtonText: 'Completar Datos', confirmButtonColor: '#007AFF', showCancelButton: true, cancelButtonText: 'Más Tarde', allowOutsideClick: false,
                background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff', color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
            }).then((result) => {
                if (result.isConfirmed && primerClienteId) {
                    window.closeModals(true); window.switchMainTab('clientes'); window.startEdit(primerClienteId);
                } else { window.openPedidosModal(); }
            });
        }

    } catch (e) {
        console.error(e); window.showNotification("Error: " + e.message);
    }
};

window.aprobarRenovacionPedido = async (pedidoId, clientId, plataforma, precioVenta) => {
    // 1. Buscamos primero en la memoria rápida (los últimos 30 clientes cargados)
    let c = clients.find(x => x.id === clientId);

    // 2. Si no está en la memoria rápida, lo buscamos directo en la Base de Datos
    if (!c) {
        try {
            const docSnap = await getDoc(doc(db, "clients", clientId));
            if (docSnap.exists()) {
                c = { id: docSnap.id, ...docSnap.data() };
            }
        } catch (err) {
            console.error("Error buscando cliente en BD:", err);
        }
    }

    if (!c) return window.showNotification("Error: El cliente ya no existe en tu base.");

    let [year, month, day] = c.date.split('-');
    let fechaAntigua = new Date(year, month - 1, day);
    const antiguaFechaBonita = fechaAntigua.toLocaleDateString('es-ES');

    window.currentRenewType = 'mes';
    window.currentRenewBaseDate = fechaAntigua;

    // 🔥 FIX: 1. Función para actualizar los números en tiempo real al escribir
    window.updateRenewDates = () => {
        let meses = parseInt(document.getElementById('swal-renew-months').value) || 1;

        let dMes = new Date(window.currentRenewBaseDate);
        dMes.setMonth(dMes.getMonth() + meses);
        document.getElementById('date-mes').innerText = dMes.toLocaleDateString('es-ES');

        let d30 = new Date(window.currentRenewBaseDate);
        d30.setDate(d30.getDate() + (30 * meses));
        document.getElementById('date-30d').innerText = d30.toLocaleDateString('es-ES');
    };

    // 🔥 FIX: 2. Función para iluminar la tarjeta que el usuario seleccione
    window.selectRenewOpt = (type) => {
        window.currentRenewType = type;
        const cardMes = document.getElementById('optMesAMes');
        const card30d = document.getElementById('opt30Dias');

        if (type === 'mes') {
            cardMes.style.border = '2px solid var(--mac-blue)';
            cardMes.style.background = 'rgba(0, 122, 255, 0.15)';
            card30d.style.border = '1px solid var(--mac-border)';
            card30d.style.background = 'var(--mac-bg)';
        } else {
            card30d.style.border = '2px solid var(--mac-blue)';
            card30d.style.background = 'rgba(0, 122, 255, 0.15)';
            cardMes.style.border = '1px solid var(--mac-border)';
            cardMes.style.background = 'var(--mac-bg)';
        }
    };

    // 🔥 FIX: 3. Calculamos los valores iniciales (1 mes por defecto)
    let initMes = new Date(fechaAntigua); initMes.setMonth(initMes.getMonth() + 1);
    let init30d = new Date(fechaAntigua); init30d.setDate(init30d.getDate() + 30);

    const { value: confirmacion } = await Swal.fire({
        title: '🔄 Configurar Renovación',
        html: `
            <p style="color: var(--mac-text-secondary); font-size: 14px; margin-bottom: 15px;">
                Vencimiento actual: <strong style="color: var(--mac-text-main);">${antiguaFechaBonita}</strong>
            </p>
            <div style="display:flex; align-items:center; justify-content:center; gap: 10px; margin-bottom: 20px;">
                <label style="font-size: 14px; font-weight: bold; color: var(--mac-text-main);">Renovar por:</label>
                <input type="number" id="swal-renew-months" value="1" min="1" max="99" oninput="window.updateRenewDates()" style="width: 60px; text-align: center; font-size: 18px; font-weight: bold; padding: 8px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-blue); outline: none;">
                <label style="font-size: 14px; font-weight: bold; color: var(--mac-text-main);">mes(es)</label>
            </div>
            <p style="font-size: 11px; color: var(--mac-text-secondary); font-weight: bold; text-transform: uppercase; margin-bottom: 10px;">Selecciona la modalidad de cálculo:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div id="optMesAMes" onclick="window.selectRenewOpt('mes')" style="cursor: pointer; background: rgba(0, 122, 255, 0.15); padding: 15px 10px; border-radius: 12px; border: 2px solid var(--mac-blue); transition: 0.2s; display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 5px;">📆 Fecha a Fecha</span>
                    <strong id="date-mes" style="font-size: 16px; color: var(--mac-blue); margin-top: 8px;">${initMes.toLocaleDateString('es-ES')}</strong>
                </div>
                <div id="opt30Dias" onclick="window.selectRenewOpt('30d')" style="cursor: pointer; background: var(--mac-bg); padding: 15px 10px; border-radius: 12px; border: 1px solid var(--mac-border); transition: 0.2s; display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: var(--mac-text-main); margin-bottom: 5px;">🔢 30 Días Exactos</span>
                    <strong id="date-30d" style="font-size: 16px; color: var(--mac-blue); margin-top: 8px;">${init30d.toLocaleDateString('es-ES')}</strong>
                </div>
            </div>
        `,
        didOpen: () => { window.updateRenewDates(); },
        showCancelButton: true,
        confirmButtonColor: 'var(--mac-blue)',
        cancelButtonColor: 'var(--mac-gray)',
        confirmButtonText: 'Aprobar Renovación',
        cancelButtonText: '<span style="color:var(--mac-text-main)">Cancelar</span>',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        preConfirm: () => {
            const meses = parseInt(document.getElementById('swal-renew-months').value) || 1;
            let finalDate = new Date(window.currentRenewBaseDate);
            if (window.currentRenewType === 'mes') finalDate.setMonth(finalDate.getMonth() + meses);
            else finalDate.setDate(finalDate.getDate() + (30 * meses));
            return finalDate;
        }
    });

    if (confirmacion) {
        try {
            window.showNotification("⏳ Actualizando fecha...");
            let fechaNueva = confirmacion;
            const strFirebase = `${fechaNueva.getFullYear()}-${String(fechaNueva.getMonth() + 1).padStart(2, '0')}-${String(fechaNueva.getDate()).padStart(2, '0')}`;
            const nuevaFechaBonita = fechaNueva.toLocaleDateString('es-ES');

            // 1. Desaparecemos el pedido
            await updateDoc(doc(db, "pedidos", pedidoId), { estado: "aprobado" });

            // 2. Aplicamos la renovación al cliente
            const nuevasRenovaciones = (c.renovations || 0) + 1;
            await updateDoc(doc(db, "clients", clientId), { date: strFirebase, renovations: nuevasRenovaciones });

            // 3. Sumar ganancias a las estadísticas
            const precioTotalValidado = parseFloat(document.getElementById(`precio_venta_${pedidoId}`).value) || precioVenta;
            const newRevenue = (currentUserData.storeRevenue || 0) + precioTotalValidado;
            await updateDoc(doc(db, "users", currentUser.uid), { storeRevenue: newRevenue });
            currentUserData.storeRevenue = newRevenue;

            // 4. Preparamos el Mensaje
            const plan = (currentUserData.plan_actual || 'demo').toLowerCase();
            let baseMsg = currentUserData.waRenewMessage || "🎉 *¡Renovación Exitosa, {nombre}!*\n\nTu servicio de *{plataforma}* ha sido renovado correctamente.\n📅 Nueva fecha de vencimiento: *{fecha}*\n\n🌐 *Tu Portal:* {link}\n🔑 *Código Web:* {codigo}\n\n¡Gracias por seguir confiando en nosotros! 🚀";

            const baseUrl = window.location.origin + window.location.pathname;
            const portalAlias = currentUserData.storeAlias || currentUser.uid;
            const portalUrl = `${baseUrl}?portal=${portalAlias}`;

            let finalMsg = baseMsg
                .replace(/{nombre}/g, c.name)
                .replace(/{plataforma}/g, plataforma)
                .replace(/{fecha}/g, nuevaFechaBonita)
                .replace(/{precio}/g, precioTotalValidado.toFixed(2))
                .replace(/{moneda}/g, currentUserData.currency || "S/")
                .replace(/{link}/g, portalUrl)
                .replace(/{numero}/g, c.phone)
                .replace(/{codigo}/g, c.portalCode || 'N/A');

            // 5. Enviar mensaje por bot o WA
            if (plan === 'pro' || plan === 'elite') {
                fetch('https://bot.panelagc.com/api/confirmar-renovacion', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ distribuidorId: currentUser.uid, numeroCliente: c.phone, plataforma: plataforma, nuevaFecha: nuevaFechaBonita, mensajeRenovacion: finalMsg })
                });
                window.showNotification("✅ Renovación completada. El bot avisará al cliente.");
            } else {
                const numeroLimpio = c.phone.replace(/[^\d]/g, '');
                window.open(`https://wa.me/${numeroLimpio}?text=${encodeURIComponent(finalMsg)}`, '_blank');
                window.showNotification("✅ Renovación completada en la BD.");
            }

            window.openPedidosModal(); // Refrescar modal
            loadUserClients(); // Refrescar tabla de fondo
        } catch (error) { window.showNotification("Error: " + error.message); }
    }
};

/* ========================================== MÓDULO DE CUENTAS MATRICES (ESTILO MATRIZ) ========================================== */
let variablesEnlaceMatriz = { masterId: null, profileNum: null };
let editingMasterId = null;
window.masterAlertShown = false;

// Ocultar o mostrar campos adicionales según el origen de la cuenta
window.toggleMatProviderFields = () => {
    const provider = document.getElementById('matProvider').value;
    const extFields = document.getElementById('externalProviderFields');
    if (extFields) {
        extFields.style.display = (provider === 'Proveedor Externo') ? 'flex' : 'none';
    }
};

// 1. ABRIR MODAL PARA NUEVA CUENTA
window.openNewMasterAccountModal = () => {
    editingMasterId = null;
    document.getElementById('matEmail').value = '';
    document.getElementById('matPass').value = '';
    document.getElementById('matProfiles').value = '5';
    document.getElementById('matCost').value = '0';
    document.getElementById('matProvider').value = 'Propia';
    document.getElementById('matExpiryDate').value = '';
    document.getElementById('matProviderName').value = '';

    window.toggleMatProviderFields();
    document.querySelector('#masterAccountModal h3').innerHTML = "<i class='bx bx-plus-circle'></i> Nueva Cuenta Matriz";
    document.getElementById('masterAccountModal').style.display = 'flex';
};

// 2. ABRIR MODAL PARA EDITAR
window.editMasterAccount = (id, platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName) => {
    editingMasterId = id;

    document.getElementById('matPlatform').value = platform;
    document.getElementById('matEmail').value = email;
    document.getElementById('matPass').value = pass;
    document.getElementById('matProfiles').value = maxProfiles;
    document.getElementById('matCost').value = cost;
    document.getElementById('matProvider').value = provider;
    document.getElementById('matExpiryDate').value = expiryDate || '';
    document.getElementById('matProviderName').value = providerName || '';

    window.toggleMatProviderFields();
    document.querySelector('#masterAccountModal h3').innerHTML = "<i class='bx bx-edit'></i> Editar Cuenta Matriz";
    document.getElementById('masterAccountModal').style.display = 'flex';
};

// 3. ELIMINAR CUENTA MATRIZ
window.deleteMasterAccount = async (id) => {
    Swal.fire({
        title: '¿Eliminar Cuenta Matriz?',
        text: "Los clientes vinculados no se borrarán, pero perderán su enlace a esta cuenta.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#FF3B30',
        confirmButtonText: 'Eliminar Matriz',
        cancelButtonText: '<span style="color:var(--mac-text-main)">Cancelar</span>',
        cancelButtonColor: 'var(--mac-gray)',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "masterAccounts", id));
                window.showNotification("🗑️ Cuenta Matriz eliminada");
                window.renderMasterAccounts();
            } catch (e) { window.showNotification("Error: " + e.message); }
        }
    });
};

// 4. GUARDAR (CREAR O ACTUALIZAR), SINCRONIZAR Y AVISAR POR BOT
window.saveMasterAccount = async () => {
    const platform = document.getElementById('matPlatform').value;
    const email = document.getElementById('matEmail').value.trim();
    const pass = document.getElementById('matPass').value.trim();
    const maxProfiles = parseInt(document.getElementById('matProfiles').value) || 5;
    const cost = parseFloat(document.getElementById('matCost').value) || 0;
    const provider = document.getElementById('matProvider').value;
    const expiryDate = provider === 'Proveedor Externo' ? document.getElementById('matExpiryDate').value : '';
    const providerName = provider === 'Proveedor Externo' ? document.getElementById('matProviderName').value.trim() : '';

    if (!email || !pass) return window.showNotification("⚠️ Escribe el correo y clave de la cuenta.");

    try {
        const plan = (currentUserData.plan_actual || 'demo').toLowerCase();

        if (!editingMasterId) {
            const qMatCount = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
            const snapMatCount = await getDocs(qMatCount);
            if (snapMatCount.size >= 20 && plan === 'basico') {
                return window.showNotification("⚠️ El Plan Básico te permite hasta 20 Cuentas Matrices. Actualiza a PRO para ilimitadas.");
            }
        }

        if (editingMasterId) {
            // 1. Detectamos a los clientes afectados ANTES de guardar en la BD
            const qCli = query(collection(db, "clients"), where("userId", "==", currentUser.uid));
            const snapCli = await getDocs(qCli);
            let clientesAfectados = [];

            snapCli.forEach(d => {
                const c = d.data();
                let isAffected = false;
                let platName = "";
                let profileStr = "";
                let pinStr = "";

                // Buscar en modelo antiguo
                if (c.linkedMasterId === editingMasterId) {
                    if (c.accountEmail !== email || c.accountPassword !== pass) {
                        isAffected = true; platName = c.platform; profileStr = c.accountProfile; pinStr = c.accountPin;
                    }
                }

                // Buscar en modelo nuevo (multipestaña)
                if (c.multiAccounts) {
                    for (let platKey in c.multiAccounts) {
                        if (c.multiAccounts[platKey].masterAccountId === editingMasterId) {
                            if (c.multiAccounts[platKey].email !== email || c.multiAccounts[platKey].password !== pass) {
                                isAffected = true; platName = platKey; profileStr = c.multiAccounts[platKey].profile; pinStr = c.multiAccounts[platKey].pin;
                            }
                        }
                    }
                }

                if (isAffected) {
                    clientesAfectados.push({ id: d.id, data: c, name: c.name, phone: c.phone, platform: platName, profile: profileStr, pin: pinStr });
                }
            });

            let clientesParaNotificar = [];
            let opcionesEnvio = { correo: true, clave: true, perfil: true, pin: true };

            const plan = (currentUserData.plan_actual || 'demo').toLowerCase();

            // 2. Si hay clientes afectados y es PRO, lanzamos el Modal Interactivo
            if (clientesAfectados.length > 0 && (plan === 'pro' || plan === 'elite')) {
                // Dibujamos las tarjetas de los clientes con el check activo por defecto
                let htmlClientes = clientesAfectados.map((c) => `
                    <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s; margin-bottom: 5px;">
                        <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">👤 ${c.name} <span style="font-size:11px; color:var(--mac-text-secondary); font-weight:normal;">(${c.platform})</span></span>
                        <input type="checkbox" class="swal-client-chk" value="${c.id}" checked style="display:none;">
                        <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                    </label>
                `).join('');

                const { value: confirmData, isConfirmed } = await Swal.fire({
                    title: '🔄 Notificar Actualización',
                    html: `
                        <p style="font-size:13px; color:var(--mac-text-secondary); text-align:left; margin-bottom:15px;">Has cambiado los datos de esta cuenta. Selecciona a qué clientes deseas notificarles por WhatsApp:</p>
                        <div style="max-height: 180px; overflow-y: auto; text-align: left; margin-bottom: 15px; padding-right: 5px;">
                            ${htmlClientes}
                        </div>
                        <p style="font-size:13px; color:var(--mac-text-main); text-align:left; font-weight:bold; margin-bottom:10px;">¿Qué datos enviarás en el aviso?</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align:left;">
                            <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                                <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">📧 Correo</span>
                                <input type="checkbox" id="chk-upd-correo" checked style="display:none;">
                                <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                            </label>
                            <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                                <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">🔑 Clave</span>
                                <input type="checkbox" id="chk-upd-pass" checked style="display:none;">
                                <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                            </label>
                            <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                                <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">👤 N° Perfil</span>
                                <input type="checkbox" id="chk-upd-perfil" checked style="display:none;">
                                <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                            </label>
                            <label onclick="window.toggleSwalChk(this)" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--mac-green); background: rgba(52, 199, 89, 0.15); transition: all 0.2s;">
                                <span style="font-size: 13px; color: var(--mac-text-main); font-weight: bold;">📌 PIN</span>
                                <input type="checkbox" id="chk-upd-pin" checked style="display:none;">
                                <i class='bx bx-check-circle' style="color: var(--mac-green); font-size: 18px;"></i>
                            </label>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '<i class="bx bx-send"></i> Guardar y Notificar',
                    cancelButtonText: 'Solo Guardar',
                    confirmButtonColor: '#34C759',
                    cancelButtonColor: '#8E8E93',
                    background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
                    color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
                    preConfirm: () => {
                        const selectedClients = Array.from(document.querySelectorAll('.swal-client-chk:checked')).map(chk => chk.value);
                        return {
                            selectedClients,
                            correo: document.getElementById('chk-upd-correo').checked,
                            clave: document.getElementById('chk-upd-pass').checked,
                            perfil: document.getElementById('chk-upd-perfil').checked,
                            pin: document.getElementById('chk-upd-pin').checked
                        };
                    }
                });

                // Si presionó el botón Verde (Guardar y Notificar)
                if (isConfirmed) {
                    const idsNotificar = confirmData.selectedClients;
                    clientesParaNotificar = clientesAfectados.filter(c => idsNotificar.includes(c.id));
                    opcionesEnvio = confirmData;
                }
                // Si presionó Cancelar o la 'X', la longitud de clientesParaNotificar se queda en 0 y solo guarda silenciosamente.
            }

            // 3. AHORA PROCEDEMOS A GUARDAR EN LA BD (Haya notificación o no)
            window.showNotification("⏳ Guardando datos...");

            await updateDoc(doc(db, "masterAccounts", editingMasterId), { platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName });

            const updatePromises = [];
            clientesAfectados.forEach(clientObj => {
                const c = clientObj.data;
                let rootUpdates = {};
                let mAccounts = c.multiAccounts || {};

                if (c.linkedMasterId === editingMasterId) {
                    rootUpdates.accountEmail = email;
                    rootUpdates.accountPassword = pass;
                }

                if (c.multiAccounts) {
                    for (let platKey in mAccounts) {
                        if (mAccounts[platKey].masterAccountId === editingMasterId) {
                            mAccounts[platKey].email = email;
                            mAccounts[platKey].password = pass;
                        }
                    }
                    rootUpdates.multiAccounts = mAccounts;
                }

                updatePromises.push(updateDoc(doc(db, "clients", clientObj.id), rootUpdates));
            });

            await Promise.all(updatePromises);
            window.showNotification("✅ Cuenta Matriz y clientes actualizados");
            if (typeof loadUserClients === 'function') loadUserClients();

            // 4. LÓGICA DE NOTIFICACIÓN AL BOT (Solo enviará a los marcados con ✅)
            if (clientesParaNotificar.length > 0) {
                let clientesFormateados = clientesParaNotificar.map(c => {
                    // Armamos el mensaje dinámicamente según los checks de opciones
                    let mensajePersonalizado = `🔄 *¡Actualización de Seguridad!*\n\nHola *${c.name}*, los datos de tu acceso a *${c.platform}* han sido actualizados para garantizar la estabilidad de tu servicio.\n\nAquí tienes tus nuevas credenciales activas:\n`;

                    if (opcionesEnvio.correo) mensajePersonalizado += `\n📧 *Correo:* ${email}`;
                    if (opcionesEnvio.clave) mensajePersonalizado += `\n🔑 *Clave:* ${pass}`;
                    if (opcionesEnvio.perfil) mensajePersonalizado += `\n👤 *Perfil:* ${c.profile || '1'}`;
                    if (opcionesEnvio.pin) mensajePersonalizado += `\n📌 *PIN:* ${c.pin || 'N/A'}`;

                    mensajePersonalizado += `\n\n¡Sigue disfrutando del mejor entretenimiento! 🍿`;

                    return {
                        phone: c.phone,
                        name: c.name,
                        mensaje: mensajePersonalizado
                    };
                });

                fetch('https://bot.panelagc.com/api/actualizar-credenciales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        distribuidorId: currentUser.uid,
                        clientes: clientesFormateados
                    })
                }).catch(e => console.error("Error al contactar al bot para actualizar:", e));

                setTimeout(() => {
                    window.showNotification(`🤖 Bot avisando a ${clientesFormateados.length} cliente(s) seleccionados.`);
                }, 1500);
            }

        } else {
            // MODO CREACIÓN
            await addDoc(collection(db, "masterAccounts"), { userId: currentUser.uid, platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName, timestamp: Date.now() });
            window.showNotification("✅ Cuenta Matriz registrada con éxito");
        }

        document.getElementById('masterAccountModal').style.display = 'none';
        editingMasterId = null;
        window.renderMasterAccounts();
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};

// 5. RENDERIZAR LAS TARJETAS CON BUSCADOR Y ALERTAS OPTIMIZADAS
window.renderMasterAccounts = async () => {
    const container = document.getElementById('masterAccountsList');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary);">Cargando tus matrices...</p>';

    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let alertsContainer = document.getElementById('masterAccountsAlerts');
    if (!alertsContainer) {
        alertsContainer = document.createElement('div');
        alertsContainer.id = 'masterAccountsAlerts';
        alertsContainer.style.cssText = "display: none; flex-direction: column; gap: 8px; margin-bottom: 15px; width:100%;";
        container.parentNode.insertBefore(alertsContainer, container);
    }
    alertsContainer.style.display = 'none';
    alertsContainer.innerHTML = '';

    try {
        const qMat = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
        const snapMat = await getDocs(qMat);

        const qCli = query(collection(db, "clients"), where("userId", "==", currentUser.uid));
        const snapCli = await getDocs(qCli);
        const listaClientes = snapCli.docs.map(d => ({ id: d.id, ...d.data() }));

        if (snapMat.empty) {
            container.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); font-size:13px; padding:2px 0;">No tienes cuentas matrices creadas.</p>';
            return;
        }

        container.innerHTML = '';
        let alertasVencimiento = [];
        let alertasUnicas = new Set();

        let cuentasEncontradas = 0;

        snapMat.forEach(docMat => {
            const acc = docMat.data();
            const accId = docMat.id;

            if (searchTerm) {
                const matchPlatform = acc.platform && acc.platform.toLowerCase().includes(searchTerm);
                const matchEmail = acc.email && acc.email.toLowerCase().includes(searchTerm);
                if (!matchPlatform && !matchEmail) return;
            }

            cuentasEncontradas++;

            // Filtro inteligente que busca en todas las plataformas vinculadas
            const clientesDeEstaCuenta = listaClientes.filter(c => {
                if (c.linkedMasterId === accId) return true; // Soporte para cuentas viejas
                if (c.multiAccounts) {
                    return Object.values(c.multiAccounts).some(acc => acc.masterAccountId === accId);
                }
                return false;
            });
            const cuposOcupados = clientesDeEstaCuenta.length;
            const cuposDisponibles = acc.maxProfiles - cuposOcupados;
            const ingresosTotales = clientesDeEstaCuenta.reduce((sum, c) => sum + (parseFloat(c.price) || 0), 0);
            const gananciaNeta = ingresosTotales - acc.cost;

            let infoVencimientoHTML = '';
            if (acc.provider === 'Proveedor Externo') {
                const nombreProv = acc.providerName ? ` (${acc.providerName})` : '';

                if (acc.expiryDate) {
                    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                    const [year, month, day] = acc.expiryDate.split('-');
                    const fechaVenc = new Date(year, month - 1, day);
                    const diffTime = fechaVenc - hoy;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays === 1) {
                        infoVencimientoHTML = `<br><span style="color: var(--mac-orange); font-size:12px; font-weight:bold;">📅 Vence MAÑANA: ${acc.expiryDate}${nombreProv} ⏳</span>`;
                        if (!alertasUnicas.has(accId)) {
                            alertasVencimiento.push(`⚠️ Tu cuenta completa <strong>${acc.platform}</strong> (${acc.email}) vence <strong>mañana</strong>.`);
                            alertasUnicas.add(accId);
                        }
                    } else if (diffDays === 0) {
                        infoVencimientoHTML = `<br><span style="color: var(--mac-red); font-size:12px; font-weight:bold;">🚨 Vence HOY: ${acc.expiryDate}${nombreProv} ⚠️</span>`;
                        if (!alertasUnicas.has(accId)) {
                            alertasVencimiento.push(`🚨 ¡ATENCIÓN! Tu cuenta completa <strong>${acc.platform}</strong> (${acc.email}) vence <strong>HOY</strong>.`);
                            alertasUnicas.add(accId);
                        }
                    } else if (diffDays < 0) {
                        infoVencimientoHTML = `<br><span style="color: var(--mac-red); font-size:12px;">❌ VENCIDA HACE ${Math.abs(diffDays)} DÍAS${nombreProv}</span>`;
                    } else {
                        infoVencimientoHTML = `<br><small style="color: var(--mac-text-secondary);">Origen: <strong>${acc.provider}${nombreProv}</strong> | Vence: ${acc.expiryDate}</small>`;
                    }
                } else {
                    infoVencimientoHTML = `<br><small style="color: var(--mac-text-secondary);">Origen: <strong>${acc.provider}${nombreProv}</strong> | <span style="color:var(--mac-orange);">Falta fecha</span></small>`;
                }
            } else {
                infoVencimientoHTML = `<br><small style="color: var(--mac-text-secondary);">Origen: <strong>Cuenta Propia</strong></small>`;
            }

            const card = document.createElement('div');
            card.style.cssText = "background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";

            const pPlat = acc.platform.replace(/'/g, "\\'");
            const pMail = acc.email.replace(/'/g, "\\'");
            const pPass = acc.pass.replace(/'/g, "\\'");
            const pProv = acc.provider.replace(/'/g, "\\'");
            const pExp = (acc.expiryDate || '').replace(/'/g, "\\'");
            const pPName = (acc.providerName || '').replace(/'/g, "\\'");

            let headerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--mac-border); padding-bottom: 12px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <span style="background: var(--mac-blue); color: white; font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 20px; display: inline-block; margin-bottom: 5px;">${acc.platform}</span>
                        <h4 style="margin: 0; color: var(--mac-text-main); font-size: 16px;">📧 ${acc.email} <span style="font-weight:normal; color:var(--mac-text-secondary); font-size:13px;">(Clave: ${acc.pass})</span></h4>
                        ${infoVencimientoHTML}
                    </div>
                    <div style="text-align: right; min-width: 120px;">
                        <span style="color: ${cuposDisponibles > 0 ? 'var(--mac-green)' : 'var(--mac-orange)'}; font-weight: bold; font-size: 14px;">Disponibles: ${cuposDisponibles}/${acc.maxProfiles}</span><br>
                        <span style="color: var(--mac-green); font-weight: 900; font-size: 13px;">Ganancia Neta: ${globalCurrency}${gananciaNeta.toFixed(2)}</span>
                        
                        <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: flex-end;">
                            <button onclick="window.editMasterAccount('${accId}', '${pPlat}', '${pMail}', '${pPass}', ${acc.maxProfiles}, ${acc.cost}, '${pProv}', '${pExp}', '${pPName}')" style="background: var(--mac-gray); border: 1px solid var(--mac-border); color: var(--mac-text-main); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;"><i class='bx bx-edit'></i></button>
                            <button onclick="window.deleteMasterAccount('${accId}')" style="background: rgba(255, 59, 48, 0.1); border: 1px solid var(--mac-red); color: var(--mac-red); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;"><i class='bx bx-trash'></i></button>
                            <button onclick="window.sendFreeProfilesToInventory('${accId}')" style="background: rgba(52, 199, 89, 0.1); border: 1px solid var(--mac-green); color: var(--mac-green); padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: 0.2s;" title="Enviar perfiles libres al inventario"><i class='bx bx-archive-in'></i></button>
                        </div>
                    </div>
                </div>
            `;

            let perfilesHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;">`;

            for (let i = 1; i <= acc.maxProfiles; i++) {
                // NUEVA LÓGICA MULTI-PLATAFORMA Y MULTI-PERFIL CORREGIDA
                const clienteEnPerfil = clientesDeEstaCuenta.find(c => {
                    let pName = null;
                    if (c.multiAccounts) {
                        // 🔥 Búsqueda exacta: Solo mirar la cuenta vinculada a ESTA matriz
                        const linkedAcc = Object.values(c.multiAccounts).find(a => a.masterAccountId === accId);

                        if (linkedAcc) {
                            pName = linkedAcc.profile;
                        } else if (c.linkedMasterId === accId && c.multiAccounts[acc.platform]) {
                            // Fallback de seguridad para clientes antiguos
                            pName = c.multiAccounts[acc.platform].profile;
                        }
                    } else {
                        pName = c.accountProfile;
                    }

                    if (!pName) return false;

                    // Extrae todos los números (Soporta múltiples perfiles separados por comas)
                    const numerosEncontrados = String(pName).match(/\d+/g);
                    if (!numerosEncontrados) return false;

                    // Verifica si la ranura actual (i) coincide
                    return numerosEncontrados.some(num => parseInt(num) === i);
                });
                if (clienteEnPerfil) {
                    perfilesHTML += `
                        <div style="background: rgba(255, 159, 10, 0.08); border: 1px solid var(--mac-orange); padding: 10px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; min-height: 85px;">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                                    <strong style="color: var(--mac-orange); font-size: 12px;">👤 Perfil ${i}</strong>
                                    <button class="action-btn" onclick="window.editarClienteDesdeMatriz('${clienteEnPerfil.id}')" style="background:none; border:none; padding:0; cursor:pointer; color:var(--mac-text-secondary); font-size:12px;"><i class='bx bx-edit-alt'></i></button>
                                </div>
                                <span style="color: var(--mac-text-main); font-size: 13px; font-weight: bold; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${clienteEnPerfil.name}</span>
                                <small style="color: var(--mac-text-secondary); font-size: 11px;">Vence: ${clienteEnPerfil.date}</small>
                            </div>
                        </div>
                    `;
                } else {
                    perfilesHTML += `
                        <div style="background: rgba(48, 209, 88, 0.05); border: 1px dashed var(--mac-green); padding: 10px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; min-height: 85px;">
                            <div>
                                <strong style="color: var(--mac-green); font-size: 12px; display: block; margin-bottom: 4px;">🟢 Perfil ${i} Libre</strong>
                            </div>
                            <button class="btn-primary" style="font-size: 11px; padding: 4px 8px; width: 100%; text-align: center; background: rgba(48, 209, 88, 0.15); color: var(--mac-green); border: 1px solid var(--mac-green);" onclick="window.vincularClienteAMatriz('${accId}', '${pPlat}', '${pMail}', '${pPass}', ${i}, ${acc.cost}, ${acc.maxProfiles})">
                                <i class='bx bx-plus'></i> Asignar
                            </button>
                        </div>
                    `;
                }
            }

            perfilesHTML += `</div>`;
            card.innerHTML = headerHTML + perfilesHTML;
            container.appendChild(card);
        });

        if (cuentasEncontradas === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); font-size:13px; padding:2px 0;">No se encontraron cuentas con esa búsqueda.</p>';
        }

        if (alertasVencimiento.length > 0) {
            alertsContainer.style.display = 'flex';
            alertasVencimiento.forEach(alerta => {
                const box = document.createElement('div');
                const esHoy = alerta.includes('HOY');
                box.style.cssText = `padding: 12px 15px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; border: 1px solid ${esHoy ? 'var(--mac-red)' : 'var(--mac-orange)'}; background: ${esHoy ? 'rgba(255,59,48,0.12)' : 'rgba(255,149,0,0.12)'}; color: ${esHoy ? 'var(--mac-red)' : 'var(--mac-orange)'};`;
                box.innerHTML = alerta;
                alertsContainer.appendChild(box);
            });

            if (!window.masterAlertShown) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Cuentas Matrices',
                    html: `<div style="text-align:left; font-size:14px; display:flex; flex-direction:column; gap:8px; margin-top:10px;">${alertasVencimiento.map(a => `<p style="margin:0;">${a}</p>`).join('')}</div>`,
                    confirmButtonText: 'Entendido',
                    confirmButtonColor: '#007AFF',
                    background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
                    color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
                });
                window.masterAlertShown = true;
            }
        }

    } catch (e) {
        container.innerHTML = `<p style="text-align:center; color:var(--mac-orange);">Error cargando matrices: ${e.message}</p>`;
    }
};

// 7. ACCIÓN PARA SALTAR AL FORMULARIO DE CLIENTE DESDE LA MATRIZ
window.vincularClienteAMatriz = (masterId, platform, email, pass, profileNum, matCost = 0, matMaxProfiles = 1) => {
    variablesEnlaceMatriz.masterId = masterId;
    variablesEnlaceMatriz.profileNum = profileNum;

    editingClientId = null;
    document.getElementById('clientForm').reset();
    document.getElementById('clientName').value = "Perfil " + profileNum;

    // --- LÓGICA NUEVA: CÁLCULO DE INVERSIÓN AUTOMÁTICA ---
    const costInput = document.getElementById('clientCost');
    if (costInput) {
        const costoCalculado = matMaxProfiles > 0 ? (matCost / matMaxProfiles) : 0;
        costInput.value = costoCalculado.toFixed(2); // Redondeado a 2 decimales
    }
    // -----------------------------------------------------

    const cbs = document.querySelectorAll('#checkboxDropdown input');
    cbs.forEach(cb => cb.checked = false);
    cbs.forEach(cb => { if (cb.value === platform) cb.checked = true; });
    const selectText = document.getElementById('selectText');
    if (selectText) {
        selectText.textContent = platform;
        selectText.classList.add('has-selection');
    }

    multiAccData = {};
    multiAccData[platform] = window.getDefaultAccData();
    multiAccData[platform].email = email;
    multiAccData[platform].password = pass;
    multiAccData[platform].profile = profileNum.toString();
    multiAccData[platform].pin = '';
    multiAccData[platform].units = 1;
    multiAccData[platform].saleType = 'Perfil';
    multiAccData[platform].masterAccountId = masterId; // Asegura el enlace en el nuevo sistema

    // --- INICIO NUEVA LÓGICA: Detectar en Inventario ---
    const stock = currentUserData.inventory || [];
    // Buscamos si este mismo perfil de esta misma cuenta está libre en el inventario
    const invMatch = stock.find(i => i.platform === platform && i.email === email && String(i.profile) === String(profileNum) && i.status === 'libre');
    if (invMatch) {
        // Al inyectar el inventoryId, la función de Guardar Cliente lo eliminará del stock automáticamente
        multiAccData[platform].inventoryId = invMatch.id;
    }
    // --- FIN NUEVA LÓGICA ---

    const btnAcc = document.getElementById('btnAccountData');
    if (btnAcc) {
        btnAcc.innerText = `✅ Datos de Cuenta (1 ud)`;
        btnAcc.style.backgroundColor = "var(--mac-green)";
        btnAcc.style.color = "white";
    }

    window.switchMainTab('clientes');
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
    window.showNotification("Completa el teléfono y el precio de venta para guardar.");
};
/* --- MODAL PARA VINCULAR CLIENTE SUELTO A MATRIZ (MULTIPLE) --- */
window.openLinkModal = async (clientId, clientPlatform) => {
    try {
        // 1. Obtenemos el cliente para respetar sus datos previos (multiAccounts)
        const c = clients.find(x => x.id === clientId);
        if (!c) return window.showNotification("Cliente no encontrado.");

        // 2. Obtenemos las Cuentas Matrices disponibles
        const qMat = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
        const snapMat = await getDocs(qMat);

        let masterDataMap = {};
        let matricesPorPlataforma = {};

        snapMat.forEach(doc => {
            const mat = doc.data();
            masterDataMap[doc.id] = mat;
            // Agrupamos las matrices por plataforma
            const platKey = mat.platform.toLowerCase();
            if (!matricesPorPlataforma[platKey]) matricesPorPlataforma[platKey] = [];
            matricesPorPlataforma[platKey].push({ id: doc.id, ...mat });
        });

        // 3. Crear el HTML dinámico para cada plataforma que tenga el cliente
        const plataformas = clientPlatform.split(',').map(p => p.trim());
        let htmlContenido = `<p style="font-size: 13px; color: var(--mac-text-secondary); text-align: left; margin-bottom: 15px;">Este cliente tiene <b>${plataformas.length}</b> plataforma(s). Puedes vincular cada una a su respectiva Cuenta Matriz.</p>`;

        let hasAnyMatrix = false;

        plataformas.forEach((plat, index) => {
            const platKey = plat.toLowerCase();
            const matricesDisponibles = matricesPorPlataforma[platKey] || [];

            htmlContenido += `<div style="background: var(--mac-gray); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--mac-border); text-align: left;">`;
            htmlContenido += `<h4 style="margin: 0 0 10px 0; color: var(--mac-blue); font-size: 14px;"><i class='bx bx-tv'></i> ${plat}</h4>`;

            if (matricesDisponibles.length > 0) {
                hasAnyMatrix = true;

                // Buscar si ya estaba vinculado previamente para dejarlo preseleccionado
                let matrizActual = '';
                let perfilActual = '';
                if (c.multiAccounts && c.multiAccounts[plat]) {
                    matrizActual = c.multiAccounts[plat].masterAccountId || '';
                    perfilActual = c.multiAccounts[plat].profile || '';
                } else if (plataformas.length === 1 && c.linkedMasterId) { // Fallback para clientes antiguos
                    matrizActual = c.linkedMasterId;
                    perfilActual = c.accountProfile || '';
                }

                let optionsHTML = '<option value="">-- No vincular esta plataforma --</option>';
                matricesDisponibles.forEach(mat => {
                    const selected = matrizActual === mat.id ? 'selected' : '';
                    optionsHTML += `<option value="${mat.id}" ${selected}>${mat.platform} - ${mat.email}</option>`;
                });

                htmlContenido += `
                    <select id="swal-matriz-${index}" data-plat="${plat}" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text-main); outline:none;">
                        ${optionsHTML}
                    </select>
                    <input id="swal-perfil-${index}" value="${perfilActual}" placeholder="N° de Perfil (Ej: 3, J3)" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text-main); box-sizing: border-box; outline:none;">
                `;
            } else {
                htmlContenido += `<p style="margin: 0; font-size: 12px; color: var(--mac-orange);">⚠️ No tienes cuentas matrices creadas para ${plat}.</p>`;
            }
            htmlContenido += `</div>`;
        });

        if (!hasAnyMatrix) {
            return window.showNotification("No tienes Cuentas Matrices creadas para las plataformas de este cliente.");
        }

        const { value: formValues } = await Swal.fire({
            title: '🔗 Vincular a Matrices',
            html: `<div style="max-height: 60vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px;">${htmlContenido}</div>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Guardar Vínculos',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#007AFF',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
            preConfirm: () => {
                let resultados = [];
                for (let i = 0; i < plataformas.length; i++) {
                    const matSelect = document.getElementById(`swal-matriz-${i}`);
                    const perfInput = document.getElementById(`swal-perfil-${i}`);

                    if (matSelect) {
                        const matrizId = matSelect.value;
                        const perfil = perfInput ? perfInput.value.trim() : '';

                        if (matrizId !== "" && (!perfil || !/\d/.test(perfil))) {
                            Swal.showValidationMessage(`El perfil para ${plataformas[i]} debe contener al menos un NÚMERO (Ej: 3, J3).`);
                            return false;
                        }

                        resultados.push({
                            plataforma: matSelect.getAttribute('data-plat'),
                            matrizId: matrizId, // 🔥 Ahora reconoce cuando eliges "No vincular" ("")
                            perfil: perfil
                        });
                    }
                }
                return resultados;
            }
        });

        if (formValues && formValues.length > 0) {
            let multiAccounts = c.multiAccounts || {};

            if (!c.multiAccounts) {
                plataformas.forEach(p => {
                    multiAccounts[p] = {
                        email: c.accountEmail || '', password: c.accountPassword || '', profile: c.accountProfile || '',
                        pin: c.accountPin || '', units: c.accountUnits || 1, months: c.accountMonths || 1,
                        deviceName: c.accountDeviceName || '', deviceType: c.accountDeviceType || '', saleType: c.accountSaleType || 'Perfil'
                    };
                });
            }

            let rootUpdates = {};

            formValues.forEach(vinculo => {
                if (!multiAccounts[vinculo.plataforma]) multiAccounts[vinculo.plataforma] = window.getDefaultAccData();

                if (vinculo.matrizId === "") {
                    // 🔥 LÓGICA DE DESVINCULACIÓN (Mata al fantasma)
                    multiAccounts[vinculo.plataforma].masterAccountId = null;
                    if (vinculo.plataforma === formValues[0].plataforma) {
                        rootUpdates.linkedMasterId = null;
                    }
                } else {
                    // LÓGICA DE VINCULACIÓN
                    const matrizSeleccionada = masterDataMap[vinculo.matrizId];
                    multiAccounts[vinculo.plataforma].masterAccountId = vinculo.matrizId;
                    multiAccounts[vinculo.plataforma].profile = vinculo.perfil;
                    multiAccounts[vinculo.plataforma].email = matrizSeleccionada.email;
                    multiAccounts[vinculo.plataforma].password = matrizSeleccionada.pass;

                    if (vinculo.plataforma === formValues[0].plataforma) {
                        rootUpdates.linkedMasterId = vinculo.matrizId;
                        rootUpdates.accountProfile = vinculo.perfil;
                        rootUpdates.accountEmail = matrizSeleccionada.email;
                        rootUpdates.accountPassword = matrizSeleccionada.pass;
                    }
                }
            });
            // Guardar todo de golpe en Firebase
            await updateDoc(doc(db, "clients", clientId), {
                multiAccounts: multiAccounts,
                ...rootUpdates
            });

            window.showNotification("✅ Vínculos guardados y datos actualizados.");
            loadUserClients();
        }

    } catch (e) {
        window.showNotification("Error al vincular: " + e.message);
    }
};
/* --- EDITAR CLIENTE DIRECTO DESDE LA MATRIZ --- */
window.editarClienteDesdeMatriz = (clientId) => {
    // 1. Cambiamos a la vista de "Mis Clientes"
    window.switchMainTab('clientes');

    // 2. Ejecutamos tu función original de edición
    window.startEdit(clientId);

    // 3. Hacemos scroll suave hacia el formulario
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });

    window.showNotification("✏️ Modo edición activado.");
};

// Ejecutamos el detector apenas se lee el archivo
checkPublicStore();

/* --- FUNCIONES DEL MODAL DEL BOT (ADMIN GLOBAL) --- */
window.abrirModalAdminBot = () => {
    document.getElementById('adminBotModal').style.display = 'flex';
    document.getElementById('adminBotStatus').innerText = "Haz clic en Generar QR para empezar.";
    document.getElementById('adminBotStatus').style.color = "var(--mac-text-secondary)";
    document.getElementById('adminBotQrImage').style.display = 'none';
};

window.generarQrAdmin = async () => {
    const statusEl = document.getElementById('adminBotStatus');
    const qrImgEl = document.getElementById('adminBotQrImage');

    statusEl.innerText = "⏳ Generando código QR...";
    statusEl.style.color = "var(--mac-orange)";
    qrImgEl.style.display = 'none';

    try {
        // 🔥 CORRECCIÓN: Ahora usa tu UID real para que el cron job de cobranza te reconozca
        const response = await fetch(`https://bot.panelagc.com/api/conectar/${currentUser.uid}`);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'qr') {
            qrImgEl.src = data.qr;
            qrImgEl.style.display = 'block';
            statusEl.innerText = "📱 Escanea este código con el WhatsApp administrador.";
            statusEl.style.color = "var(--mac-text-main)";
        } else if (data.status === 'conectado') {
            qrImgEl.style.display = 'none';
            statusEl.innerText = "✅ " + data.message;
            statusEl.style.color = "var(--mac-green)";
        } else {
            statusEl.innerText = "⚠️ Respuesta inesperada del servidor.";
            statusEl.style.color = "var(--mac-orange)";
        }

    } catch (error) {
        qrImgEl.style.display = 'none';
        statusEl.innerText = "❌ Error al contactar al servidor. Revisa la consola.";
        statusEl.style.color = "var(--mac-red)";
        console.error("Error en generarQrAdmin:", error);
    }
};

window.sendFreeProfilesToInventory = async (masterId) => {
    try {
        const docSnap = await getDoc(doc(db, "masterAccounts", masterId));
        if (!docSnap.exists()) return;
        const mat = docSnap.data();

        const qCli = query(collection(db, "clients"), where("userId", "==", currentUser.uid), where("linkedMasterId", "==", masterId));
        const snapCli = await getDocs(qCli);

        const occupiedProfiles = snapCli.docs.map(d => {
            const p = d.data().accountProfile;
            const num = p ? String(p).match(/\d+/) : null;
            return num ? parseInt(num[0]) : null;
        }).filter(n => n !== null);

        let stock = currentUserData.inventory || [];
        let added = 0;

        for (let i = 1; i <= mat.maxProfiles; i++) {
            if (!occupiedProfiles.includes(i)) {
                stock.push({
                    id: 'acc_' + Date.now() + '_' + i,
                    platform: mat.platform,
                    type: 'Perfil',
                    email: mat.email,
                    pass: mat.pass,
                    profile: String(i),
                    pin: 'N/A',
                    status: 'libre'
                });
                added++;
            }
        }

        if (added > 0) {
            await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
            currentUserData.inventory = stock;
            window.showNotification(`📦 ${added} perfiles enviados al inventario.`);
            window.renderInventory();
        } else {
            window.showNotification("⚠️ No hay perfiles libres en esta matriz.");
        }
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};
/* ==========================================================================
   MOTOR DE GRÁFICOS ANALÍTICOS (APEXCHARTS)
   ========================================================================== */
let revenueChartInst = null;
let platformChartInst = null;
let funnelChartInst = null;

window.renderCharts = (totalIncome, totalCost, totalProfit, filter = 'proyeccion') => {
    const textColor = '#888888';
    const gridColor = '#222222';

    // --- 1. RADAR INTELIGENTE DE SECCIÓN ---
    const isFinance = document.getElementById('financeSection') && document.getElementById('financeSection').classList.contains('active-section');

    const revChartId = isFinance ? '#revenueChartFin' : '#revenueChart';
    const platChartId = isFinance ? '#platformChartFin' : '#platformChart';
    const funChartId = isFinance ? '#funnelChartFin' : '#funnelChart';

    const lblTitleId = isFinance ? 'chartHeaderLabelFin' : 'chartHeaderLabel';
    const lblTagId = isFinance ? 'chartHeaderTagFin' : 'chartHeaderTag';
    const lblTotalId = isFinance ? 'chartHeaderTotalFin' : 'chartHeaderTotal';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let catLabels = [];
    let chartData = [];
    let labelTitle = '';
    let tagHtml = '';

    // CONSTRUCTOR DE EJES Y DATOS SEGÚN EL FILTRO
    if (filter === 'proyeccion') {
        labelTitle = 'Dinero por cobrar (Próx. 14 Días)';
        tagHtml = `+ Proyección <i class='bx bx-trending-up'></i>`;
        for (let i = 0; i < 14; i++) {
            let d = new Date(today); d.setDate(today.getDate() + i);
            catLabels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
            let sum = 0;
            clients.forEach(c => {
                const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
                if (exp.getTime() === d.getTime()) sum += (c.price || 0) * (c.accountUnits || 1);
            });
            chartData.push(sum);
        }
    } else if (filter === 'hoy') {
        labelTitle = 'Ingresos de Hoy';
        tagHtml = `Solo Hoy <i class='bx bx-check'></i>`;
        catLabels = ['Ayer', 'Hoy'];
        let sumAyer = 0, sumHoy = 0;
        let ayer = new Date(today); ayer.setDate(today.getDate() - 1);
        clients.forEach(c => {
            const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
            const fechaPago = new Date(exp); fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));
            if (fechaPago.getTime() === today.getTime()) sumHoy += (c.price || 0) * (c.accountUnits || 1);
            if (fechaPago.getTime() === ayer.getTime()) sumAyer += (c.price || 0) * (c.accountUnits || 1);
        });
        chartData = [sumAyer, sumHoy];
    } else if (filter === 'semana') {
        labelTitle = 'Ingresos (Últimos 7 días)';
        tagHtml = `Esta Semana <i class='bx bx-calendar'></i>`;
        for (let i = 6; i >= 0; i--) {
            let d = new Date(today); d.setDate(today.getDate() - i);
            catLabels.push(d.toLocaleDateString('es-ES', { weekday: 'short' }));
            let sum = 0;
            clients.forEach(c => {
                const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
                const fechaPago = new Date(exp); fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));
                if (fechaPago.getTime() === d.getTime()) sum += (c.price || 0) * (c.accountUnits || 1);
            });
            chartData.push(sum);
        }
    } else if (filter === 'mes') {
        labelTitle = 'Ingresos del Mes (Por Semanas)';
        tagHtml = `Este Mes <i class='bx bx-bar-chart'></i>`;
        catLabels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
        let weeks = [0, 0, 0, 0];
        clients.forEach(c => {
            const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
            const fechaPago = new Date(exp); fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));
            if (fechaPago.getMonth() === today.getMonth() && fechaPago.getFullYear() === today.getFullYear()) {
                let w = Math.floor((fechaPago.getDate() - 1) / 7);
                if (w > 3) w = 3;
                weeks[w] += (c.price || 0) * (c.accountUnits || 1);
            }
        });
        chartData = weeks;
    } else if (filter === 'anio') {
        labelTitle = 'Ingresos del Año (Por Meses)';
        tagHtml = `Este Año <i class='bx bx-line-chart'></i>`;
        catLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        let months = new Array(12).fill(0);
        clients.forEach(c => {
            const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
            const fechaPago = new Date(exp); fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));
            if (fechaPago.getFullYear() === today.getFullYear()) {
                months[fechaPago.getMonth()] += (c.price || 0) * (c.accountUnits || 1);
            }
        });
        chartData = months;
    }

    // Actualización de textos DOM usando las variables detectadas
    if (document.getElementById(lblTitleId)) document.getElementById(lblTitleId).innerText = labelTitle;
    if (document.getElementById(lblTagId)) document.getElementById(lblTagId).innerHTML = tagHtml;
    let headerTotal = chartData.reduce((a, b) => a + b, 0);
    if (document.getElementById(lblTotalId)) document.getElementById(lblTotalId).innerText = `${globalCurrency}${headerTotal.toFixed(2)}`;

    // DONUT PLATAFORMAS DINÁMICO
    let platCounts = {};
    clients.forEach(c => {
        const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0, 0, 0, 0);
        const fechaPago = new Date(exp); fechaPago.setMonth(fechaPago.getMonth() - (c.accountMonths || 1));
        const dVenc = Math.ceil((exp - today) / 86400000);

        let entra = false;
        if (filter === 'proyeccion') { if (dVenc >= 0 && dVenc <= 14) entra = true; }
        else if (filter === 'hoy') { if (fechaPago.getTime() === today.getTime()) entra = true; }
        else if (filter === 'semana') { let w = new Date(today); w.setDate(w.getDate() - 6); if (fechaPago >= w && fechaPago <= today) entra = true; }
        else if (filter === 'mes') { if (fechaPago.getMonth() === today.getMonth() && fechaPago.getFullYear() === today.getFullYear()) entra = true; }
        else if (filter === 'anio') { if (fechaPago.getFullYear() === today.getFullYear()) entra = true; }

        if (entra) {
            const u = c.accountUnits || 1;
            c.platform.split(', ').forEach(p => { platCounts[p] = (platCounts[p] || 0) + u; });
        }
    });
    const sortedPlats = Object.entries(platCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const platLabels = sortedPlats.length ? sortedPlats.map(x => x[0]) : ['Sin Datos'];
    const platData = sortedPlats.length ? sortedPlats.map(x => x[1]) : [1];

    const commonOptions = { theme: { mode: 'dark' }, tooltip: { theme: 'dark' } };

    // DIBUJAR CURVA
    if (revenueChartInst) revenueChartInst.destroy();
    revenueChartInst = new ApexCharts(document.querySelector(revChartId), {
        ...commonOptions,
        series: [{ name: `Monto (${globalCurrency})`, data: chartData }],
        chart: { type: 'area', height: 250, background: 'transparent', toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
        colors: ['#0a84ff'], dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 4 }, fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
        xaxis: { categories: catLabels, labels: { style: { colors: textColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { colors: textColor }, formatter: (val) => globalCurrency + val.toFixed(0) } },
        grid: { show: true, borderColor: gridColor, strokeDashArray: 0, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } }
    });
    revenueChartInst.render();

    // DIBUJAR DONUT
    if (platformChartInst) platformChartInst.destroy();
    platformChartInst = new ApexCharts(document.querySelector(platChartId), {
        ...commonOptions, series: platData, labels: platLabels,
        chart: { type: 'donut', height: 260, background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800 } },
        colors: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a'],
        plotOptions: { pie: { donut: { size: '72%', labels: { show: true, name: { color: textColor }, value: { color: '#ffffff', fontSize: '20px', fontWeight: 'bold', formatter: (val) => val + " ud" }, total: { show: true, showAlways: true, label: 'Cuentas', color: textColor } } } } },
        dataLabels: { enabled: false }, stroke: { show: true, colors: ['#0a0a0c'], width: 3 }, legend: { position: 'right', labels: { colors: '#ffffff' } }
    });
    platformChartInst.render();

    // DIBUJAR EMBUDO
    if (funnelChartInst) funnelChartInst.destroy();
    funnelChartInst = new ApexCharts(document.querySelector(funChartId), {
        ...commonOptions, series: [{ name: 'Monto', data: [totalIncome, totalCost, totalProfit] }],
        chart: { type: 'bar', height: 180, background: 'transparent', toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
        plotOptions: { bar: { borderRadius: 6, horizontal: true, distributed: true, dataLabels: { position: 'bottom' } } },
        colors: ['#0a84ff', '#ff453a', '#30d158'],
        dataLabels: { enabled: true, textAnchor: 'start', style: { colors: ['#fff'], fontSize: '13px', fontWeight: 'bold' }, formatter: function (val, opt) { return opt.w.globals.labels[opt.dataPointIndex] + ": " + globalCurrency + val.toFixed(2); }, offsetX: 10, dropShadow: { enabled: true, top: 1, left: 1, blur: 1, opacity: 0.5 } },
        stroke: { width: 0 }, xaxis: { categories: ['1. Ingresos Brutos', '2. Inversión Total', '3. Ganancia Neta'], labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } }, yaxis: { labels: { show: false } }, grid: { show: false }
    });
    funnelChartInst.render();
};
/* ==========================================================================
   MÓDULO DE COMPRESIÓN DEL PANEL LATERAL
   ========================================================================== */
window.toggleSidebar = () => {
    const sidebar = document.getElementById('mainSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');

        // Guardamos su estado en la memoria local del navegador
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('agc_sidebar_collapsed', isCollapsed);

        // 🪄 MAGIA: Disparamos un evento "falso" de redimensionamiento de ventana
        // Esto obliga a tus gráficos ApexCharts a recalcular su tamaño al instante
        // y adaptarse suavemente al nuevo espacio gigante que se liberó.
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 350);
    }
};

// Se ejecuta automáticamente al arrancar la página para recordar la preferencia
document.addEventListener("DOMContentLoaded", () => {
    const isCollapsed = localStorage.getItem('agc_sidebar_collapsed') === 'true';
    if (isCollapsed) {
        const sidebar = document.getElementById('mainSidebar');
        if (sidebar) sidebar.classList.add('collapsed');
    }
});
/* =========================================================
   LÓGICA DEL PORTAL PÚBLICO DE CLIENTES (REDiseño PREMIUM + SEGURIDAD)
========================================================= */
let portalStoreData = null;

window.checkClientPortal = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const portalId = urlParams.get('portal') || urlParams.get('store');
    const clientId = urlParams.get('client');

    if (!portalId) return false;

    if (document.getElementById('authView')) document.getElementById('authView').style.display = 'none';
    if (document.getElementById('appView')) document.getElementById('appView').style.display = 'none';
    if (document.getElementById('adminView')) document.getElementById('adminView').style.display = 'none';
    if (document.getElementById('publicStoreView')) document.getElementById('publicStoreView').style.display = 'none';

    const portalView = document.getElementById('clientPortalView');
    if (portalView) portalView.style.display = 'block';

    try {
        const q = query(collection(db, "users"), where("storeAlias", "==", portalId));
        const snap = await getDocs(q);

        if (!snap.empty) {
            portalStoreData = snap.docs[0].data();
            portalStoreData.uid = snap.docs[0].id;
        } else {
            const docRef = await getDoc(doc(db, "users", portalId));
            if (docRef.exists()) {
                portalStoreData = docRef.data();
                portalStoreData.uid = portalId;
            }
        }

        if (!portalStoreData) {
            document.getElementById('portalStoreName').innerText = "Portal no encontrado";
            return true;
        }

        document.getElementById('portalStoreName').innerText = portalStoreData.name || "Mi Portal";

        const logo = document.getElementById('portalStoreLogo');
        if (logo) {
            if (portalStoreData.logoUrl) {
                logo.src = portalStoreData.logoUrl;
                logo.style.display = 'block';
            } else {
                logo.style.display = 'none';
            }
        }

        const vendorPhone = portalStoreData.phone ? portalStoreData.phone.replace(/[^\d+]/g, '') : '';
        const supportLink = document.getElementById('portalSupportWaBtn');
        if (supportLink && vendorPhone) {
            supportLink.href = `https://wa.me/${vendorPhone}?text=${encodeURIComponent('Hola, necesito ayuda con mis servicios del portal.')}`;
        }

        if (clientId) {
            const clientDoc = await getDoc(doc(db, "clients", clientId));
            if (clientDoc.exists() && clientDoc.data().userId === portalStoreData.uid) {
                const baseClient = clientDoc.data();

                // Buscar si tiene otros servicios con el mismo código y teléfono
                const cleanInputPhone = baseClient.phone ? baseClient.phone.replace(/[^\d]/g, '') : '';
                const codeInput = baseClient.portalCode;

                const qAll = query(collection(db, "clients"), where("userId", "==", portalStoreData.uid));
                const snapAll = await getDocs(qAll);

                let matchedClients = [];
                snapAll.forEach(d => {
                    const c = d.data();
                    c.id = d.id; // <-- FIX: Atrapa el ID secreto del cliente
                    const cleanDbPhone = c.phone ? c.phone.replace(/[^\d]/g, '') : '';
                    if ((cleanDbPhone === cleanInputPhone || cleanDbPhone.endsWith(cleanInputPhone)) && c.portalCode === codeInput) {
                        matchedClients.push(c);
                    }
                });

                document.getElementById('portalSearchCard').style.display = 'none';
                window.renderClientPortalData(matchedClients, portalStoreData);
            }
        }
        return true;
    } catch (e) {
        console.error("Error cargando portal:", e);
        return false;
    }
};

window.searchPortalByPhone = async () => {
    const phoneInput = document.getElementById('portalPhoneSearchInput').value.trim();
    const codeInput = document.getElementById('portalCodeSearchInput').value.trim().toUpperCase();

    if (!phoneInput || !codeInput) return window.showNotification("⚠️ Ingresa tu WhatsApp y el Código del portal.");

    const btn = document.querySelector('#portalSearchCard .btn-primary');
    const origText = btn.innerHTML;
    btn.innerHTML = "Buscando... <i class='bx bx-loader-alt bx-spin'></i>";
    btn.disabled = true;

    try {
        const cleanInputPhone = phoneInput.replace(/[^\d]/g, '');
        const q = query(collection(db, "clients"), where("userId", "==", portalStoreData.uid));
        const snap = await getDocs(q);

        let matchedClients = [];
        snap.forEach(d => {
            const c = d.data();
            c.id = d.id; // <-- FIX: Atrapa el ID secreto del cliente
            const cleanDbPhone = c.phone ? c.phone.replace(/[^\d]/g, '') : '';
            // Validar teléfono y código para apilar todas sus compras
            if ((cleanDbPhone === cleanInputPhone || cleanDbPhone.endsWith(cleanInputPhone)) && c.portalCode === codeInput) {
                matchedClients.push(c);
            }
        });

        if (matchedClients.length > 0) {
            document.getElementById('portalSearchCard').style.display = 'none';
            window.renderClientPortalData(matchedClients, portalStoreData);
        } else {
            window.showNotification("❌ Datos incorrectos. Revisa tu número y código.");
        }
    } catch (e) {
        console.error(e);
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};

window.copyToClipboard = (text, label) => {
    if (!text || text === '-') return window.showNotification("Sin datos para copiar");
    navigator.clipboard.writeText(text).then(() => {
        window.showNotification(`📋 ${label} copiado`);
    }).catch(() => {
        const input = document.createElement("input");
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        window.showNotification(`📋 ${label} copiado`);
    });
};

window.openPortalManagerModal = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const portalAlias = currentUserData.storeAlias || currentUser.uid;
    const globalUrl = `${baseUrl}?portal=${portalAlias}`;

    document.getElementById('globalPortalUrlInput').value = globalUrl;
    document.getElementById('portalManagerModal').style.display = 'flex';
};

window.copyGlobalPortalUrl = () => {
    const url = document.getElementById('globalPortalUrlInput').value;
    window.copyToClipboard(url, "Enlace del Portal");
};

// Se actualizó para que le envíe el código automáticamente al cliente
window.sendClientPortalWa = (phone, clientId) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return window.showNotification("Cliente no encontrado.");

    const baseUrl = window.location.origin + window.location.pathname;
    const portalAlias = currentUserData.storeAlias || currentUser.uid;
    const clientUrl = `${baseUrl}?portal=${portalAlias}`;
    const cleanPhone = phone.replace(/[^\d+]/g, '');

    const msg = `¡Hola, *${c.name}*! 👋\n\nPuedes consultar el estado de tus servicios y tus contraseñas en tiempo real desde tu portal web personal.\n\n🔗 *Link:* ${clientUrl}\n📱 *Usuario:* ${c.phone}\n🔑 *Código Web:* ${c.portalCode || 'N/A'}\n\n_Guarda este mensaje para ver tus accesos cuando quieras._`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.renderClientPortalData = (clientsArray, storeUserData) => {
    const container = document.getElementById('portalClientResults');
    container.innerHTML = '';

    if (!clientsArray || clientsArray.length === 0) return;

    let fullHtml = '';

    // Dibujamos una tarjeta completa por cada registro encontrado
    clientsArray.forEach(clientObj => {
        const now = new Date();
        const exp = new Date(clientObj.date);
        exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());

        const diffTime = exp.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let badgeClass = 'active';
        let badgeIcon = 'bx-check-circle';
        let badgeText = `Activo (${diffDays} días restantes)`;

        if (diffDays <= 0) {
            badgeClass = 'expired';
            badgeIcon = 'bx-x-circle';
            badgeText = '¡SERVICIO VENCIDO!';
        } else if (diffDays <= 3) {
            badgeClass = 'warning';
            badgeIcon = 'bx-time-five';
            badgeText = `⚠️ Por vencer (${diffDays} días restantes)`;
        }

        let platformsList = [];
        if (clientObj.multiAccounts && Object.keys(clientObj.multiAccounts).length > 0) {
            platformsList = Object.keys(clientObj.multiAccounts);
        } else {
            platformsList = clientObj.platform ? clientObj.platform.split(',').map(p => p.trim()) : ['Servicio'];
        }

        let accountsHtml = '';
        platformsList.forEach(platName => {
            let acc = clientObj.multiAccounts && clientObj.multiAccounts[platName]
                ? clientObj.multiAccounts[platName]
                : {
                    email: clientObj.accountEmail || '-',
                    password: clientObj.accountPassword || '-',
                    profile: clientObj.accountProfile || '-',
                    pin: clientObj.accountPin || '-'
                };

            accountsHtml += `
                <div style="background: var(--mac-bg); padding: 15px; border-radius: 16px; border: 1px solid var(--mac-border); text-align: left; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
                    <div style="font-size: 14px; font-weight: 800; color: var(--mac-text-main); margin-bottom: 12px;">🎬 ${platName.toUpperCase()}</div>
                    
                    <div class="credential-card">
                        <div class="credential-info"><span class="credential-label">Correo</span><span class="credential-value">${acc.email || '-'}</span></div>
                        <button class="btn-copy-chip" style="width: max-content; flex-shrink: 0; white-space: nowrap;" onclick="window.copyToClipboard('${acc.email || ''}', 'Correo')"><i class='bx bx-copy'></i> Copiar</button>
                    </div>
                    
                    <div class="credential-card">
                        <div class="credential-info"><span class="credential-label">Contraseña</span><span class="credential-value">${acc.password || '-'}</span></div>
                        <button class="btn-copy-chip" style="width: max-content; flex-shrink: 0; white-space: nowrap;" onclick="window.copyToClipboard('${acc.password || ''}', 'Clave')"><i class='bx bx-copy'></i> Copiar</button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div class="credential-card" style="margin: 0; align-items: center;">
                            <div class="credential-info"><span class="credential-label">Perfil N°</span><span class="credential-value">${acc.profile || '-'}</span></div>
                            <button class="btn-copy-chip" style="width: max-content; flex-shrink: 0; white-space: nowrap; padding: 6px 10px;" onclick="window.copyToClipboard('${acc.profile || ''}', 'Perfil')"><i class='bx bx-copy'></i></button>
                        </div>
                        <div class="credential-card" style="margin: 0; align-items: center;">
                            <div class="credential-info"><span class="credential-label">PIN Acceso</span><span class="credential-value">${acc.pin || '-'}</span></div>
                            <button class="btn-copy-chip" style="width: max-content; flex-shrink: 0; white-space: nowrap; padding: 6px 10px;" onclick="window.copyToClipboard('${acc.pin || ''}', 'PIN')"><i class='bx bx-copy'></i></button>
                        </div>
                    </div>
                    <button onclick="window.openReviewModal('${clientObj.id}', '${platName}', '${clientObj.name.replace(/'/g, "\\'")}', '${clientObj.phone || ''}')" class="btn-secondary" style="margin-top: 15px; width: 100%; padding: 10px; border-radius: 8px; font-weight: bold; border: 1px solid var(--mac-orange); color: var(--mac-orange); background: rgba(255, 149, 0, 0.1); transition: 0.2s;"><i class='bx bxs-star'></i> Calificar Servicio</button>
                </div>
            `;
        });

        const vendorPhone = storeUserData.phone ? storeUserData.phone.replace(/[^\d+]/g, '') : '';
        const renewMsg = encodeURIComponent(`¡Hola! Quisiera renovar mi servicio de ${clientObj.platform}. Nombre: ${clientObj.name}`);
        const renewUrl = `https://wa.me/${vendorPhone}?text=${renewMsg}`;

        fullHtml += `
            <div class="portal-hero-card" style="margin-bottom: 20px;">
                <span class="portal-badge ${badgeClass}"><i class='bx ${badgeIcon}'></i> ${badgeText}</span>
                <h2 style="margin: 0 0 5px 0; font-size: 22px; color: var(--mac-text-main);">${clientObj.name}</h2>
                <p style="font-size: 13px; color: var(--mac-text-secondary); margin-top: 0; margin-bottom: 20px;">Vencimiento: <b>${exp.toLocaleDateString('es-ES')}</b></p>
                
                <div class="portal-platforms-grid">
                    ${accountsHtml}
                </div>

                ${diffDays <= 3 ? `<button onclick="window.openRenewFromPortal('${clientObj.id}', '${clientObj.platform}', ${clientObj.price})" class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%); color: white; border: none; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 14px; cursor: pointer; width: 100%;"><i class='bx bx-refresh' style="font-size: 20px;"></i> Solicitar Renovación</button>` : ''}
            </div>
        `;
    });

    container.innerHTML = fullHtml;
    container.style.display = 'block';
};

document.addEventListener('DOMContentLoaded', () => { window.checkClientPortal(); });

// 📱 CONTROLADOR DEL MENÚ LATERAL EN MÓVIL ESTILO SPOTIFY
window.toggleMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('mobileSidebarOverlay');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (overlay) {
        if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.style.display = 'none', 300);
        } else {
            overlay.style.display = 'block';
            setTimeout(() => overlay.classList.add('active'), 10);
        }
    }
};

// Auto-Cerrar menú móvil al hacer clic en cualquier opción
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) window.toggleMobileMenu();
            });
        });
    }, 1000);
});

/* ==========================================================================
   ⚙️ MÓDULO: GESTIÓN DE SERVICIOS PERSONALIZADOS & MIGRACIÓN TRANSPARENTE
   ========================================================================== */
const DEFAULT_SERVICES = ["Netflix", "Disney+", "Spotify Premium", "HBO Max", "Paramount", "Amazon Prime", "YouTube Premium", "Crunchyroll", "IPTV", "Flujo TV", "Apple TV", "Gemini Pro", "ChatGPT", "Canva Pro", "CapCut Pro", "Directv GO", "Movistar"];

window.syncUserServices = async () => {
    if (!currentUserData) return;
    let userServices = currentUserData.customServices || [];

    // 🚀 AUTO-DETECTABLE: Si es su primera vez, jalamos sus servicios viejos
    if (userServices.length === 0) {
        const foundServices = new Set(DEFAULT_SERVICES);
        if (typeof clients !== 'undefined') { clients.forEach(c => { if (c.platform) c.platform.split(', ').forEach(p => foundServices.add(p.trim())); }); }
        if (currentUserData.inventory) { currentUserData.inventory.forEach(i => { if (i.platform) foundServices.add(i.platform.trim()); }); }
        userServices = Array.from(foundServices);
        currentUserData.customServices = userServices;
        await updateDoc(doc(db, "users", currentUser.uid), { customServices: userServices });
    }

    window.populateAllServiceSelects();
    window.renderCustomServicesChips();
};

window.populateAllServiceSelects = () => {
    const services = currentUserData.customServices || DEFAULT_SERVICES;

    // A) Checkboxes en Nuevo Cliente
    const chkDropdown = document.getElementById('checkboxDropdown');
    if (chkDropdown) {
        chkDropdown.innerHTML = '';
        services.forEach(s => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${s}"> ${s}`;
            chkDropdown.appendChild(label);
        });
        document.querySelectorAll('#checkboxDropdown input').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value);
                const el = document.getElementById('selectText');
                if (checked.length) { el.textContent = checked.join(', '); el.classList.add('has-selection'); }
                else { el.textContent = 'Plataforma(s)...'; el.classList.remove('has-selection'); }
            });
        });
    }

    // B) Selects Simples (Inventario, Matrices, Reglas)
    const selectIds = [{ id: 'invPlatform', defaultOpt: 'Plataforma...' }, { id: 'matPlatform', defaultOpt: null }, { id: 'rulePlatformSelect', defaultOpt: null }];
    selectIds.forEach(item => {
        const select = document.getElementById(item.id);
        if (select) {
            select.innerHTML = item.defaultOpt ? `<option value="">${item.defaultOpt}</option>` : '';
            services.forEach(s => { select.innerHTML += `<option value="${s}">${s}</option>`; });
        }
    });
};

window.renderCustomServicesChips = () => {
    const container = document.getElementById('customServicesChips');
    if (!container) return;
    container.innerHTML = '';
    const services = currentUserData.customServices || DEFAULT_SERVICES;

    services.forEach((s, index) => {
        const chip = document.createElement('div');
        chip.style.cssText = "background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 20px; display: flex; align-items: center; gap: 8px;";
        chip.innerHTML = `<span>${s}</span> <i class='bx bx-x' style='cursor:pointer; color:var(--mac-red); font-size:18px;' onclick="window.removeCustomService(${index})"></i>`;
        container.appendChild(chip);
    });
};

window.addCustomService = async () => {
    const input = document.getElementById('newCustomServiceInput');
    const name = input.value.trim();
    if (!name) return window.showNotification("Escribe el nombre del servicio");

    let services = currentUserData.customServices || DEFAULT_SERVICES;
    if (services.some(s => s.toLowerCase() === name.toLowerCase())) return window.showNotification("Ese servicio ya está en tu lista.");

    services.push(name);
    currentUserData.customServices = services;
    input.value = '';

    await updateDoc(doc(db, "users", currentUser.uid), { customServices: services });
    window.populateAllServiceSelects();
    window.renderCustomServicesChips();
    window.showNotification("✅ Servicio añadido");
};

window.removeCustomService = async (index) => {
    let services = currentUserData.customServices || DEFAULT_SERVICES;
    services.splice(index, 1);
    currentUserData.customServices = services;

    await updateDoc(doc(db, "users", currentUser.uid), { customServices: services });
    window.populateAllServiceSelects();
    window.renderCustomServicesChips();
    window.showNotification("🗑️ Servicio eliminado de tu lista");
};


/* =========================================================
   LÓGICA PÚBLICA DE PLANES Y LICENCIAS (?planes=true)
========================================================= */
window.checkPlanesView = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get('planes')) return false;

    // Ocultar vistas privadas y login
    if (document.getElementById('authView')) document.getElementById('authView').style.display = 'none';
    if (document.getElementById('appView')) document.getElementById('appView').style.display = 'none';
    if (document.getElementById('adminView')) document.getElementById('adminView').style.display = 'none';
    if (document.getElementById('publicStoreView')) document.getElementById('publicStoreView').style.display = 'none';
    if (document.getElementById('clientPortalView')) document.getElementById('clientPortalView').style.display = 'none';

    // Mostrar vista de planes
    const planesView = document.getElementById('planesPublicView');
    if (planesView) planesView.style.display = 'block';

    // Número de WhatsApp Administrador para recibir las compras
    const adminPhone = "+51961341323"; // 👈 PON AQUÍ TU NÚMERO DE WHATSAPP CON CÓDIGO DE PAÍS
    const cleanPhone = adminPhone.replace(/[^\d+]/g, '');

    const basicMsg = encodeURIComponent("¡Hola! 👋 Quisiera adquirir el *PLAN BÁSICO* de A.G.C. (S/ 35.00 / $10 USD - Pago Permanente). ¿Cómo realizo el pago?");
    const proMsg = encodeURIComponent("¡Hola! 👋 Quisiera adquirir el *PLAN PRO* de A.G.C. (S/ 25.00 / $7.15 USD - Mensual) con Bot de WhatsApp. ¿Cómo realizo la activación?");
    const helpMsg = encodeURIComponent("¡Hola! 👋 Tengo dudas sobre los Planes de A.G.C. ¿Me podrías brindar información?");

    const btnBasic = document.getElementById('btnBuyBasicPlan');
    const btnPro = document.getElementById('btnBuyProPlan');
    const btnHelp = document.getElementById('btnPlanesContactWa');

    if (btnBasic) btnBasic.href = `https://wa.me/${cleanPhone}?text=${basicMsg}`;
    if (btnPro) btnPro.href = `https://wa.me/${cleanPhone}?text=${proMsg}`;
    if (btnHelp) btnHelp.href = `https://wa.me/${cleanPhone}?text=${helpMsg}`;

    return true;
};

window.startTutorial = () => {
    const driver = window.driver.js.driver;
    const isDark = document.body.classList.contains('dark-mode');

    const driverObj = driver({
        showProgress: true,
        nextBtnText: 'Siguiente &rarr;',
        prevBtnText: '&larr; Atrás',
        doneBtnText: '¡Comenzar a Vender! 🚀',
        popoverClass: 'driverjs-theme-dark',
        steps: [
            { popover: { title: '¡Bienvenido a A.G.C.!', description: 'Vamos a dar un paseo rápido por tu nuevo panel de control.' } },
            { element: '#homeSection .header-top', popover: { title: 'Finanzas', description: 'Aquí podrás ver tu utilidad neta y métricas clave en tiempo real.' } },
            { element: '#clientForm', popover: { title: 'Registrar Clientes', description: 'Usa este formulario para añadir clientes y vincularles sus plataformas.' } },
            { element: '#btnTabCuentas', popover: { title: 'Cuentas Matrices', description: 'Un área especial para llevar el control del stock de tus Cuentas Completas.' } },
            { element: '#mainSidebar', popover: { title: 'Menú Lateral', description: 'Desde aquí accedes a tu Inventario, tu Tiendita Web y la configuración de tu Bot.' } }
        ],
        onDestroyStarted: async () => {
            if (driverObj.hasNextStep()) { driverObj.destroy(); return; }
            await updateDoc(doc(db, "users", currentUser.uid), { tutorialVisto: true });
            currentUserData.tutorialVisto = true;
            driverObj.destroy();
        }
    });
    driverObj.drive();
};

/* --- CONTROL DE TÉRMINOS Y CONDICIONES --- */
window.openTermsModal = () => {
    const modal = document.getElementById('termsModal');
    if (modal) modal.style.display = 'flex';
};

window.closeTermsModal = () => {
    const modal = document.getElementById('termsModal');
    if (modal) modal.style.display = 'none';
};

// Actualiza visualmente las tarjetas de Conectar Inventario y Venta por Invitación
window.updateStoreToggleUI = (labelEl, inputId) => {
    setTimeout(() => {
        const chk = document.getElementById(inputId);
        const icon = labelEl.querySelector('.store-toggle-icon');
        if (!chk || !icon) return;

        // Define colores: Azul para Inventario, Naranja para Invitación
        const isStock = inputId === 'storeAutoStock';
        const activeColor = isStock ? 'var(--mac-blue)' : 'var(--mac-orange)';
        const activeBg = isStock ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255, 149, 0, 0.15)';

        if (chk.checked) {
            labelEl.style.border = `1px solid ${activeColor}`;
            labelEl.style.background = activeBg;
            icon.className = 'bx bx-check-circle store-toggle-icon';
            icon.style.color = activeColor;
        } else {
            labelEl.style.border = '1px solid var(--mac-border)';
            labelEl.style.background = 'var(--mac-surface)';
            icon.className = 'bx bx-circle store-toggle-icon';
            icon.style.color = 'var(--mac-text-secondary)';
        }
    }, 10);
};

window.currentClientNote = '';
// --- VER NOTA DEL CLIENTE (TIPO PAPELITO) ---
window.viewClientNote = (id) => {
    const c = clients.find(x => x.id === id);
    if (c && c.notes) {
        Swal.fire({
            title: '📝 Nota del Cliente',
            html: `
                <div style="text-align: left; white-space: pre-wrap; font-size: 14px; line-height: 1.6; background: var(--mac-bg); padding: 15px; border-radius: 12px; border: 1px dashed var(--mac-border); color: var(--mac-text-main); font-style: italic;">
                    ${c.notes}
                </div>
            `,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: 'var(--mac-blue)',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        });
    }
};
window.openNotesModal = async () => {
    const { value: text } = await Swal.fire({
        title: 'Notas del Cliente',
        input: 'textarea',
        inputValue: window.currentClientNote,
        inputPlaceholder: 'Escribe aquí los detalles (Soporta saltos de línea)...',
        showCancelButton: true,
        confirmButtonText: 'Guardar Nota',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#000',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    if (text !== undefined) {
        window.currentClientNote = text;
        window.showNotification("Nota temporal guardada.");
    }
};

window.toggleClientMenu = (e, menuId) => {
    e.stopPropagation();

    // 1. Cerramos otros menús y reseteamos la profundidad de TODAS las filas
    document.querySelectorAll('.client-action-menu').forEach(menu => {
        if (menu.id !== menuId) menu.classList.remove('show');
    });

    document.querySelectorAll('#tableBody tr').forEach(tr => {
        tr.style.zIndex = '1';
        tr.style.position = 'relative'; // Fundamental para que el z-index haga efecto
    });

    // 2. Abrimos o cerramos el menú que el usuario clickeó
    const menuSeleccionado = document.getElementById(menuId);
    menuSeleccionado.classList.toggle('show');

    // 3. 🪄 LA MAGIA: Si el menú se abrió, traemos TODA su fila al frente
    if (menuSeleccionado.classList.contains('show')) {
        const filaActual = menuSeleccionado.closest('tr');
        if (filaActual) {
            filaActual.style.zIndex = '9999';
        }
    }
};

// Cierra el menú de opciones si el usuario hace clic fuera de la tabla
document.addEventListener('click', () => {
    document.querySelectorAll('.client-action-menu').forEach(menu => menu.classList.remove('show'));

    // También devolvemos todas las filas a su lugar normal al hacer clic fuera
    document.querySelectorAll('#tableBody tr').forEach(tr => {
        tr.style.zIndex = '1';
    });
});

/* =========================================================
   🤖 ASISTENTE INTELIGENTE CONTEXTUAL
========================================================= */
window.openAssistant = () => {
    const panel = document.getElementById('aiAssistantPanel');
    const msgEl = document.getElementById('aiContextMessage');

    // 🔥 NUEVO: Si el panel ya está abierto, lo cerramos y detenemos la función
    if (panel.classList.contains('active')) {
        window.closeAssistant();
        return;
    }

    // 1. Detectar en qué sección está el usuario
    let activeSection = 'home'; // Por defecto

    if (document.getElementById('adminView').style.display === 'block') {
        activeSection = 'admin';
    } else if (document.getElementById('inventoryModal').classList.contains('active-section') || document.getElementById('inventoryModal').style.display === 'flex') {
        activeSection = 'inventory';
    } else if (document.getElementById('storeModal').classList.contains('active-section') || document.getElementById('storeModal').style.display === 'flex') {
        activeSection = 'store';
    } else if (document.getElementById('pedidosModal').classList.contains('active-section') || document.getElementById('pedidosModal').style.display === 'flex') {
        activeSection = 'pedidos';
    } else if (document.getElementById('profileSection').classList.contains('active-section')) {
        activeSection = 'profile';
    } else if (document.getElementById('accountsTableContainer').style.display === 'block') {
        activeSection = 'matrices';
    } else {
        activeSection = 'clientes';
    }

    // 2. Base de conocimientos (Respuestas predeterminadas por sección)
    const baseConocimientos = {
        'clientes': `<b>📍 Estás en: Mis Clientes</b><br><br>Aquí administras a tus clientes finales.<br><br>💡 <b>Tip de uso:</b> Usa el botón <b>"⚙️ Opciones"</b> para renovar meses, copiar credenciales al instante, o enviarle a tu cliente su Link de Portal Web.`,

        'matrices': `<b>📍 Estás en: Cuentas Matrices</b><br><br>Aquí organizas el stock de tus pantallas.<br><br>💡 <b>Tip de uso:</b> Añade una cuenta completa aquí (ej: Netflix de 5 perfiles). El panel te mostrará cuántos espacios te quedan. Usa <b>"Asignar"</b> para vender un perfil libre directamente a un cliente.`,

        'inventory': `<b>📍 Estás en: Inventario</b><br><br>Esta es tu "bodega" de cuentas libres.<br><br>💡 <b>Tip de uso:</b> Usa el botón verde <i class="bx bx-send"></i> para entregar una cuenta; esto la enviará automáticamente al formulario de clientes para que solo pongas el nombre del comprador.`,

        'store': `<b>📍 Estás en: Mi Tiendita Web</b><br><br>Este es tu catálogo público para vender en automático.<br><br>💡 <b>Tip de uso:</b> Si marcas <b>"Conectar al Inventario"</b> al crear un producto, este se agotará en la tienda cuando te quedes sin stock en tu bodega.`,

        'pedidos': `<b>📍 Estás en: Ventas Pendientes</b><br><br>Aquí llegan los pagos que tus clientes hacen en la tiendita.<br><br>💡 <b>Tip de uso:</b> Revisa la captura de pago y presiona <b>"Aprobar"</b>. El sistema sacará una cuenta de tu inventario y se la mandará al WhatsApp del cliente por ti.`,

        'profile': `<b>📍 Estás en: Mi Perfil & Bot</b><br><br>Aquí configuras tu identidad visual.<br><br>💡 <b>Tip de uso:</b> Enlaza tu WhatsApp haciendo clic en <b>"Activar Mensajes Automáticos"</b> y escaneando el QR. Esto permitirá que tu teléfono cobre las renovaciones mientras duermes.`,

        'admin': `<b>📍 Estás en: Panel Global (Admin)</b><br><br>Control total de tu negocio SaaS.<br><br>💡 <b>Tip de uso:</b> Usa los filtros de arriba para encontrar clientes. Al editar la licencia de alguien, puedes darle una Demo de 3 horas o un plan Mensual. Si su tiempo se acaba, el sistema lo bloqueará automáticamente.`
    };

    // 3. Inyectar el mensaje y abrir el panel
    msgEl.innerHTML = baseConocimientos[activeSection];
    panel.classList.add('active');
};

window.closeAssistant = () => {
    document.getElementById('aiAssistantPanel').classList.remove('active');
};

/* =========================================================
   MÓDULO: PESTAÑAS Y CONFIGURACIÓN DE TIENDA (ADMIN)
========================================================= */
window.switchStoreAdminTab = (tabId, element) => {
    // Cambiar vista
    document.querySelectorAll('.store-admin-tab').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    // Cambiar color de pestaña
    document.querySelectorAll('#storeModal .chrome-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');

    // Si entra a ajustes, cargar datos
    if (tabId === 'tabDescuentos') {
        const d = currentUserData.storeDiscounts || { qty2: 0, qty3: 0, qty4: 0 };
        document.getElementById('descCombo2').value = d.qty2 || '';
        document.getElementById('descCombo3').value = d.qty3 || '';
        document.getElementById('descCombo4').value = d.qty4 || '';
        window.renderStoreCoupons();
    }
};

window.saveStoreSettings = async () => {
    try {
        const qty2 = parseFloat(document.getElementById('descCombo2').value) || 0;
        const qty3 = parseFloat(document.getElementById('descCombo3').value) || 0;
        const qty4 = parseFloat(document.getElementById('descCombo4').value) || 0;

        const storeDiscounts = { qty2, qty3, qty4 };

        await updateDoc(doc(db, "users", currentUser.uid), { storeDiscounts });
        currentUserData.storeDiscounts = storeDiscounts;
        window.showNotification("✅ Descuentos guardados correctamente");
    } catch (e) { window.showNotification("Error: " + e.message); }
};

window.addStoreCoupon = async () => {
    const code = document.getElementById('newCouponCode').value.trim().toUpperCase();
    const percent = parseFloat(document.getElementById('newCouponPercent').value) || 0;

    if (!code || percent <= 0) return window.showNotification("⚠️ Ingresa un código y un descuento válido.");

    let coupons = currentUserData.storeCoupons || [];
    if (coupons.some(c => c.code === code)) return window.showNotification("Ese código ya existe.");

    coupons.push({ code, percent });
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { storeCoupons: coupons });
        currentUserData.storeCoupons = coupons;
        document.getElementById('newCouponCode').value = '';
        document.getElementById('newCouponPercent').value = '';
        window.renderStoreCoupons();
        window.showNotification("🎟️ Cupón creado");
    } catch (e) { }
};

window.renderStoreCoupons = () => {
    const list = document.getElementById('storeCouponsList');
    list.innerHTML = '';
    const coupons = currentUserData.storeCoupons || [];

    coupons.forEach((c, index) => {
        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--mac-surface); border: 1px dashed var(--mac-green); padding: 10px 15px; border-radius: 8px;">
                <span style="font-weight: 900; color: var(--mac-green); letter-spacing: 1px;">${c.code} <span style="font-size: 11px; color: var(--mac-text-secondary);">(-${c.percent}%)</span></span>
                <button class="action-btn btn-del" style="padding: 4px; font-size: 14px;" onclick="window.deleteStoreCoupon(${index})"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });
};

window.deleteStoreCoupon = async (index) => {
    let coupons = currentUserData.storeCoupons || [];
    coupons.splice(index, 1);
    await updateDoc(doc(db, "users", currentUser.uid), { storeCoupons: coupons });
    currentUserData.storeCoupons = coupons;
    window.renderStoreCoupons();
};


/* =========================================================
   MÓDULO: CALCULADORA DE CARRITO (PÚBLICO)
========================================================= */
let activeCoupon = null;

window.applyCoupon = () => {
    const code = document.getElementById('cartCouponInput').value.trim().toUpperCase();
    const feedback = document.getElementById('couponFeedbackMessage');

    if (!code) {
        if (feedback) feedback.style.display = 'none';
        return;
    }

    const storeCoupons = window.publicStoreDataCache.storeCoupons || [];
    const validCoupon = storeCoupons.find(c => c.code === code);

    if (validCoupon) {
        activeCoupon = validCoupon;
        if (feedback) {
            feedback.innerHTML = "✅ Cupón aplicado";
            feedback.style.color = "var(--mac-green)";
            feedback.style.display = "block";
        }
        window.renderCartItems(); // Recalcular todo
    } else {
        activeCoupon = null;
        if (feedback) {
            feedback.innerHTML = "❌ Cupón inválido";
            feedback.style.color = "var(--mac-red)";
            feedback.style.display = "block";
        }
        window.renderCartItems();
    }
};

window.renderCartItems = () => {
    const container = document.getElementById('cartItemsContainer');
    const data = window.publicStoreDataCache;
    container.innerHTML = '';

    if (window.storeCart.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--mac-text-secondary); margin-top: 50px;"><i class="bx bx-shopping-bag" style="font-size: 64px; opacity: 0.3; margin-bottom: 15px;"></i><p style="font-weight: bold; font-size: 16px;">Tu carrito está vacío</p></div>';
        document.getElementById('cartTotalPrice').innerText = window.formatStorePrice(0);
        document.getElementById('floatingCartBtn').style.display = 'none';
        document.getElementById('cartComboDiscountRow').style.display = 'none';
        document.getElementById('cartCouponRow').style.display = 'none';
        return;
    }

    let subtotal = 0;
    window.storeCart.forEach((item, index) => {
        subtotal += item.price;
        const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}">` : `<div style="width:65px; height:65px; border-radius:12px; background:var(--mac-gray); display:flex; align-items:center; justify-content:center; border: 1px solid var(--mac-border);"><i class="bx bx-play-circle" style="color:var(--mac-text-secondary); font-size:24px;"></i></div>`;
        container.innerHTML += `
            <div class="cart-item">
                ${imgHTML}
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.platform}</div>
                    <div class="cart-item-price">${window.formatStorePrice(item.price)}</div>
                </div>
                <button class="cart-item-remove" onclick="window.removeFromCart(${index})" title="Quitar"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });

    // CÁLCULO DE DESCUENTOS DINÁMICOS POR COMBO
    let qty = window.storeCart.length;
    let comboDiscountPercent = 0;
    const dynamicDisc = data.storeDiscounts || { qty2: 0, qty3: 0, qty4: 0 };

    if (qty >= 4 && dynamicDisc.qty4) comboDiscountPercent = dynamicDisc.qty4;
    else if (qty === 3 && dynamicDisc.qty3) comboDiscountPercent = dynamicDisc.qty3;
    else if (qty === 2 && dynamicDisc.qty2) comboDiscountPercent = dynamicDisc.qty2;

    let comboDiscountAmount = subtotal * (comboDiscountPercent / 100);
    let afterComboPrice = subtotal - comboDiscountAmount;

    // CÁLCULO DE CUPÓN
    let couponDiscountAmount = 0;
    if (activeCoupon) {
        couponDiscountAmount = afterComboPrice * (activeCoupon.percent / 100);
    }

    let finalTotal = afterComboPrice - couponDiscountAmount;

    // ACTUALIZAR INTERFAZ DEL CARRITO
    document.getElementById('cartSubtotalPrice').innerText = window.formatStorePrice(subtotal);

    if (comboDiscountAmount > 0) {
        document.getElementById('cartComboDiscountRow').style.display = 'flex';
        document.getElementById('cartComboDiscountLabel').innerText = `Combo Armado (-${comboDiscountPercent}%):`;
        document.getElementById('cartComboDiscountAmount').innerText = `- ${window.formatStorePrice(comboDiscountAmount)}`;
    } else {
        document.getElementById('cartComboDiscountRow').style.display = 'none';
    }

    if (couponDiscountAmount > 0) {
        document.getElementById('cartCouponRow').style.display = 'flex';
        document.getElementById('cartCouponAmount').innerText = `- ${window.formatStorePrice(couponDiscountAmount)} (-${activeCoupon.percent}%)`;
    } else {
        document.getElementById('cartCouponRow').style.display = 'none';
    }

    document.getElementById('cartTotalPrice').innerText = window.formatStorePrice(finalTotal);

    // Guardar el total en una variable global para el checkout
    window.currentCartFinalTotal = finalTotal;
};

// ==========================================
// 🚀 MOTOR DE CONVERSIÓN DE MONEDA (LOCAL / USDT)
// ==========================================
window.storeDisplayCurrency = 'local'; // Por defecto muestra moneda local

window.formatStorePrice = (priceLocal) => {
    // Lee la data de la tienda o del portal
    const data = window.publicStoreDataCache || (typeof portalStoreData !== 'undefined' ? portalStoreData : null);
    if (!data) return `${priceLocal.toFixed(2)}`;

    // Si el interruptor está en USDT y el vendedor configuró la tasa
    if (window.storeDisplayCurrency === 'USDT' && data.binanceExchangeRate) {
        const rate = parseFloat(data.binanceExchangeRate);
        if (rate > 0) {
            return `USDT ${(priceLocal / rate).toFixed(2)}`;
        }
    }
    // Si no, muestra la moneda local normal
    return `${data.currency || 'S/'}${priceLocal.toFixed(2)}`;
};

window.toggleStoreCurrency = () => {
    const btn = document.getElementById('storeCurrencyToggleBtn');
    const data = window.publicStoreDataCache || portalStoreData;

    if (!data.binanceExchangeRate || parseFloat(data.binanceExchangeRate) <= 0) {
        return window.showNotification("⚠️ El vendedor no ha configurado el tipo de cambio para USDT.");
    }

    // Intercambia el estado y cambia el texto del botón
    if (window.storeDisplayCurrency === 'local') {
        window.storeDisplayCurrency = 'USDT';
        if (btn) btn.innerHTML = `<i class='bx bx-transfer-alt'></i> Mostrar en ${data.currency || 'S/'}`;
    } else {
        window.storeDisplayCurrency = 'local';
        if (btn) btn.innerHTML = `<i class='bx bx-transfer-alt'></i> Mostrar en USDT`;
    }

    // Recarga las pantallas al instante para que se vea la magia
    if (document.getElementById('publicStoreView').style.display === 'block') window.renderPublicCatalog();
    if (document.getElementById('cartPanel').classList.contains('active')) window.renderCartItems();
    if (document.getElementById('checkoutModal').style.display === 'flex' && typeof currentCheckoutItem !== 'undefined') {
        document.getElementById('checkoutItemPrice').innerText = window.formatStorePrice(currentCheckoutItem.price);
    }
};

/* =========================================================
   MÓDULO: RENDERIZADO DE TIENDA POR "VENTANAS" (SECCIONES)
========================================================= */
window.renderPublicCatalog = () => {
    const catalogBox = document.getElementById('publicStoreCatalog');
    if (!catalogBox) return;
    catalogBox.innerHTML = '';

    const catalog = window.publicCatalogCache || [];
    const data = window.publicStoreDataCache;
    if (!data) return;

    const isStoreOpen = data.storeActive !== false;
    const searchTerm = document.getElementById('publicStoreSearchInput') ? document.getElementById('publicStoreSearchInput').value.toLowerCase() : '';

    // Valores por defecto seguros para evitar que se quede en blanco
    const typeF = window.currentStoreTypeFilter || 'Todos';
    const catF = window.currentStoreCatFilter || 'Todas';

    // 1. Extraemos las categorías ÚNICAS de todo el catálogo para dibujar los botones
    const allCategories = [...new Set(catalog.map(i => i.category).filter(c => c && c !== ''))];
    const catContainer = document.getElementById('publicStoreCategoryFilters');

    if (allCategories.length > 0) {
        catContainer.style.display = 'flex';
        // Solo repintamos los botones si cambió la lista de categorías
        if (catContainer.children.length !== allCategories.length + 1) {
            catContainer.innerHTML = `<button class="spotify-chip-btn ${catF === 'Todas' ? 'active' : ''}" onclick="window.filterStoreCategory('Todas', event)">Todo el Catálogo</button>`;
            allCategories.forEach(cat => {
                catContainer.innerHTML += `<button class="spotify-chip-btn ${catF === cat ? 'active' : ''}" onclick="window.filterStoreCategory('${cat}', event)">${cat}</button>`;
            });
        } else {
            // Actualizar clases activas visualmente
            catContainer.querySelectorAll('.spotify-chip-btn').forEach(btn => {
                btn.classList.toggle('active', btn.innerText === catF || (btn.innerText === 'Todo el Catálogo' && catF === 'Todas'));
            });
        }
    } else {
        if (catContainer) catContainer.style.display = 'none';
    }

    // 2. Generamos el Título Dinámico
    const titleContainer = document.getElementById('dynamicCategoryTitle');
    if (titleContainer) {
        if (searchTerm) {
            titleContainer.innerHTML = `<span style="font-size: 13px; color: var(--mac-text-secondary); font-weight:bold;">Resultados para: "${searchTerm}"</span>`;
        } else {
            let titlePrefix = typeF === 'Combo' ? 'COMBOS DE' : (typeF === 'Servicio' ? 'SERVICIOS DE' : 'EXPLORAR');
            let rawCat = catF === 'Todas' ? 'TODO EL CATÁLOGO' : catF;

            const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
            let emojiMatch = rawCat.match(emojiRegex);
            let emoji = emojiMatch ? emojiMatch[0] : "<i class='bx bx-category'></i>";
            let cleanText = rawCat.replace(emojiRegex, '').trim().toUpperCase();

            let iconStyle = emojiMatch ? "filter: contrast(0) sepia(100%) hue-rotate(200deg) brightness(1.2) saturate(3);" : "";

            titleContainer.innerHTML = `
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--mac-surface); border: 1px solid var(--mac-border); padding: 8px 24px; border-radius: 30px; box-shadow: var(--glass-shadow);">
                    <span style="font-size: 20px; ${iconStyle} transform: translateY(-1px);">${emoji}</span>
                    <h2 style="margin: 0; font-size: 14px; color: var(--mac-text-main); font-weight: 800; letter-spacing: 0.5px;">
                        <span style="color: var(--mac-text-secondary); font-weight: 600;">${titlePrefix}</span> ${cleanText}
                    </h2>
                </div>
            `;
        }
    }

    // 3. Renderizar las "Ventanas" por Categoría
    let activeCategoriesToRender = catF === 'Todas' ? [...new Set(catalog.map(i => i.category || 'Otros'))] : [catF];
    let itemsMostrados = 0;

    activeCategoriesToRender.forEach(categoriaActual => {
        // Filtramos los items de esta categoría que también cumplan con Type y Búsqueda
        const itemsEnCategoria = catalog.filter(item => {
            const itemCat = item.category || 'Otros';
            const matchCat = itemCat === categoriaActual;
            const matchType = typeF === 'Todos' || item.type === typeF;
            const matchSearch = item.platform.toLowerCase().includes(searchTerm) || (item.desc && item.desc.toLowerCase().includes(searchTerm));
            return matchCat && matchType && matchSearch;
        });

        if (itemsEnCategoria.length === 0) return;
        itemsMostrados += itemsEnCategoria.length;

        const sectionDiv = document.createElement('div');
        sectionDiv.style.cssText = "margin-bottom: 40px; background: rgba(255, 255, 255, 0.02); padding: 20px; border-radius: 24px; border: 1px solid var(--mac-border); box-shadow: 0 10px 30px rgba(0,0,0,0.1);";

        sectionDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--mac-border); padding-bottom: 10px;">
                <div style="background: var(--mac-blue); padding: 8px; border-radius: 10px; color: white;"><i class='bx bx-category' style="font-size: 20px; margin: 0;"></i></div>
                <h2 style="margin: 0; font-size: 20px; color: var(--mac-text-main); font-weight: 800;">${categoriaActual.toUpperCase()}</h2>
            </div>
            <div class="category-items-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px;"></div>
        `;

        const gridDiv = sectionDiv.querySelector('.category-items-grid');

        // Renderizar las tarjetas
        itemsEnCategoria.forEach(item => {
            const priceStr = window.formatStorePrice(item.price);
            let isAgotado = item.status === 'agotado';
            let stockHtml = '';

            // Lógica de Etiquetas de Stock
            if (item.badgeOption === 'a_pedido') {
                stockHtml = `<span style="font-size:10px; color:var(--mac-blue); display:block; margin-top:6px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><i class='bx bx-package'></i> Disponible a pedido</span>`;
            } else if (item.autoStock && item.stockPlatforms && item.stockPlatforms.length > 0 && data.inventory) {
                const stock = data.inventory || [];
                if (item.type === 'Combo') {
                    const counts = item.stockPlatforms.map(p => stock.filter(i => i.status === 'libre' && i.platform === p).length);
                    const comboDisponible = Math.min(...counts);
                    if (comboDisponible === 0) isAgotado = true;
                    const colorStock = comboDisponible > 2 ? 'var(--mac-green)' : (comboDisponible > 0 ? 'var(--mac-orange)' : 'var(--mac-red)');
                    stockHtml = `<span style="font-size:10px; color:var(--mac-text-secondary); display:block; margin-top:6px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><i class='bx bx-box'></i> Stock Combo: <span style="color:${colorStock};">${comboDisponible} disp.</span></span>`;
                } else {
                    const cantidadLibre = stock.filter(i => i.status === 'libre' && i.platform === item.stockPlatforms[0]).length;
                    if (cantidadLibre === 0) isAgotado = true;
                    const colorStock = cantidadLibre > 2 ? 'var(--mac-green)' : (cantidadLibre > 0 ? 'var(--mac-orange)' : 'var(--mac-red)');
                    stockHtml = `<span style="font-size:10px; color:var(--mac-text-secondary); display:block; margin-top:6px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><i class='bx bx-box'></i> Stock en vivo: <span style="color:${colorStock};">${cantidadLibre} disp.</span></span>`;
                }
            }

            let typeBadgeHtml = item.type === 'Combo' ? `<div class="store-vibrant-badge badge-combo"><i class='bx bx-gift'></i> Combo</div>` : '';
            if (item.requiresInvite) typeBadgeHtml += `<div class="store-vibrant-badge" style="background:var(--mac-orange); color:white; margin-left: 5px;"><i class='bx bx-envelope'></i> Invitación</div>`;
            if (item.badgeOption) {
                if (item.badgeOption === 'oferta') typeBadgeHtml += `<div class="store-vibrant-badge badge-oferta" style="margin-left: 5px;"><i class='bx bxs-flame'></i> Oferta Especial</div>`;
                else if (item.badgeOption === 'poco_stock') typeBadgeHtml += `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #FF9500 0%, #FF5E00 100%); margin-left: 5px;"><i class='bx bx-error-alt'></i> Poco Stock</div>`;
                else if (item.badgeOption === 'tiempo_limitado') typeBadgeHtml += `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #AF52DE 0%, #5856D6 100%); margin-left: 5px;"><i class='bx bxs-time-five'></i> Tiempo Limitado</div>`;
                else if (item.badgeOption === 'nuevo') typeBadgeHtml += `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #34C759 0%, #28CD41 100%); margin-left: 5px;"><i class='bx bxs-star'></i> Nuevo Ingreso</div>`;
                else if (item.badgeOption === 'a_pedido' && !item.requiresInvite) typeBadgeHtml += `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #007AFF 0%, #0056b3 100%); margin-left: 5px;"><i class='bx bx-package'></i> A Pedido</div>`;
            }
            // --- INICIO NUEVO BADGE DE RESEÑAS ---
            let ratingHtml = '';
            const productReviews = (window.publicReviewsCache || []).filter(r => r.platform === item.platform);
            if (productReviews.length > 0) {
                const sum = productReviews.reduce((acc, r) => acc + r.rating, 0);
                const avg = (sum / productReviews.length).toFixed(1);
                ratingHtml = `<div style="display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 13px; color: #FFD700; font-weight: bold; margin-bottom: 8px;"><i class='bx bxs-star'></i> ${avg} <span style="color: var(--mac-text-secondary); font-size: 11px;">(${productReviews.length})</span></div>`;
            }

            const titleSafe = item.platform.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const descSafe = item.desc ? item.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '') : 'Sin detalles adicionales.';
            const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}" alt="${item.platform}">` : `<div style="width:100%; height:100%; background:var(--mac-gray); display:flex; align-items:center; justify-content:center;"><i class='bx bx-play-circle' style='font-size:48px; color:var(--mac-text-secondary); opacity:0.3;'></i></div>`;

            // --- INICIO GENERADOR DE PESTAÑAS PÚBLICAS ---
            let tabsData = item.storeTabs || [];
            if (tabsData.length === 0) { // Retrocompatibilidad para productos viejos
                const opts = item.pricingOptions && item.pricingOptions.length > 0 ? item.pricingOptions : [{ label: '1 Mes', price: item.price }];
                tabsData = [{ name: 'General', options: opts }];
            }

            const showTabs = tabsData.length > 1 || (tabsData.length === 1 && tabsData[0].name !== 'General' && tabsData[0].name !== 'Opciones' && tabsData[0].name !== '');
            let tabsHtml = '';

            if (showTabs) {
                tabsHtml += `<div style="display:flex; overflow-x:auto; gap:8px; margin-bottom:12px; scrollbar-width:none; padding-bottom:4px;">`;
                tabsData.forEach((t, i) => {
                    const isSelected = i === 0;
                    const bg = isSelected ? 'var(--mac-blue)' : 'var(--mac-surface)';
                    const color = isSelected ? 'white' : 'var(--mac-text-secondary)';
                    const border = isSelected ? 'var(--mac-blue)' : 'var(--mac-border)';
                    tabsHtml += `<div id="pub_tab_${item.id}_${i}" onclick="window.selectPubTab('${item.id}', ${i})" class="pub-tab-${item.id}" style="background:${bg}; color:${color}; border: 1px solid ${border}; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition: 0.2s;">${t.name}</div>`;
                });
                tabsHtml += `</div>`;
            }

            let optionsHtml = `<div id="pub_options_${item.id}" style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:15px;">`;
            // Dibujamos las opciones de la Primera Pestaña por defecto
            tabsData[0].options.forEach((opt, i) => {
                const isSelected = i === 0;
                const borderColor = isSelected ? 'var(--mac-blue)' : 'var(--mac-border)';
                const bg = isSelected ? 'rgba(0, 122, 255, 0.1)' : 'var(--mac-surface)';
                optionsHtml += `
                    <label id="opt_label_${item.id}_${i}" onclick="window.selectPubOption('${item.id}', 0, ${i}, ${opt.price}, '${opt.label.replace(/'/g, "\\'")}')" class="pub-opt-${item.id}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-radius:12px; border:1px solid ${borderColor}; background:${bg}; cursor:pointer; transition:all 0.2s;">
                        <span style="font-size:14px; font-weight:600; color:var(--mac-text-main);">${opt.label}</span>
                        <span style="font-size:15px; font-weight:800; color:var(--mac-text-main);">${window.formatStorePrice(opt.price)}</span>
                    </label>
                `;
            });
            optionsHtml += `</div>`;

            if (!window.storeItemsTabsData) window.storeItemsTabsData = {};
            window.storeItemsTabsData[item.id] = tabsData;
            window.storeSelectedOptions[item.id] = { price: tabsData[0].options[0].price, label: (tabsData[0].name !== 'General' && showTabs ? tabsData[0].name + ' - ' : '') + tabsData[0].options[0].label };

            let pricingHtml = `
                ${tabsHtml}
                ${optionsHtml}
                <div style="text-align: center; margin-top: 5px; margin-bottom: 15px; font-size: 24px; font-weight: 900; color: var(--mac-green);" id="priceDisplay_${item.id}">
                    ${window.formatStorePrice(tabsData[0].options[0].price)}
                </div>
            `;
            // --- FIN GENERADOR DE PESTAÑAS PÚBLICAS ---

            let btnHTML = '';
            if (!isStoreOpen) {
                btnHTML = `<button disabled style="width:100%; padding:14px; border-radius:14px; font-weight:800; font-size:15px; background: var(--mac-gray); color: var(--mac-text-secondary); border:none;"><i class='bx bx-store-alt'></i> Tienda Cerrada</button>`;
            } else if (isAgotado) {
                btnHTML = `<button disabled style="width:100%; padding:14px; border-radius:14px; font-weight:800; font-size:15px; background: var(--mac-red); color: white; border:none;">Agotado</button>`;
            } else {
                btnHTML = `<button onclick="window.addToCartWithOptions('${item.id}')" style="width:100%; padding:14px; border-radius:14px; font-weight:800; font-size:15px; background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%); color: white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 4px 15px rgba(0, 122, 255, 0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    Añadir al carrito <i class='bx bx-cart-add' style="font-size:20px;"></i>
                </button>`;
            }

            const card = document.createElement('div');
            card.className = `store-product-card ${isAgotado || !isStoreOpen ? 'is-agotado' : ''}`;

            card.innerHTML = `
                ${typeBadgeHtml}
                <button class="store-share-btn" onclick="event.stopPropagation(); window.shareProduct('${item.id}')" title="Compartir Oferta"><i class='bx bx-share-alt'></i></button>
                <div class="store-product-visual" onclick="window.openProductDesc('${titleSafe}', '${descSafe}')">
                    ${imgHTML}
                    <div class="store-product-visual-overlay"><span class="view-desc-hint"><i class='bx bx-zoom-in'></i> Detalles</span></div>
                </div>
                <div class="store-product-glass-footer" style="padding: 15px; display: flex; flex-direction: column;">
                ${ratingHtml}
                    <strong class="store-product-title" style="display:block; font-size:18px; line-height:1.3; color: var(--mac-text-main); word-break: break-word; text-align: center;">${item.platform}</strong>
                    ${stockHtml ? `<div style="text-align:center; margin-top:5px;">${stockHtml}</div>` : ''}
                    
                    ${pricingHtml}
                    ${btnHTML}
                </div>
            `;
            gridDiv.appendChild(card);
        });

        catalogBox.appendChild(sectionDiv);
    });

    if (itemsMostrados === 0) {
        catalogBox.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); width: 100%; grid-column: 1/-1; padding: 40px 0; font-weight: 500;">No hay productos que coincidan con la búsqueda o filtro.</p>';
    }
};

// Pequeño parche para el Checkout (Enviamos el total ya con descuento)
const originalOpenCheckout = window.openCheckoutFromCart;
window.openCheckoutFromCart = () => {
    originalOpenCheckout();
    const data = window.publicStoreDataCache;
    // Sobrescribir el precio con el total calculado
    if (document.getElementById('checkoutItemPrice')) {
        document.getElementById('checkoutItemPrice').innerText = `${data.currency || 'S/'}${window.currentCartFinalTotal.toFixed(2)}`;
    }
    if (currentCheckoutItem) currentCheckoutItem.price = window.currentCartFinalTotal; // Para que pase a la BD
};
/* =========================================================
   MÓDULO: EXPORTADOR DE CATÁLOGO A ESTADOS (IMÁGENES HD)
========================================================= */
window.generateCatalogImages = async () => {
    const catalog = currentUserData.storeCatalog || [];
    const availableItems = catalog.filter(i => i.status !== 'agotado');

    if (availableItems.length === 0) {
        return window.showNotification("⚠️ No tienes productos disponibles en el catálogo para exportar.");
    }

    // Modal de espera
    Swal.fire({
        title: '📸 Preparando Estudio Fotográfico',
        html: '<p style="color:var(--mac-text-secondary); font-size:14px;">Estamos agrupando tus productos y generando las imágenes en alta calidad (1080x1920). Esto puede tomar unos segundos.</p>',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); },
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    try {
        // 1. Agrupar productos por categoría
        const categories = {};
        availableItems.forEach(item => {
            const cat = item.category || 'VARIOS';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(item);
        });

        // 2. Pre-cargar el Logo y Banner del usuario (Conversión a Base64 para evitar errores CORS en html2canvas)
        const loadImgToBase64 = async (url) => {
            if (!url) return null;
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(null);
            });
        };

        const safeLogoBase64 = await loadImgToBase64(currentUserData.logoUrl);
        const safeBannerBase64 = await loadImgToBase64(currentUserData.bannerUrl);

        // Referencias de la plantilla DOM
        const template = document.getElementById('statusExportTemplate');
        template.style.left = '0px'; // Lo traemos al frente visiblemente invisible (z-index negativo)

        document.getElementById('statusBrandName').innerText = currentUserData.name || 'Mi Marca';

        const logoEl = document.getElementById('statusLogo');
        if (safeLogoBase64) {
            logoEl.src = safeLogoBase64;
            logoEl.style.display = 'block';
        } else {
            logoEl.style.display = 'none';
        }

        const bannerEl = document.getElementById('statusBannerBg');
        if (safeBannerBase64) {
            bannerEl.style.backgroundImage = `url(${safeBannerBase64})`;
        } else {
            bannerEl.style.backgroundImage = 'none';
        }

        // Llenar métodos de pago
        const pmContainer = document.getElementById('statusPaymentMethods');
        pmContainer.innerHTML = '';
        const methods = currentUserData.paymentMethods || [];
        if (methods.length > 0) {
            methods.forEach(m => {
                pmContainer.innerHTML += `<span style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 15px; font-size: 20px; font-weight: bold;">🏦 ${m.bank}</span>`;
            });
        } else {
            pmContainer.innerHTML = `<span style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 15px; font-size: 20px; font-weight: bold;">💳 Pregunta por nuestros medios de pago</span>`;
        }

        // 3. Crear imágenes página por página
        let generatedImagesUrls = [];
        const itemsPerPage = 4; // Máximo 4 productos por estado para que se vea legible

        for (const cat in categories) {
            const items = categories[cat];
            document.getElementById('statusCategoryTitle').innerText = cat;

            for (let i = 0; i < items.length; i += itemsPerPage) {
                const chunk = items.slice(i, i + itemsPerPage);

                // Llenar los productos en el contenedor
                const itemsContainer = document.getElementById('statusItemsContainer');
                itemsContainer.innerHTML = '';

                for (const item of chunk) {
                    // Cargar imagen del producto si tiene
                    let prodImgHtml = `<div style="width: 220px; height: 220px; background: rgba(255,255,255,0.05); border-radius: 30px; display:flex; align-items:center; justify-content:center; border: 2px dashed rgba(255,255,255,0.2);"><i class='bx bx-play-circle' style='font-size:80px; color:rgba(255,255,255,0.2);'></i></div>`;
                    if (item.imgUrl) {
                        const safeProdImg = await loadImgToBase64(item.imgUrl);
                        if (safeProdImg) {
                            prodImgHtml = `<img src="${safeProdImg}" style="width: 220px; height: 220px; border-radius: 30px; object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">`;
                        }
                    }

                    // Armar los precios (máximo mostrar 2 para no romper el diseño)
                    let preciosHtml = '';
                    const opciones = item.pricingOptions && item.pricingOptions.length > 0 ? item.pricingOptions : [{ label: '1 Mes', price: item.price }];

                    opciones.slice(0, 2).forEach(opt => {
                        preciosHtml += `
                            <div style="background: rgba(255,255,255,0.1); padding: 12px 25px; border-radius: 20px; display: inline-flex; flex-direction: column; justify-content: center; border: 1px solid rgba(255,255,255,0.15);">
                                <span style="font-size: 16px; color: #86868b; font-weight: bold; text-transform: uppercase;">${opt.label}</span>
                                <span style="font-size: 28px; color: #fff; font-weight: 900;">${currentUserData.currency || 'S/'}${opt.price.toFixed(2)}</span>
                            </div>
                        `;
                    });

                    // Etiqueta destacada
                    let tagHtml = '';
                    if (item.badgeOption === 'oferta') tagHtml = `<span style="background: #FF2D55; color: white; font-size: 18px; padding: 6px 15px; border-radius: 12px; font-weight: bold; margin-left: 15px;">🔥 OFERTA</span>`;
                    else if (item.badgeOption === 'nuevo') tagHtml = `<span style="background: #34C759; color: white; font-size: 18px; padding: 6px 15px; border-radius: 12px; font-weight: bold; margin-left: 15px;">✨ NUEVO</span>`;

                    // Ensamblar tarjeta horizontal
                    itemsContainer.innerHTML += `
                        <div style="background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.08); border-radius: 40px; padding: 30px; display: flex; gap: 40px; align-items: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                            ${prodImgHtml}
                            <div style="flex: 1;">
                                <h3 style="margin: 0 0 15px 0; font-size: 42px; color: #ffffff; line-height: 1.1; font-weight: 800;">${item.platform} ${tagHtml}</h3>
                                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                    ${preciosHtml}
                                </div>
                            </div>
                        </div>
                    `;
                }

                // Dar tiempo al DOM para renderizar
                await new Promise(r => setTimeout(r, 200));

                // Tomar la foto
                const canvas = await html2canvas(template, {
                    backgroundColor: '#1c1c1e',
                    scale: 1, // Escala 1 = 1080x1920 nativo
                    useCORS: true,
                    logging: false
                });

                generatedImagesUrls.push({
                    url: canvas.toDataURL('image/png'),
                    name: `Estado_${cat.replace(/\s+/g, '_')}_Parte_${(i / itemsPerPage) + 1}.png`
                });
            }
        }

        template.style.left = '-9999px'; // Ocultar plantilla nuevamente

        // 4. Descargar imágenes automáticamente en secuencia
        Swal.fire({
            icon: 'success',
            title: '¡Listo!',
            text: `Se generaron ${generatedImagesUrls.length} imagen(es). Comenzando la descarga...`,
            timer: 2000,
            showConfirmButton: false,
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        });

        // Loop de descarga con pausa para que el navegador no bloquee los popups
        for (let i = 0; i < generatedImagesUrls.length; i++) {
            const imgData = generatedImagesUrls[i];
            const link = document.createElement('a');
            link.download = imgData.name;
            link.href = imgData.url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            await new Promise(r => setTimeout(r, 800)); // Pausa de 800ms entre descargas
        }

    } catch (error) {
        console.error("Error generando estados:", error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Ocurrió un problema al generar las imágenes. Intenta subir tu logo y banner nuevamente.',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        });
        document.getElementById('statusExportTemplate').style.left = '-9999px';
    }
};
/* =========================================================
   🤖 TUTORIAL CONTEXTUAL DINÁMICO (DRIVER.JS)
========================================================= */
window.startContextTutorial = () => {
    // 1. Detectamos la sección exacta usando la misma lógica del Asistente
    let activeSection = 'clientes';

    if (document.getElementById('adminView').style.display === 'block') {
        activeSection = 'admin';
    } else if (document.getElementById('inventoryModal').classList.contains('active-section') || document.getElementById('inventoryModal').style.display === 'flex') {
        activeSection = 'inventory';
    } else if (document.getElementById('storeModal').classList.contains('active-section') || document.getElementById('storeModal').style.display === 'flex') {
        activeSection = 'store';
    } else if (document.getElementById('pedidosModal').classList.contains('active-section') || document.getElementById('pedidosModal').style.display === 'flex') {
        activeSection = 'pedidos';
    } else if (document.getElementById('profileSection').classList.contains('active-section')) {
        activeSection = 'profile';
    } else if (document.getElementById('accountsTableContainer').style.display === 'block') {
        activeSection = 'matrices';
    }

    // 2. Cerramos el panel del asistente para que no estorbe visualmente
    window.closeAssistant();

    // 3. Diccionario maestro de recorridos por sección
    const tutorialSteps = {
        'clientes': [
            { popover: { title: 'Gestión de Clientes', description: 'Aquí puedes registrar, editar y administrar todos tus clientes.' } },
            { element: '#homeSection .header-top', popover: { title: 'Acciones Rápidas', description: 'Accede al Portal de Clientes, Finanzas o Auto-WA desde aquí.' } },
            { element: '#clientForm', popover: { title: 'Registrar Cliente', description: 'Llena este formulario para registrar una nueva venta o renovación.' } },
            { element: '#topControlsBar', popover: { title: 'Buscador y Filtros', description: 'Busca clientes por nombre, teléfono o fíltralos por su estado.' } },
            { element: '#mainTable', popover: { title: 'Lista de Clientes', description: 'Tus clientes aparecerán aquí. Haz clic en "⚙️ Opciones" para WhatsApp, Portal o Renovar.' } }
        ],
        'matrices': [
            { popover: { title: 'Cuentas Matrices', description: 'Aquí gestionas tus cuentas completas y controlas la disponibilidad de sus perfiles.' } },
            { element: '#accountsTableContainer button', popover: { title: 'Nueva Matriz', description: 'Haz clic aquí para agregar una cuenta proveedora o propia al sistema.' } },
            { element: '#masterAccountsList', popover: { title: 'Lista de Matrices', description: 'Visualiza el estado de cada cuenta, sus ganancias y asigna perfiles libres a tus clientes.' } }
        ],
        'inventory': [
            { popover: { title: 'Inventario de Cuentas', description: 'Tu bodega privada de cuentas libres, listas para ser vendidas.' } },
            { element: '#invPlatform', popover: { title: 'Añadir al Stock', description: 'Ingresa los datos de una nueva cuenta aquí para tenerla lista cuando alguien te compre.' } },
            { element: '#inventoryList', popover: { title: 'Cuentas Disponibles', description: 'Usa el botón verde de "Entregar" para enviar rápidamente una cuenta a un cliente nuevo.' } }
        ],
        'store': [
            { popover: { title: 'Mi Tiendita Web', description: 'Configura tu catálogo público para vender en automático 24/7.' } },
            { element: '.chrome-tabs-container', popover: { title: 'Pestañas de Configuración', description: 'Navega fácilmente entre tu Catálogo, Cupones de descuento y Ajustes Generales.' } },
            { element: '#storePlatform', popover: { title: 'Agregar Producto', description: 'Añade nuevos servicios o combos a tu tienda desde este formulario.' } },
            { element: '#storeActiveToggle', popover: { title: 'Interruptor de Tienda', description: 'Controla si tu tienda está ABIERTA o CERRADA para el público.' } }
        ],
        'pedidos': [
            { popover: { title: 'Ventas Pendientes', description: 'Aquí llegarán todas las compras y comprobantes de pago de tu Tiendita Web.' } },
            { element: '#pedidosList', popover: { title: 'Revisar y Aprobar', description: 'Verifica la captura de pago y aprueba la entrega para que el sistema le asigne la cuenta al cliente.' } }
        ],
        'profile': [
            { popover: { title: 'Mi Perfil & Bot', description: 'Configura la identidad visual de tu negocio y la automatización de WhatsApp.' } },
            { element: '#editLogoUpload', popover: { title: 'Marca Blanca', description: 'Sube tu logo y banner para personalizar tu Tiendita y tus recibos.' } },
            { element: '#newCustomServiceInput', popover: { title: 'Servicios Personalizados', description: 'Agrega las plataformas exactas que tú vendes para que aparezcan en todo tu panel.' } },
            { element: '#paymentMethodsContainer', popover: { title: 'Métodos de Pago', description: 'Configura Yape, Plin o Binance para que tus clientes te paguen en la tienda.' } },
            { element: '#qrContainer', popover: { title: 'Bot de WhatsApp', description: 'Escanea el QR para que tu número envíe los mensajes automáticos de cobro y entregas.' } }
        ],
        'admin': [
            { popover: { title: 'Panel Global A.G.C.', description: 'Control total de todos los distribuidores del sistema.' } },
            { element: '#adminFilterPlan', popover: { title: 'Filtros y Búsqueda', description: 'Busca distribuidores rápidamente por su estado o nivel de plan.' } },
            { element: '#btnSubmitNews', popover: { title: 'Novedades', description: 'Publica noticias, actualizaciones o avisos importantes para todos los paneles.' } }
        ]
    };

    // 4. Lanzamos Driver.js
    const driver = window.driver.js.driver;
    const driverObj = driver({
        showProgress: true,
        nextBtnText: 'Siguiente &rarr;',
        prevBtnText: '&larr; Atrás',
        doneBtnText: '¡Entendido! 🚀',
        popoverClass: 'driverjs-theme-dark',
        // Seleccionamos los pasos de la sección activa (o por defecto, la de clientes)
        steps: tutorialSteps[activeSection] || tutorialSteps['clientes']
    });

    driverObj.drive();
};


// Función para el efecto sorpresa visual (Cambia el precio verde grande en vivo)
window.updateCardPrice = (itemId, selectEl) => {
    const option = selectEl.options[selectEl.selectedIndex];
    const price = parseFloat(option.getAttribute('data-price'));
    const displayEl = document.getElementById('price_display_' + itemId);
    if (displayEl) {
        displayEl.innerText = `${window.publicStoreDataCache.currency || 'S/'}${price.toFixed(2)}`;
        // Pequeño efecto de latido para que el cliente note el cambio
        displayEl.style.transform = 'scale(1.1)';
        setTimeout(() => displayEl.style.transform = 'scale(1)', 150);
    }
};

// Función para atrapar el precio exacto y agregarlo al carrito
window.addToCartConDuracion = (itemId) => {
    const catalog = window.publicCatalogCache || [];
    const originalItem = catalog.find(i => i.id === itemId);
    if (!originalItem) return;

    const selectElement = document.getElementById('duracion_' + itemId);
    const meses = parseInt(selectElement.value) || 1;
    const option = selectElement.options[selectElement.selectedIndex];
    const finalPrice = parseFloat(option.getAttribute('data-price'));

    // Clonamos para no alterar la BD original
    const cartItem = { ...originalItem };
    cartItem.price = finalPrice;

    // Personalizamos el nombre en el carrito
    if (meses > 1) {
        cartItem.platform = `${originalItem.platform} (${meses} Meses)`;
    }

    window.storeCart.push(cartItem);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    document.getElementById('floatingCartBtn').style.display = 'flex';

    document.getElementById('cartPanelOverlay').classList.add('active');
    document.getElementById('cartPanel').classList.add('active');
    window.renderCartItems();
};

// Ilumina la opción seleccionada y apaga las demás
window.selectPricingOption = (itemId, index) => {
    const labels = document.querySelectorAll(`[id^="opt_label_${itemId}_"]`);
    labels.forEach((lbl, i) => {
        if (i === index) {
            lbl.style.borderColor = 'var(--mac-blue)';
            lbl.style.background = 'rgba(0, 122, 255, 0.1)';
            lbl.querySelector('input').checked = true;
        } else {
            lbl.style.borderColor = 'var(--mac-border)';
            lbl.style.background = 'var(--mac-surface)';
            lbl.querySelector('input').checked = false;
        }
    });
};

// Manda al carrito leyendo el radio button invisible
const originalOpenStoreModal = window.openStoreModal;
window.openStoreModal = () => {
    originalOpenStoreModal();
    const builder = document.getElementById('builder-crear');
    if (builder && builder.children.length === 0) {
        window.addTabToBuilder('builder-crear', '1 Mes', [{ label: 'Perfil', price: '' }]);
    }
};

window.addToCartWithOptions = (itemId) => {
    const catalog = window.publicCatalogCache || [];
    const originalItem = catalog.find(i => i.id === itemId);
    if (!originalItem) return;

    // Recupera la opción seleccionada por la función de Pestañas
    const selectedOpt = window.storeSelectedOptions[itemId] || { price: originalItem.price, label: '' };

    const cartItem = { ...originalItem };
    cartItem.price = selectedOpt.price;
    if (selectedOpt.label && selectedOpt.label !== '1 Mes' && selectedOpt.label !== 'General') {
        cartItem.platform = `${originalItem.platform} (${selectedOpt.label})`;
    }

    window.storeCart.push(cartItem);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    document.getElementById('floatingCartBtn').style.display = 'flex';
    document.getElementById('cartPanelOverlay').classList.add('active');
    document.getElementById('cartPanel').classList.add('active');
    window.renderCartItems();
};

/* =========================================================
   SOPORTE PREMIUM: SCROLL HORIZONTAL EN PC (ARRASTRAR Y RUEDA)
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    // Atrapamos las dos barras horizontales de la tiendita
    const scrollContainers = [
        document.getElementById('publicStoreCategoryFilters'),
        document.getElementById('publicStoreFilters')
    ];

    scrollContainers.forEach(container => {
        if (!container) return;

        // 1. MODO RUEDA DEL RATÓN
        container.addEventListener('wheel', (evt) => {
            // Solo activamos la rueda horizontal si hay suficientes categorías para scrollear
            if (container.scrollWidth > container.clientWidth) {
                evt.preventDefault(); // Evita que la página baje
                container.scrollLeft += evt.deltaY; // Mueve la barra de lado a lado
            }
        });

        // 2. MODO "CLIC Y ARRASTRAR" (Como si fuera táctil en celular)
        let isDown = false;
        let startX;
        let scrollLeft;

        container.addEventListener('mousedown', (e) => {
            isDown = true;
            container.style.cursor = 'grabbing'; // Cambia el cursor a una manito cerrada
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
        });

        container.addEventListener('mouseleave', () => {
            isDown = false;
            container.style.cursor = 'pointer'; // Vuelve al cursor normal
        });

        container.addEventListener('mouseup', () => {
            isDown = false;
            container.style.cursor = 'pointer';
        });

        container.addEventListener('mousemove', (e) => {
            if (!isDown) return; // Si no está haciendo clic, no hace nada
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 2; // El "2" es la velocidad de arrastre
            container.scrollLeft = scrollLeft - walk;
        });
    });
});

// --- CONTROLADOR DE PESTAÑAS DE FINANZAS ---
window.switchFinanceTab = (tabId, element) => {
    // 1. Ocultar todos los contenidos de las pestañas
    document.querySelectorAll('.finance-tab').forEach(tab => {
        tab.style.display = 'none';
    });

    // 2. Mostrar el contenido seleccionado
    document.getElementById(tabId).style.display = 'block';

    // 3. Quitar el color azul a todas las pestañas y ponérselo a la cliqueada
    document.querySelectorAll('#financeSection .chrome-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    element.classList.add('active');

    // 4. Parche mágico para ApexCharts (Fuerza a redibujar los gráficos si estaban ocultos)
    if (tabId === 'tabTendencias') {
        window.dispatchEvent(new Event('resize'));
    }
};

/* =========================================================
   MODO PREVISUALIZACIÓN DEMO (SIN REGISTRO)
========================================================= */
window.isDemoMode = false;

window.checkDemo = () => {
    if (window.isDemoMode) {
        Swal.fire({
            icon: 'info',
            title: 'Modo Previsualización',
            text: 'Estás viendo una demo interactiva. Para guardar cambios, vincular clientes y usar las herramientas, debes crear tu cuenta.',
            confirmButtonText: 'Crear mi cuenta gratis',
            showCancelButton: true,
            cancelButtonText: 'Seguir mirando',
            confirmButtonColor: '#007AFF',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        }).then(r => {
            if (r.isConfirmed) {
                window.location.reload(); // Quita la demo y lo regresa al registro
            }
        });
        return true;
    }
    return false;
};

window.chooseDemoMode = async () => {
    const { value: planElegido } = await Swal.fire({
        title: 'Selecciona la interfaz a probar',
        input: 'select',
        inputOptions: {
            'basico': 'Plan Básico (Esencial)',
            'pro': 'Plan PRO (Automatizado)'
        },
        inputPlaceholder: 'Elige un plan',
        showCancelButton: true,
        confirmButtonText: 'Entrar al Panel',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007AFF',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    if (planElegido) {
        window.startVisualDemo(planElegido);
    }
};

window.startVisualDemo = (plan) => {
    window.isDemoMode = true;

    // Inyectar datos falsos en memoria local (no toca Firebase)
    currentUser = { uid: 'demo_user' };
    currentUserData = {
        name: 'Usuario Demo',
        role: 'user',
        active: true,
        plan_actual: plan,
        currency: 'S/',
        storeAlias: 'demo-store',
        inventory: [
            { id: 'inv1', platform: 'Netflix', type: 'Perfil', email: 'demo@netflix.com', pass: '123456', profile: '1', pin: '0000', status: 'libre' },
            { id: 'inv2', platform: 'Disney+', type: 'Completa', email: 'disney@demo.com', pass: 'demo123', profile: '', pin: '', status: 'libre' }
        ],
        storeCatalog: [
            { id: 'item1', platform: 'Netflix (1 Mes)', price: 15, pricingOptions: [{ label: '1 Mes', price: 15 }], category: 'Streaming', desc: 'Pantalla 4K Demo', imgUrl: '', type: 'Servicio', status: 'disponible', autoStock: false },
            { id: 'item2', platform: 'Combo Premium', price: 25, pricingOptions: [{ label: '1 Mes', price: 25 }], category: 'Combos', desc: 'Netflix + Disney', imgUrl: '', type: 'Combo', status: 'disponible', autoStock: false }
        ],
        storeCategories: ['Streaming', 'Combos'],
        customServices: ['Netflix', 'Disney+', 'HBO Max', 'Spotify Premium'],
        financialGoal: 1500
    };

    clients = [
        { id: 'c1', name: 'Juan Pérez', platform: 'Netflix', phone: '+51999888777', date: new Date(Date.now() + 864000000).toISOString(), cost: 10, price: 15, accountUnits: 1, renovations: 2, statusCat: 'active' },
        { id: 'c2', name: 'María Gómez', platform: 'Disney+', phone: '+51999888666', date: new Date(Date.now() - 86400000).toISOString(), cost: 8, price: 12, accountUnits: 1, renovations: 0, statusCat: 'expired' }
    ];

    // Interceptar silenciosamente las funciones de guardado para que no rompan
    const funcToBlock = [
        'saveClientData', 'deleteClient', 'renewClient', 'saveWaMessage',
        'saveProfile', 'addStoreItem', 'deleteStoreItem', 'addInventoryAccount',
        'deleteInventoryAccount', 'saveStoreSettings', 'saveMasterAccount',
        'deleteMasterAccount', 'submitCheckout', 'toggleStoreActive'
    ];

    funcToBlock.forEach(fn => {
        const originalFn = window[fn];
        if (originalFn) {
            window[fn] = (...args) => {
                if (window.checkDemo()) return;
                return originalFn(...args);
            };
        }
    });

    // Renderizar la Vista Principal
    showView('appView');

    const brandName = document.getElementById('brandNameSidebar');
    if (brandName) brandName.innerText = 'Usuario Demo';

    const mobileName = document.getElementById('mobileBrandName');
    if (mobileName) mobileName.innerText = 'Usuario Demo';

    const planBadgeSide = document.getElementById('userPlanBadgeSidebar');
    if (planBadgeSide) {
        planBadgeSide.innerText = `Plan ${plan.toUpperCase()}`;
        planBadgeSide.className = plan === 'pro' ? 'badge-pro-animated' : '';
        planBadgeSide.style.display = 'inline-block';
    }

    window.renderTable();
    window.renderInventory();
    window.syncStoreCategories();
    window.renderStoreItems();
    window.populateAllServiceSelects();
    if (document.getElementById('statsPanel')) window.toggleStats(true);

    window.showNotification("¡Bienvenido al Modo Demo! Explora las herramientas.");
};

/* =========================================================
   🚀 NAVEGACIÓN NATIVA (BOTÓN ATRÁS EN MÓVILES)
========================================================= */

// 1. Modificamos el cambio de secciones para inyectar historial
const nativeSwitchDashboardSection = window.switchDashboardSection;
window.switchDashboardSection = (sectionId, menuElement) => {
    // Evitamos empujar historial si ya estamos yendo al Home
    if (sectionId !== 'homeSection') {
        history.pushState({ section: sectionId }, '', '#' + sectionId);
    }
    nativeSwitchDashboardSection(sectionId, menuElement);
};

// 2. Modificamos la apertura del menú móvil para inyectar historial
const nativeToggleMobileMenu = window.toggleMobileMenu;
window.toggleMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    // Si se está ABRIENDO en un celular, agregamos un estado al historial
    if (sidebar && !sidebar.classList.contains('mobile-open') && window.innerWidth <= 768) {
        history.pushState({ menu: 'open' }, '', '#menu');
    }
    nativeToggleMobileMenu();
};

// 3. Modificamos closeModals para limpiar la URL visualmente
const nativeCloseModalsNative = window.closeModals;
window.closeModals = (resetTab = true) => {
    nativeCloseModalsNative(resetTab);
    if (resetTab) {
        // Limpiamos el #hash de la URL cuando volvemos al inicio
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
};

// 4. EL CEREBRO: Escuchar el botón físico/gesto "Atrás" del celular
window.addEventListener('popstate', (event) => {
    // Capa A: Si el menú lateral está abierto en celular, lo cerramos
    const sidebar = document.getElementById('mainSidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
        nativeToggleMobileMenu(); // Cierra el menú visualmente
        return;
    }

    // Capa B: Si hay modales emergentes (Opciones de WhatsApp, Checkout, etc.), cerrarlos
    const openModals = Array.from(document.querySelectorAll('.modal-overlay')).filter(m =>
        m.style.display === 'flex' && !m.classList.contains('active-section')
    );
    if (openModals.length > 0) {
        window.closeModals(false);
        return;
    }

    // Capa C: Si estamos dentro de Tiendita, Inventario o Finanzas -> Volver al Dashboard Central
    const homeSection = document.getElementById('homeSection');
    if (homeSection && !homeSection.classList.contains('active-section')) {
        window.closeModals(true);
        return;
    }
});

/* =========================================================
   MÓDULO: SISTEMA DE RESEÑAS Y CALIFICACIONES (ALIEXPRESS)
========================================================= */
window.currentReviewData = { clientId: null, platform: null, clientName: null };
window.currentStarRating = 5;

// Interacción visual de las estrellas en el modal del cliente
document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        window.currentStarRating = parseInt(e.target.getAttribute('data-val'));
        document.querySelectorAll('.star-btn').forEach(s => {
            if (parseInt(s.getAttribute('data-val')) <= window.currentStarRating) {
                s.style.color = '#FFD700'; // Dorado
            } else {
                s.style.color = 'var(--mac-text-secondary)'; // Gris
            }
        });
    });
});

window.openReviewModal = (clientId, platform, clientName, clientPhone) => {
    window.currentReviewData = { clientId, platform, clientName, clientPhone };
    document.getElementById('reviewPlatformName').innerText = platform;
    document.getElementById('reviewComment').value = '';

    window.currentStarRating = 5;
    document.querySelectorAll('.star-btn').forEach(s => s.style.color = '#FFD700');

    document.getElementById('clientReviewModal').style.display = 'flex';
};

window.submitReview = async () => {
    const comment = document.getElementById('reviewComment').value.trim();
    const btn = document.getElementById('btnSubmitReview');
    const origText = btn.innerHTML;
    btn.innerHTML = "Enviando... <i class='bx bx-loader-alt bx-spin'></i>";
    btn.disabled = true;

    try {
        // 1. VALIDACIÓN ANTI-SPAM Y ACTUALIZACIÓN
        // Buscamos si ya existe una reseña de este teléfono para este vendedor
        const qCheck = query(
            collection(db, "reviews"),
            where("vendedorId", "==", portalStoreData.uid),
            where("clientPhone", "==", window.currentReviewData.clientPhone || '')
        );
        const snapCheck = await getDocs(qCheck);

        let yaComento = false;
        let idResenaAnterior = null;

        snapCheck.forEach(doc => {
            const data = doc.data();
            // Verificamos si la plataforma original base (ej: "Netflix") coincide
            if (data.originalPlatform === window.currentReviewData.platform) {
                yaComento = true;
                idResenaAnterior = doc.id;
            }
        });

        if (yaComento) {
            // Si ya había comentado, ACTUALIZAMOS su comentario y lo volvemos a poner en "Pendiente"
            await updateDoc(doc(db, "reviews", idResenaAnterior), {
                rating: window.currentStarRating,
                comment: comment,
                status: 'pendiente', // Pasa a pendiente para que tú lo vuelvas a aprobar
                date: new Date().toISOString()
            });
        } else {
            // Si es su primera vez, creamos la reseña nueva
            await addDoc(collection(db, "reviews"), {
                vendedorId: portalStoreData.uid,
                clientId: window.currentReviewData.clientId,
                clientName: window.currentReviewData.clientName,
                clientPhone: window.currentReviewData.clientPhone || '',
                platform: window.currentReviewData.platform,
                originalPlatform: window.currentReviewData.platform, // <-- CLAVE: Guarda el nombre original intocable
                rating: window.currentStarRating,
                comment: comment,
                status: 'pendiente',
                date: new Date().toISOString()
            });
        }

        document.getElementById('clientReviewModal').style.display = 'none';
        Swal.fire({
            icon: 'success',
            title: '¡Gracias por tu reseña!',
            text: yaComento ? 'Tu calificación anterior ha sido actualizada.' : 'Tu calificación ha sido enviada al proveedor.',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        });
    } catch (e) {
        console.error(e);
        window.showNotification("Error enviando reseña.");
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
};
// ---------------------------------------------------------
// FUNCIONES DEL VENDEDOR (ADMIN) PARA GESTIONAR RESEÑAS
// ---------------------------------------------------------
window.loadAdminReviews = async () => {
    const list = document.getElementById('adminReviewsList');
    list.innerHTML = '<p style="text-align: center; color: var(--mac-text-secondary); font-size: 13px;">Cargando reseñas...</p>';

    try {
        const qRev = query(collection(db, "reviews"), where("vendedorId", "==", currentUser.uid));
        const snap = await getDocs(qRev);

        if (snap.empty) {
            list.innerHTML = '<p style="text-align: center; color: var(--mac-text-secondary); font-size: 13px; padding: 20px;">Tus clientes aún no han dejado reseñas.</p>';
            return;
        }

        list.innerHTML = '';
        let reviews = [];
        snap.forEach(d => reviews.push({ id: d.id, ...d.data() }));

        // Soporte para fecha en inglés (date) o español (fecha)
        reviews.sort((a, b) => new Date(b.fecha || b.date) - new Date(a.fecha || a.date));

        reviews.forEach(r => {
            let stars = '';
            for (let i = 0; i < 5; i++) {
                stars += `<i class='bx bxs-star' style="color: ${i < r.rating ? '#FFD700' : 'var(--mac-text-secondary)'};"></i>`;
            }

            let statusBadge = r.status === 'aprobada'
                ? `<span style="color: var(--mac-green); font-size: 10px; font-weight: bold; padding: 3px 8px; background: rgba(52, 199, 89, 0.1); border-radius: 6px;">Aprobada (Pública)</span>`
                : `<span style="color: var(--mac-orange); font-size: 10px; font-weight: bold; padding: 3px 8px; background: rgba(255, 149, 0, 0.1); border-radius: 6px;">Pendiente (Oculta)</span>`;

            // 🔥 Variables seguras que evitan el error undefined
            const nombreSeguro = r.clienteNombre || r.clientName || 'Cliente';
            const plataformaSegura = r.plataforma || r.platform || 'Servicio';
            const comentarioSeguro = r.comentario || r.comment || 'Solo dejó calificación por estrellas.';
            const plataformaLimpia = plataformaSegura.replace(/'/g, "\\'"); // Aplicación segura del replace

            list.innerHTML += `
                <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--mac-border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <strong style="font-size: 14px; color: var(--mac-text-main);">${nombreSeguro}</strong> 
                            <span style="font-size: 11px; color: var(--mac-text-secondary); display: block; margin-top: 2px;">Servicio: <span style="color: var(--mac-blue); font-weight: bold;">${plataformaSegura}</span></span>
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 16px; margin-bottom: 8px;">${stars}</div>
                    <p style="margin: 0 0 15px 0; font-size: 13px; color: var(--mac-text-secondary); font-style: italic;">"${comentarioSeguro}"</p>
                    
                    <div style="display: flex; gap: 8px;">
                        ${r.status === 'pendiente' || r.status === 'oculta'
                    ? `<button class="btn-primary" style="width: max-content; padding: 6px 12px; font-size: 12px; background: var(--mac-green); border: none;" onclick="window.changeReviewStatus('${r.id}', 'aprobada', '${plataformaLimpia}')"><i class='bx bx-check'></i> Aprobar</button>`
                    : `<button class="btn-secondary" style="width: max-content; padding: 6px 12px; font-size: 12px;" onclick="window.changeReviewStatus('${r.id}', 'oculta', '')"><i class='bx bx-hide'></i> Ocultar</button>`}
                        <button class="action-btn btn-del" style="padding: 6px 10px; font-size: 14px;" onclick="window.deleteReview('${r.id}')"><i class='bx bx-trash'></i></button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="color: var(--mac-red);">Error al cargar reseñas.</p>';
    }
};

window.changeReviewStatus = async (id, newStatus, currentPlatform) => {
    if (newStatus === 'aprobada') {
        // 1. Obtenemos el catálogo de la tiendita del usuario
        const catalog = currentUserData.storeCatalog || [];

        if (catalog.length === 0) {
            return window.showNotification("⚠️ No tienes productos en tu tienda para asignar esta reseña.");
        }

        // 2. Creamos las opciones del selector (Si hay coincidencia exacta, se pre-selecciona)
        let optionsHtml = '';
        catalog.forEach(item => {
            const isSelected = (item.platform.toLowerCase() === currentPlatform.toLowerCase()) ? 'selected' : '';
            optionsHtml += `<option value="${item.platform}" ${isSelected}>${item.platform}</option>`;
        });

        // 3. Modal para elegir a dónde va la reseña
        const { value: selectedProduct, isConfirmed } = await Swal.fire({
            title: 'Aprobar Reseña',
            html: `
                <p style="font-size: 13px; color: var(--mac-text-secondary); margin-bottom: 15px; text-align: left;">¿En qué producto de tu tienda pública quieres mostrar este comentario?</p>
                <div style="text-align: left;">
                    <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-main);">Vincular al producto:</label>
                    <select id="swal-review-product" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); margin-top: 5px; outline: none;">
                        ${optionsHtml}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="bx bx-check"></i> Publicar en Tienda',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#34C759',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
            preConfirm: () => {
                return document.getElementById('swal-review-product').value;
            }
        });

        // 4. Si confirma, actualizamos el estado y renombramos la plataforma en la reseña
        if (isConfirmed && selectedProduct) {
            try {
                await updateDoc(doc(db, "reviews", id), {
                    status: newStatus,
                    platform: selectedProduct // <-- AQUÍ SOBREESCRIBIMOS EL NOMBRE PARA QUE HAGA MATCH EXACTO EN LA TIENDITA
                });
                window.showNotification("Reseña aprobada y vinculada ✅");
                window.loadAdminReviews();
            } catch (e) { window.showNotification("Error cambiando estado."); }
        }
    } else {
        // Lógica para ocultar (se mantiene igual)
        try {
            await updateDoc(doc(db, "reviews", id), { status: newStatus });
            window.showNotification("Reseña ocultada 👁️‍🗨️");
            window.loadAdminReviews();
        } catch (e) { window.showNotification("Error cambiando estado."); }
    }
};

window.deleteReview = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar esta reseña permanentemente?")) return;
    try {
        await deleteDoc(doc(db, "reviews", id));
        window.showNotification("🗑️ Reseña eliminada.");
        window.loadAdminReviews();
    } catch (e) { window.showNotification("Error al eliminar."); }
};

// ---------------------------------------------------------
// REESCRITURA DE LA FUNCIÓN openProductDesc (PARA MOSTRAR RESEÑAS PÚBLICAS)
// ---------------------------------------------------------
window.openProductDesc = (title, desc) => {
    document.getElementById('descModalTitle').innerText = title;
    document.getElementById('descModalText').innerText = desc;

    // 1. Obtener el contenedor de reseñas
    const reviewsList = document.getElementById('publicReviewsList');
    if (reviewsList) {
        reviewsList.innerHTML = '';

        // 2. Filtrar reseñas por la plataforma seleccionada
        const productReviews = (window.publicReviewsCache || []).filter(r =>
            (r.platform || r.plataforma || '').toLowerCase() === title.toLowerCase()
        );

        if (productReviews.length === 0) {
            reviewsList.innerHTML = '<p style="font-size: 13px; color: var(--mac-text-secondary); text-align: center; margin: 0;">Aún no hay reseñas para este servicio.</p>';
        } else {
            productReviews.forEach(r => {
                // A) Manejo Seguro del Nombre
                const clientName = r.clienteNombre || r.clientName || r.nombre || 'Cliente';

                // B) Manejo Seguro de la Fecha (Evita "Invalid Date")
                let dateStr = "Fecha reciente";
                const dateVal = r.fechaIso || r.fecha || r.date || r.timestamp;
                if (dateVal) {
                    const dateObj = new Date(dateVal);
                    if (!isNaN(dateObj.getTime())) {
                        dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                    }
                }

                // C) Manejo Seguro del Comentario
                const rawComment = r.comentario || r.comment || r.text || '';
                const reviewText = rawComment.trim() !== ''
                    ? `"${rawComment}"`
                    : '<span style="font-style: italic; color: var(--mac-text-secondary);">(Dejó una calificación por estrellas)</span>';

                // D) Manejo y Enmascaramiento del Número de Teléfono
                let hiddenPhoneHtml = '';
                const phoneRaw = r.clienteNumero || r.clientPhone || r.phone || r.numero || '';

                if (phoneRaw) {
                    // Quitamos espacios en blanco para evaluar
                    let num = phoneRaw.replace(/\s+/g, '');
                    // Separamos el código de país del resto del número (Ej: +51 y 999888777)
                    const match = num.match(/^(\+\d{2,3})(\d+)$/);
                    let maskedPhone = num;

                    if (match) {
                        const countryCode = match[1];
                        const localNum = match[2];
                        if (localNum.length >= 6) {
                            const visibleStart = localNum.substring(0, 3);
                            const visibleEnd = localNum.substring(localNum.length - 1);
                            const masked = 'X'.repeat(localNum.length - 4);
                            maskedPhone = `${countryCode} ${visibleStart}${masked}${visibleEnd}`;
                        }
                    } else if (num.length >= 8) {
                        // Fallback si no detecta el código de país con "+"
                        const visibleStart = num.substring(0, 6);
                        const visibleEnd = num.substring(num.length - 1);
                        const masked = 'X'.repeat(num.length - 7);
                        maskedPhone = `${visibleStart}${masked}${visibleEnd}`;
                    }

                    hiddenPhoneHtml = `<span style="font-size: 11px; color: var(--mac-text-secondary); display: block; margin-top: 2px;"><i class='bx bxl-whatsapp'></i> ${maskedPhone}</span>`;
                }

                // E) Manejo de Estrellas
                const rating = parseInt(r.rating || r.estrellas || 5);
                let starsHtml = '';
                for (let i = 1; i <= 5; i++) {
                    starsHtml += `<i class='bx bxs-star' style="color: ${i <= rating ? '#FFD700' : 'var(--mac-border)'};"></i>`;
                }

                // F) Renderizar la tarjeta de la reseña
                const div = document.createElement('div');
                div.style.cssText = "background: rgba(255,255,255,0.03); padding: 12px; border-radius: 10px; border: 1px solid var(--mac-border);";
                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                        <div>
                            <strong style="color: var(--mac-text-main); font-size: 13px; display: flex; align-items: center; gap: 4px;"><i class='bx bx-user-circle'></i> ${clientName}</strong>
                            ${hiddenPhoneHtml}
                        </div>
                        <span style="font-size: 11px; color: var(--mac-text-secondary); white-space: nowrap;">${dateStr}</span>
                    </div>
                    <div style="margin-bottom: 5px; font-size: 14px;">${starsHtml}</div>
                    <p style="margin: 0; font-size: 13px; color: var(--mac-text-main); line-height: 1.4;">${reviewText}</p>
                `;
                reviewsList.appendChild(div);
            });
        }
    }

    document.getElementById('productDescModal').style.display = 'flex';
};

window.checkUrlRouting = () => {
    const params = new URLSearchParams(window.location.search);
    const seccion = params.get('seccion');

    if (!seccion) return; // Si no hay parámetro, no hace nada

    // Enrutador según la sección
    if (seccion === 'ventas') {
        window.openPedidosModal();
        window.switchDashboardSection('pedidosModal');
    } else if (seccion === 'novedades') {
        window.openNewsModal();
    }

    // Limpiamos la URL sin recargar la página
    const urlLimpia = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({}, '', urlLimpia);
};

// --- FUNCIÓN PARA SINCRONIZAR COSTOS ANTIGUOS ---
window.actualizarCostosAntiguos = async () => {
    const btn = document.getElementById('btnSyncCostos');
    const origText = btn.innerHTML;
    if (btn) btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Sync...";

    try {
        window.showNotification("⏳ Actualizando costos en la base de datos... no cierres la ventana.");

        // 1. Obtener todas las matrices del usuario
        const qMat = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
        const snapMat = await getDocs(qMat);
        let masterMap = {};
        snapMat.forEach(doc => { masterMap[doc.id] = doc.data(); });

        let actualizados = 0;

        // 2. Revisar todos los clientes actuales en memoria
        for (let i = 0; i < clients.length; i++) {
            let c = clients[i];
            let masterId = c.linkedMasterId;

            if (!masterId && c.multiAccounts) {
                for (let platKey in c.multiAccounts) {
                    if (c.multiAccounts[platKey].masterAccountId) {
                        masterId = c.multiAccounts[platKey].masterAccountId;
                        break;
                    }
                }
            }

            // 3. Si pertenece a una matriz, calculamos la división
            if (masterId && masterMap[masterId]) {
                let matriz = masterMap[masterId];
                let costoCorrecto = matriz.maxProfiles > 0 ? (matriz.cost / matriz.maxProfiles) : 0;

                if (parseFloat(c.cost) !== parseFloat(costoCorrecto)) {
                    await updateDoc(doc(db, "clients", c.id), { cost: costoCorrecto });
                    c.cost = costoCorrecto;
                    actualizados++;
                }
            }
        }

        window.showNotification(`✅ ¡Listo! Se actualizaron los costos de ${actualizados} clientes.`);

        // 4. Forzar el recálculo visual en las tablas y gráficos
        window.renderTable();
        if (document.getElementById('financeSection').classList.contains('active-section')) {
            window.loadFinanceData();
        } else if (document.getElementById('statsPanel').style.display === 'grid') {
            window.toggleStats(true);
        }

    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        if (btn) btn.innerHTML = origText;
    }
};

window.currentReviewRating = 5;
window.currentReviewClient = null;
window.currentReviewPlatform = null;

// Lógica para pintar las estrellas al hacer clic
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.star-btn').forEach(star => {
        star.addEventListener('click', function () {
            window.currentReviewRating = parseInt(this.getAttribute('data-val'));
            document.querySelectorAll('.star-btn').forEach(s => {
                if (parseInt(s.getAttribute('data-val')) <= window.currentReviewRating) {
                    s.style.color = '#FFD700'; // Estrella encendida
                } else {
                    s.style.color = 'var(--mac-gray)'; // Estrella apagada
                }
            });
        });
    });
});

window.openReviewModal = (clientId, platform, clientName, clientPhone) => {
    window.currentReviewClient = { id: clientId, name: clientName, phone: clientPhone };
    window.currentReviewPlatform = platform;
    window.currentReviewRating = 5;

    document.getElementById('reviewPlatformName').innerText = platform;
    document.getElementById('reviewComment').value = '';
    document.querySelectorAll('.star-btn').forEach(s => s.style.color = '#FFD700');

    document.getElementById('clientReviewModal').style.display = 'flex';
};

window.submitReview = async () => {
    const comment = document.getElementById('reviewComment').value.trim();
    const btn = document.getElementById('btnSubmitReview');
    const origText = btn.innerText;

    btn.innerText = "Enviando...";
    btn.disabled = true;

    try {
        // Se usa la variable global portalStoreData que tu código ya define al abrir el portal
        const vendedorId = typeof portalStoreData !== 'undefined' ? portalStoreData.uid : null;
        if (!vendedorId) throw new Error("ID del vendedor no encontrado.");

        // Guardado nativo en Firestore
        await addDoc(collection(db, "reviews"), {
            vendedorId: vendedorId,
            clienteId: window.currentReviewClient.id,
            clienteNombre: window.currentReviewClient.name,
            plataforma: window.currentReviewPlatform,
            rating: window.currentReviewRating,
            comentario: comment,
            status: 'pendiente', // Para que la apruebes manualmente luego
            fecha: new Date().toISOString()
        });

        window.showNotification("¡Reseña enviada con éxito! 🎉");
        document.getElementById('clientReviewModal').style.display = 'none';

    } catch (e) {
        console.error("Error enviando reseña:", e);
        window.showNotification("Error enviando reseña.");
    } finally {
        btn.innerText = origText;
        btn.disabled = false;
    }
};

window.addPricingOptionField = (label = '', price = '') => {
    const container = document.getElementById('dynamicPricingOptionsContainer');
    const div = document.createElement('div');
    div.className = 'pricing-option-row';
    div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 5px;';
    div.innerHTML = `
        <input type="text" placeholder="Ej: 3 Meses" value="${label}" class="opt-label" style="flex:1; padding: 10px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px;">
        <input type="number" step="0.1" placeholder="Precio" value="${price}" class="opt-price" style="flex:1; padding: 10px; border-radius: 6px; background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 12px;">
        <button type="button" class="action-btn btn-del" style="padding: 6px; border-radius: 6px;" onclick="this.parentElement.remove()"><i class='bx bx-trash'></i></button>
    `;
    container.appendChild(div);
};

window.storeSelectedOptions = {}; // Guarda la opción seleccionada por producto

window.selectStoreTabPricing = (itemId, index, price, label) => {
    // Pintar pestaña activa
    const allTabs = document.querySelectorAll(`[id^="tab_${itemId}_"]`);
    allTabs.forEach(t => {
        t.style.background = 'var(--mac-surface)';
        t.style.color = 'var(--mac-text-secondary)';
        t.style.borderColor = 'var(--mac-border)';
    });

    const activeTab = document.getElementById(`tab_${itemId}_${index}`);
    if (activeTab) {
        activeTab.style.background = 'var(--mac-blue)';
        activeTab.style.color = 'white';
        activeTab.style.borderColor = 'var(--mac-blue)';
    }

    // Cambiar precio en pantalla
    const data = window.publicStoreDataCache;
    const priceDisplay = document.getElementById(`priceDisplay_${itemId}`);
    if (priceDisplay) priceDisplay.innerText = `${data.currency || 'S/'}${price.toFixed(2)}`;

    // Guardar en memoria para el carrito
    window.storeSelectedOptions[itemId] = { price, label };
};

// Y modificar addToCartWithOptions para leer esto:
window.addToCartWithOptions = (itemId) => {
    const catalog = window.publicCatalogCache || [];
    const originalItem = catalog.find(i => i.id === itemId);
    if (!originalItem) return;

    const selectedOpt = window.storeSelectedOptions[itemId] || (originalItem.pricingOptions && originalItem.pricingOptions.length > 0 ? originalItem.pricingOptions[0] : { price: originalItem.price, label: '' });

    const cartItem = { ...originalItem };
    cartItem.price = selectedOpt.price;
    if (selectedOpt.label && selectedOpt.label !== '1 Mes') {
        cartItem.platform = `${originalItem.platform} (${selectedOpt.label})`;
    }

    window.storeCart.push(cartItem);
    document.getElementById('cartBadge').innerText = window.storeCart.length;
    document.getElementById('floatingCartBtn').style.display = 'flex';
    document.getElementById('cartPanelOverlay').classList.add('active');
    document.getElementById('cartPanel').classList.add('active');
    window.renderCartItems();
};

window.openProvidersModal = () => {
    document.getElementById('providersModal').style.display = 'flex';
    // Llenar select del modal de agregar proveedor con los servicios actuales
    const select = document.getElementById('newProvPlatform');
    select.innerHTML = '';
    (currentUserData.customServices || DEFAULT_SERVICES).forEach(s => {
        select.innerHTML += `<option value="${s}">${s}</option>`;
    });
    window.renderProviders();
};

window.saveProvider = async () => {
    const name = document.getElementById('newProvName').value.trim();
    const platform = document.getElementById('newProvPlatform').value;
    const cost = parseFloat(document.getElementById('newProvCost').value) || 0;

    if (!name) return window.showNotification("Escribe el nombre del proveedor.");

    let provs = currentUserData.providers || [];
    provs.push({ id: 'prov_' + Date.now(), name, platform, cost });

    try {
        await updateDoc(doc(db, "users", currentUser.uid), { providers: provs });
        currentUserData.providers = provs;
        document.getElementById('newProvName').value = '';
        document.getElementById('newProvCost').value = '';
        window.renderProviders();
        window.updateProviderDropdown();
        window.showNotification("✅ Proveedor añadido.");
    } catch (e) { window.showNotification("Error: " + e.message); }
};

window.renderProviders = () => {
    const list = document.getElementById('providersListContainer');
    list.innerHTML = '';
    const provs = currentUserData.providers || [];

    provs.forEach((p, idx) => {
        list.innerHTML += `
            <div style="background: var(--mac-surface); border: 1px solid var(--mac-border); padding: 10px 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: var(--mac-text-main); font-size: 14px;">${p.name}</strong>
                    <div style="color: var(--mac-text-secondary); font-size: 12px; margin-top: 2px;">${p.platform} | Costo: ${globalCurrency}${p.cost.toFixed(2)}</div>
                </div>
                <button class="action-btn btn-del" onclick="window.deleteProvider(${idx})"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });
};

window.deleteProvider = async (idx) => {
    let provs = currentUserData.providers || [];
    provs.splice(idx, 1);
    await updateDoc(doc(db, "users", currentUser.uid), { providers: provs });
    currentUserData.providers = provs;
    window.renderProviders();
    window.updateProviderDropdown();
};

window.updateProviderDropdown = () => {
    const checkedBoxes = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value);
    const select = document.getElementById('clientProviderSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Seleccionar Proveedor...</option>';
    const provs = currentUserData.providers || [];

    // Filtrar los que pertenezcan a la plataforma marcada
    const filtered = provs.filter(p => checkedBoxes.includes(p.platform));

    filtered.forEach(p => {
        select.innerHTML += `<option value="${p.id}" data-cost="${p.cost}">${p.name} - ${p.platform} (${globalCurrency}${p.cost.toFixed(2)})</option>`;
    });

    select.innerHTML += `<option value="custom">+ Escribir manual...</option>`;
};

// Escuchar cambios en los checks para disparar actualización del Select
document.querySelectorAll('#checkboxDropdown input').forEach(cb => {
    cb.addEventListener('change', () => {
        // Tu código anterior ya lo hace...
        window.updateProviderDropdown();
    });
});

// Llenar auto-costo al seleccionar
window.onProviderSelected = () => {
    const select = document.getElementById('clientProviderSelect');
    const customInput = document.getElementById('clientProviderName');
    const costInput = document.getElementById('clientCost');

    if (select.value === 'custom') {
        customInput.style.display = 'block';
        customInput.value = '';
    } else if (select.value) {
        customInput.style.display = 'none';
        const provData = currentUserData.providers.find(p => p.id === select.value);
        if (provData) {
            customInput.value = provData.name;
            costInput.value = provData.cost; // Auto-fill del costo
        }
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
};

/* ==========================================================================
   MOTOR DE PRODUCTOS AVANZADOS (PESTAÑAS Y VARIANTES)
   ========================================================================== */

// 1. Dibuja el HTML de una Pestaña (Builder)
window.getTabTemplate = (tabName = '', options = []) => {
    let optsHtml = '';
    if (options.length === 0) options = [{ label: '', price: '' }];

    options.forEach(o => {
        optsHtml += `
            <div class="builder-option-row" style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
                <input type="text" placeholder="Ej: Perfil" value="${o.label}" class="b-opt-label" style="flex:1; padding: 10px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; outline:none;">
                <input type="number" step="0.1" placeholder="Precio" value="${o.price}" class="b-opt-price" style="width: 80px; padding: 10px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; outline:none;">
                <button type="button" class="action-btn btn-del" style="padding: 8px; border-radius: 6px;" onclick="this.parentElement.remove()"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });

    return `
        <div class="builder-tab-group" style="background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 8px; padding: 15px; position: relative;">
            <button type="button" class="action-btn btn-del" style="position: absolute; top: 12px; right: 12px; padding: 4px; border-radius: 6px;" onclick="this.parentElement.remove()"><i class='bx bx-x' style="font-size: 18px;"></i></button>
            <input type="text" placeholder="Nombre Pestaña (Ej: 1 Mes, 6 Meses)" value="${tabName}" class="b-tab-name" style="width: calc(100% - 40px); padding: 10px; border-radius: 6px; border: 1px solid var(--mac-blue); background: rgba(0,122,255,0.05); color: var(--mac-blue); font-weight: bold; font-size: 13px; margin-bottom: 5px; box-sizing: border-box; outline:none;">
            
            <div class="b-options-container">
                ${optsHtml}
            </div>
            <button type="button" class="action-btn" style="background: rgba(52,199,89,0.1); color: var(--mac-green); padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-top: 12px; border: 1px dashed var(--mac-green);" onclick="window.addOptionToTab(this)"><i class='bx bx-plus'></i> Añadir Variante</button>
        </div>
    `;
};

// 2. Funciones para agregar al DOM
window.addTabToBuilder = (containerId, tabName = '', options = []) => {
    const container = document.getElementById(containerId);
    const div = document.createElement('div');
    div.innerHTML = window.getTabTemplate(tabName, options);
    container.appendChild(div.firstElementChild);
};

window.addOptionToTab = (btn) => {
    const container = btn.previousElementSibling;
    const div = document.createElement('div');
    div.className = 'builder-option-row';
    div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-top: 8px;';
    div.innerHTML = `
        <input type="text" placeholder="Ej: Cuenta Completa" class="b-opt-label" style="flex:1; padding: 10px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; outline:none;">
        <input type="number" step="0.1" placeholder="Precio" class="b-opt-price" style="width: 80px; padding: 10px; border-radius: 6px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); font-size: 12px; outline:none;">
        <button type="button" class="action-btn btn-del" style="padding: 8px; border-radius: 6px;" onclick="this.parentElement.remove()"><i class='bx bx-trash'></i></button>
    `;
    container.appendChild(div);
};

// 3. Extraer Data del DOM para guardar en Firebase
window.extractBuilderData = (containerId) => {
    const container = document.getElementById(containerId);
    const tabGroups = container.querySelectorAll('.builder-tab-group');
    let result = [];

    tabGroups.forEach(group => {
        const tabName = group.querySelector('.b-tab-name').value.trim() || 'General';
        let options = [];
        group.querySelectorAll('.builder-option-row').forEach(row => {
            const lbl = row.querySelector('.b-opt-label').value.trim();
            const prc = parseFloat(row.querySelector('.b-opt-price').value);
            if (lbl && !isNaN(prc)) {
                options.push({ label: lbl, price: prc });
            }
        });
        if (options.length > 0) result.push({ name: tabName, options: options });
    });
    return result;
};

// 4. Lógica de Interacción en el Catálogo Público (Tiendita)
window.storeItemsTabsData = {};
window.storeSelectedOptions = {};

window.selectPubTab = (itemId, tabIndex) => {
    // Iluminar la pestaña tocada
    document.querySelectorAll(`.pub-tab-${itemId}`).forEach((t, i) => {
        t.style.background = i === tabIndex ? 'var(--mac-blue)' : 'var(--mac-surface)';
        t.style.color = i === tabIndex ? 'white' : 'var(--mac-text-secondary)';
        t.style.borderColor = i === tabIndex ? 'var(--mac-blue)' : 'var(--mac-border)';
    });

    const data = window.publicStoreDataCache;
    const tabsData = window.storeItemsTabsData[itemId];
    const activeTab = tabsData[tabIndex];

    // Pintar las opciones de la pestaña activa
    let optionsHtml = '';
    activeTab.options.forEach((opt, i) => {
        const isSelected = i === 0;
        const borderColor = isSelected ? 'var(--mac-blue)' : 'var(--mac-border)';
        const bg = isSelected ? 'rgba(0, 122, 255, 0.1)' : 'var(--mac-surface)';
        optionsHtml += `
            <label id="opt_label_${itemId}_${i}" onclick="window.selectPubOption('${itemId}', ${tabIndex}, ${i}, ${opt.price}, '${opt.label.replace(/'/g, "\\'")}')" class="pub-opt-${itemId}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-radius:12px; border:1px solid ${borderColor}; background:${bg}; cursor:pointer; transition:all 0.2s;">
                <span style="font-size:14px; font-weight:600; color:var(--mac-text-main);">${opt.label}</span>
                <span style="font-size:15px; font-weight:800; color:var(--mac-text-main);">${window.formatStorePrice(opt.price)}</span>
            </label>
        `;
    });
    document.getElementById(`pub_options_${itemId}`).innerHTML = optionsHtml;

    // Autoseleccionar la primera opción de la pestaña
    window.selectPubOption(itemId, tabIndex, 0, activeTab.options[0].price, activeTab.options[0].label);
};

window.selectPubOption = (itemId, tabIndex, optIndex, price, optLabel) => {
    document.querySelectorAll(`.pub-opt-${itemId}`).forEach((el, i) => {
        el.style.borderColor = i === optIndex ? 'var(--mac-blue)' : 'var(--mac-border)';
        el.style.background = i === optIndex ? 'rgba(0, 122, 255, 0.1)' : 'var(--mac-surface)';
    });

    const data = window.publicStoreDataCache;
    document.getElementById(`priceDisplay_${itemId}`).innerText = window.formatStorePrice(price);

    const tabsData = window.storeItemsTabsData[itemId];
    const tabName = tabsData[tabIndex].name;
    const showTabs = tabsData.length > 1 || (tabsData.length === 1 && tabsData[0].name !== 'General');

    // El nombre a mostrar en el carrito será "Pestaña - Opción" (Ej: "1 Mes - Perfil")
    let finalLabel = showTabs && tabName ? `${tabName} - ${optLabel}` : optLabel;
    window.storeSelectedOptions[itemId] = { price: price, label: finalLabel };
};

/* =========================================================
   FUNCIONES REPARADAS DE FINANZAS Y EXPORTACIÓN
========================================================= */

window.switchFinanceTab = (tabId, element) => {
    document.querySelectorAll('.finance-tab').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('#financeSection .chrome-tab').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
};

window.generateCatalogImages = async () => {
    const catalog = currentUserData.storeCatalog || [];
    const availableItems = catalog.filter(i => i.status !== 'agotado');

    if (availableItems.length === 0) {
        return window.showNotification("⚠️ No tienes productos disponibles en el catálogo para exportar.");
    }

    // Modal de espera
    Swal.fire({
        title: '📸 Preparando Estudio Fotográfico',
        html: '<p style="color:var(--mac-text-secondary); font-size:14px;">Estamos agrupando tus productos y generando las imágenes en alta calidad (1080x1920). Esto puede tomar unos segundos.</p>',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); },
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    try {
        const categories = {};
        availableItems.forEach(item => {
            const cat = item.category || 'VARIOS';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(item);
        });

        const loadImgToBase64 = async (url) => {
            if (!url) return null;
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(null);
            });
        };

        const safeLogoBase64 = await loadImgToBase64(currentUserData.logoUrl);
        const safeBannerBase64 = await loadImgToBase64(currentUserData.bannerUrl);

        const template = document.getElementById('statusExportTemplate');
        template.style.left = '0px';

        document.getElementById('statusBrandName').innerText = currentUserData.name || 'Mi Marca';

        const logoEl = document.getElementById('statusLogo');
        if (safeLogoBase64) {
            logoEl.src = safeLogoBase64;
            logoEl.style.display = 'block';
        } else {
            logoEl.style.display = 'none';
        }

        const bannerEl = document.getElementById('statusBannerBg');
        if (safeBannerBase64) {
            bannerEl.style.backgroundImage = `url(${safeBannerBase64})`;
        } else {
            bannerEl.style.backgroundImage = 'none';
        }

        const pmContainer = document.getElementById('statusPaymentMethods');
        pmContainer.innerHTML = '';
        const methods = currentUserData.paymentMethods || [];
        if (methods.length > 0) {
            methods.forEach(m => {
                pmContainer.innerHTML += `<span style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 15px; font-size: 20px; font-weight: bold;">🏦 ${m.bank}</span>`;
            });
        } else {
            pmContainer.innerHTML = `<span style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 15px; font-size: 20px; font-weight: bold;">💳 Pregunta por nuestros medios de pago</span>`;
        }

        let generatedImagesUrls = [];
        const itemsPerPage = 4;

        for (const cat in categories) {
            const items = categories[cat];
            const totalPages = Math.ceil(items.length / itemsPerPage);

            for (let page = 0; page < totalPages; page++) {
                document.getElementById('statusCategoryTitle').innerText = cat.toUpperCase() + (totalPages > 1 ? ` (${page + 1}/${totalPages})` : '');

                const container = document.getElementById('statusItemsContainer');
                container.innerHTML = '';

                const pageItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

                for (const item of pageItems) {
                    const itemImgB64 = await loadImgToBase64(item.imgUrl);
                    const finalImg = itemImgB64 ? `<img src="${itemImgB64}" style="width: 140px; height: 140px; border-radius: 30px; object-fit: cover; border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 10px 20px rgba(0,0,0,0.5); flex-shrink: 0;">` : `<div style="width: 140px; height: 140px; border-radius: 30px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class='bx bx-play-circle' style="font-size: 50px; color: rgba(255,255,255,0.3);"></i></div>`;

                    let optsHtml = '';
                    const opts = item.pricingOptions && item.pricingOptions.length > 0 ? item.pricingOptions : [{ label: 'Mensual', price: item.price }];

                    opts.forEach(opt => {
                        optsHtml += `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 8px;">
                            <span style="font-size: 24px; color: rgba(255,255,255,0.7);">${opt.label}</span>
                            <span style="font-size: 28px; font-weight: 900; color: #30d158;">${globalCurrency}${opt.price.toFixed(2)}</span>
                        </div>`;
                    });

                    container.innerHTML += `
                        <div style="background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 35px; padding: 30px; display: flex; gap: 30px; align-items: center; box-shadow: 0 15px 35px rgba(0,0,0,0.2);">
                            ${finalImg}
                            <div style="flex: 1;">
                                <h3 style="margin: 0 0 15px 0; font-size: 38px; color: #ffffff; font-weight: 900; letter-spacing: 1px;">${item.platform}</h3>
                                ${optsHtml}
                            </div>
                        </div>
                    `;
                }

                await new Promise(r => setTimeout(r, 300));

                const canvas = await html2canvas(template, {
                    backgroundColor: '#0a0a0c', scale: 1.5, useCORS: true
                });

                generatedImagesUrls.push({
                    url: canvas.toDataURL('image/jpeg', 0.9),
                    name: `Estado_${cat}_${page + 1}.jpg`
                });
            }
        }

        template.style.left = '-9999px';

        if (generatedImagesUrls.length === 1) {
            const link = document.createElement('a');
            link.download = generatedImagesUrls[0].name;
            link.href = generatedImagesUrls[0].url;
            link.click();
            Swal.fire({ icon: 'success', title: '¡Listo!', text: 'La imagen de tu estado se ha descargado.', background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff', color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000' });
        } else {
            let imagesHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-height: 400px; overflow-y: auto;">';
            generatedImagesUrls.forEach((img, idx) => {
                imagesHtml += `
                    <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 12px; text-align: center;">
                        <img src="${img.url}" style="width: 100%; border-radius: 8px; margin-bottom: 8px;">
                        <a href="${img.url}" download="${img.name}" style="background: var(--mac-blue); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; text-decoration: none; font-weight: bold; display: inline-block;">Descargar</a>
                    </div>
                `;
            });
            imagesHtml += '</div>';

            Swal.fire({
                title: '📸 ¡Tus Estados están listos!',
                html: imagesHtml,
                width: 600,
                confirmButtonText: 'Cerrar',
                background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
                color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
            });
        }

    } catch (error) {
        console.error("Error completo:", error);
        Swal.fire({ icon: 'error', title: 'Oops...', text: 'Ocurrió un error al generar las imágenes. Revisa tu conexión a internet.' });
    }
};

/* ==========================================================================
   NUEVAS FUNCIONES: AUTOCOMPLETADO INTELIGENTE (DATALIST)
   ========================================================================== */

// --- 1. Lógica de Clientes Frecuentes (Híbrido) ---
window.isClientSelectMode = false;

window.toggleClientInputMode = () => {
    window.isClientSelectMode = !window.isClientSelectMode;
    const input = document.getElementById('clientName');
    const text = document.getElementById('clientModeText');

    if (window.isClientSelectMode) {
        window.updateFrequentClientsList(); // ¡Forzamos que lea la tabla en este instante!

        input.setAttribute('list', 'clientsDatalist');
        input.placeholder = "🔍 Escribe para buscar cliente...";
        input.value = '';
        input.oninput = (e) => window.onFrequentClientSelected(e.target.value);

        if (text) {
            text.innerHTML = "Nuevo Cliente";
            text.previousElementSibling.className = 'bx bx-user-plus';
        }
    } else {
        input.removeAttribute('list');
        input.placeholder = "Escribe el nombre...";
        input.value = '';
        input.oninput = null;
        document.getElementById('phone').value = '';

        if (text) {
            text.innerHTML = "Clientes Frecuentes";
            text.previousElementSibling.className = 'bx bx-search';
        }
    }
};

window.updateFrequentClientsList = () => {
    const datalist = document.getElementById('clientsDatalist');
    if (!datalist) return;
    datalist.innerHTML = '';

    const uniqueClients = {};
    clients.forEach(c => {
        if (c.phone && c.name) {
            // EXTRAEMOS SOLO NÚMEROS (Quitamos el "+" temporalmente para limpiar)
            const cleanPhone = c.phone.replace(/[^\d]/g, '');
            if (!uniqueClients[cleanPhone]) {
                uniqueClients[cleanPhone] = c.name;
            }
        }
    });

    Object.keys(uniqueClients).sort((a, b) => uniqueClients[a].localeCompare(uniqueClients[b])).forEach(phone => {
        const name = uniqueClients[phone];
        datalist.innerHTML += `<option value="${name} - +${phone}"></option>`;
    });
};

window.onFrequentClientSelected = (val) => {
    if (!val) return;

    const parts = val.split(' - +');
    if (parts.length === 2) {
        const name = parts[0].trim();
        const phone = '+' + parts[1].trim();

        document.getElementById('clientName').value = name;

        const phoneInput = document.getElementById('phone');
        phoneInput.value = phone;

        phoneInput.style.backgroundColor = "rgba(52, 199, 89, 0.1)";
        phoneInput.style.borderColor = "var(--mac-green)";
        setTimeout(() => {
            phoneInput.style.backgroundColor = "var(--mac-surface)";
            phoneInput.style.borderColor = "var(--mac-border)";
        }, 800);
    }
};

// --- 2. Lógica de Proveedores Inteligente ---
window.updateProviderDropdown = () => {
    const checkedBoxes = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value);
    const datalist = document.getElementById('providersDatalist');
    if (!datalist) return;

    datalist.innerHTML = '';
    const provs = currentUserData.providers || [];

    // Filtramos solo los proveedores de la plataforma que marcaste arriba
    const filtered = provs.filter(p => checkedBoxes.includes(p.platform));

    filtered.forEach(p => {
        // Guardamos el costo oculto en un data-attribute para extraerlo luego
        datalist.innerHTML += `<option value="${p.name}" data-cost="${p.cost}">${p.platform} - ${globalCurrency}${p.cost.toFixed(2)}</option>`;
    });
};

window.onProviderSelected = (val) => {
    const datalist = document.getElementById('providersDatalist');
    const costInput = document.getElementById('clientCost');
    if (!val) return;

    // Buscamos si lo que el usuario escribió coincide EXACTAMENTE con algo de la base de datos
    const option = Array.from(datalist.options).find(opt => opt.value === val);

    if (option) {
        // ¡Lo encontró! Es un proveedor guardado. Extraemos su costo y lo pegamos.
        const cost = option.getAttribute('data-cost');
        if (cost) costInput.value = cost;

        // Efecto visual verde brillante
        costInput.style.backgroundColor = "rgba(52, 199, 89, 0.1)";
        costInput.style.borderColor = "var(--mac-green)";
        setTimeout(() => {
            costInput.style.backgroundColor = "var(--mac-surface)";
            costInput.style.borderColor = "var(--mac-border)";
        }, 800);
    }
    // Si no coincide con nada, significa que estás escribiendo un nombre nuevo manualmente,
    // así que el sistema simplemente te deja escribir sin interferir.
};

// --- 3. Lógica del Carrito (El Cerebro Matemático) ---

window.applyCoupon = () => {
    const code = document.getElementById('cartCouponInput').value.trim().toUpperCase();
    const feedback = document.getElementById('couponFeedbackMessage');

    if (!code) {
        if (feedback) feedback.style.display = 'none';
        return;
    }

    const storeCoupons = window.publicStoreDataCache.storeCoupons || [];
    const validCoupon = storeCoupons.find(c => c.code === code);

    if (validCoupon) {
        // VALIDACIÓN DE CUPÓN ESPECÍFICO
        if (validCoupon.target && validCoupon.target !== 'global') {
            const hasTargetItem = window.storeCart.some(item => item.platform.startsWith(validCoupon.target));
            if (!hasTargetItem) {
                activeCoupon = null;
                if (feedback) {
                    feedback.innerHTML = `❌ El cupón aplica solo para: ${validCoupon.target}`;
                    feedback.style.color = "var(--mac-orange)";
                    feedback.style.display = "block";
                }
                window.renderCartItems();
                return;
            }
        }

        activeCoupon = validCoupon;
        if (feedback) {
            feedback.innerHTML = "✅ ¡Cupón aplicado!";
            feedback.style.color = "var(--mac-green)";
            feedback.style.display = "block";
        }
        window.renderCartItems();
    } else {
        activeCoupon = null;
        if (feedback) {
            feedback.innerHTML = "❌ Cupón inválido o expirado";
            feedback.style.color = "var(--mac-red)";
            feedback.style.display = "block";
        }
        window.renderCartItems();
    }
};

window.renderCartItems = () => {
    const container = document.getElementById('cartItemsContainer');
    const totalEl = document.getElementById('cartTotalPrice');
    const data = window.publicStoreDataCache;

    container.innerHTML = '';

    if (window.storeCart.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--mac-text-secondary); margin-top: 50px;"><i class="bx bx-shopping-bag" style="font-size: 64px; opacity: 0.3; margin-bottom: 15px;"></i><p style="font-weight: bold; font-size: 16px;">Tu carrito está vacío</p></div>';
        totalEl.innerText = `${data.currency || 'S/'}0.00`;
        document.getElementById('floatingCartBtn').style.display = 'none';
        document.getElementById('cartComboDiscountRow').style.display = 'none';
        document.getElementById('cartCouponRow').style.display = 'none';
        return;
    }

    let subtotal = 0;
    window.storeCart.forEach((item, index) => {
        subtotal += item.price;
        const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}">` : `<div style="width:65px; height:65px; border-radius:12px; background:var(--mac-gray); display:flex; align-items:center; justify-content:center; border: 1px solid var(--mac-border);"><i class="bx bx-play-circle" style="color:var(--mac-text-secondary); font-size:24px;"></i></div>`;
        container.innerHTML += `
            <div class="cart-item">
                ${imgHTML}
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.platform}</div>
                    <div class="cart-item-price">${window.formatStorePrice(item.price)}</div>
                </div>
                <button class="cart-item-remove" onclick="window.removeFromCart(${index})" title="Quitar"><i class='bx bx-trash'></i></button>
            </div>
        `;
    });

    let qty = window.storeCart.length;
    let comboDiscountPercent = 0;
    const dynamicDisc = data.storeDiscounts || { qty2: 0, qty3: 0, qty4: 0 };

    if (qty >= 4 && dynamicDisc.qty4) comboDiscountPercent = dynamicDisc.qty4;
    else if (qty === 3 && dynamicDisc.qty3) comboDiscountPercent = dynamicDisc.qty3;
    else if (qty === 2 && dynamicDisc.qty2) comboDiscountPercent = dynamicDisc.qty2;

    let comboDiscountAmount = subtotal * (comboDiscountPercent / 100);
    let afterComboPrice = subtotal - comboDiscountAmount;

    // CÁLCULO INTELIGENTE DE CUPÓN
    let couponDiscountAmount = 0;
    if (activeCoupon) {
        if (activeCoupon.target && activeCoupon.target !== 'global') {
            // Buscamos los productos en el carrito que coinciden con la promoción
            let targetItemsTotal = 0;
            window.storeCart.forEach(item => {
                if (item.platform.startsWith(activeCoupon.target)) {
                    targetItemsTotal += item.price;
                }
            });
            // El descuento aplica SOLO a la suma de los productos afectados
            couponDiscountAmount = targetItemsTotal * (activeCoupon.percent / 100);
        } else {
            // El descuento es global, aplica a todo el carrito
            couponDiscountAmount = afterComboPrice * (activeCoupon.percent / 100);
        }
    }

    let finalTotal = afterComboPrice - couponDiscountAmount;

    // ACTUALIZACIÓN DE LA UI DEL CARRITO
    document.getElementById('cartSubtotalPrice').innerText = window.formatStorePrice(subtotal);

    if (comboDiscountAmount > 0) {
        document.getElementById('cartComboDiscountRow').style.display = 'flex';
        document.getElementById('cartComboDiscountLabel').innerText = `Combo Armado (-${comboDiscountPercent}%):`;
        document.getElementById('cartComboDiscountAmount').innerText = `- ${window.formatStorePrice(comboDiscountAmount)}`;
    } else {
        document.getElementById('cartComboDiscountRow').style.display = 'none';
    }

    if (couponDiscountAmount > 0) {
        document.getElementById('cartCouponRow').style.display = 'flex';
        document.getElementById('cartCouponAmount').innerText = `- ${window.formatStorePrice(couponDiscountAmount)} (-${activeCoupon.percent}%)`;
    } else {
        document.getElementById('cartCouponRow').style.display = 'none';
    }

    document.getElementById('cartTotalPrice').innerText = `${data.currency || 'S/'}${finalTotal.toFixed(2)}`;
    window.currentCartFinalTotal = finalTotal;
};

/* ==========================================================================
   SISTEMA AVANZADO DE PROVEEDORES MULTI-PLATAFORMA
   ========================================================================== */

// 1. Generar múltiples cajas según las plataformas seleccionadas
window.updateProviderDropdown = () => {
    const checkedBoxes = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value);
    const container = document.getElementById('dynamicProvidersList');
    if (!container) return;

    // Si no hay nada marcado, mostramos el cuadro bloqueado
    if (checkedBoxes.length === 0) {
        container.innerHTML = '<input type="text" placeholder="Selecciona plataforma..." disabled style="width: 100%; padding: 13px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text-secondary); font-size: 14px; box-sizing: border-box; outline: none; height: 46px;">';
        return;
    }

    // Guardamos lo que ya habías escrito para que no se borre si marcas otra casilla
    const existingInputs = {};
    document.querySelectorAll('.dyn-prov-input').forEach(inp => {
        existingInputs[inp.dataset.platform] = inp.value;
    });

    container.innerHTML = '';
    const provs = currentUserData.providers || [];

    // Creamos un buscador (Datalist) por CADA plataforma marcada
    checkedBoxes.forEach(plat => {
        const platProvs = provs.filter(p => p.platform === plat);
        let optionsHtml = '';
        platProvs.forEach(p => {
            optionsHtml += `<option value="${p.name}" data-cost="${p.cost}">${p.platform} - ${globalCurrency}${p.cost.toFixed(2)}</option>`;
        });

        const prevValue = existingInputs[plat] || '';
        const safePlatId = plat.replace(/[^a-zA-Z0-9]/g, ''); // Para que el ID no tenga símbolos raros

        container.innerHTML += `
            <div style="position:relative; width: 100%;">
                <input type="text" class="dyn-prov-input" data-platform="${plat}" list="provList_${safePlatId}" placeholder="Prov. de ${plat}..." value="${prevValue}" oninput="window.onDynamicProviderSelected(this)" style="width: 100%; padding: 13px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text-main); font-size: 14px; box-sizing: border-box; outline: none; height: 46px;">
                <datalist id="provList_${safePlatId}">
                    ${optionsHtml}
                </datalist>
            </div>
        `;
    });
};

// 2. Extraer el costo cuando seleccionas uno de la lista
window.onDynamicProviderSelected = (inputEl) => {
    const val = inputEl.value;
    const listId = inputEl.getAttribute('list');
    const datalist = document.getElementById(listId);

    let foundCost = 0;
    if (datalist) {
        // Busca si lo que escribiste coincide exactamente con una opción
        const option = Array.from(datalist.options).find(opt => opt.value === val);
        if (option) foundCost = parseFloat(option.getAttribute('data-cost')) || 0;
    }

    inputEl.dataset.cost = foundCost;
    window.sumTotalCost();
};

// 3. Sumar el costo de TODOS los proveedores al campo principal
window.sumTotalCost = () => {
    let total = 0;
    let anyAutoFilled = false;

    document.querySelectorAll('.dyn-prov-input').forEach(inp => {
        const cost = parseFloat(inp.dataset.cost) || 0;
        total += cost;
        if (cost > 0) anyAutoFilled = true;
    });

    if (anyAutoFilled || total > 0) {
        const costInput = document.getElementById('clientCost');
        costInput.value = total;
        // Brillo verde de éxito
        costInput.style.backgroundColor = "rgba(52, 199, 89, 0.1)";
        costInput.style.borderColor = "var(--mac-green)";
        setTimeout(() => {
            costInput.style.backgroundColor = "var(--mac-surface)";
            costInput.style.borderColor = "var(--mac-border)";
        }, 800);
    }
};

// 4. Asegurarnos de que el menú de plataformas active esta función
const originalPopulate = window.populateAllServiceSelects;
window.populateAllServiceSelects = () => {
    const services = currentUserData.customServices || ["Netflix", "Disney+", "Spotify Premium", "HBO Max", "Paramount", "Amazon Prime", "YouTube Premium", "Crunchyroll", "IPTV", "Flujo TV", "Apple TV", "Gemini Pro", "ChatGPT", "Canva Pro", "CapCut Pro", "Directv GO", "Movistar"];

    const chkDropdown = document.getElementById('checkboxDropdown');
    if (chkDropdown) {
        chkDropdown.innerHTML = '';
        services.forEach(s => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${s}"> ${s}`;
            chkDropdown.appendChild(label);
        });

        // LA MAGIA: Cada vez que tocas un check, reconstruimos los proveedores
        document.querySelectorAll('#checkboxDropdown input').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value);
                const el = document.getElementById('selectText');
                if (checked.length) { el.textContent = checked.join(', '); el.classList.add('has-selection'); }
                else { el.textContent = 'Plataforma(s)...'; el.classList.remove('has-selection'); }

                window.updateProviderDropdown(); // 👈 Llama a nuestro nuevo sistema
            });
        });
    }

    const selectIds = [{ id: 'invPlatform', defaultOpt: 'Plataforma...' }, { id: 'matPlatform', defaultOpt: null }, { id: 'rulePlatformSelect', defaultOpt: null }];
    selectIds.forEach(item => {
        const select = document.getElementById(item.id);
        if (select) {
            select.innerHTML = item.defaultOpt ? `<option value="">${item.defaultOpt}</option>` : '';
            services.forEach(s => { select.innerHTML += `<option value="${s}">${s}</option>`; });
        }
    });
};

// 5. Reescribir StartEdit para que llene múltiples proveedores al editar un cliente
window.startEdit = (id) => {
    editingClientId = id;
    const c = clients.find(x => x.id === id);
    window.currentClientNote = c.notes || '';
    document.getElementById('clientName').value = c.name;
    document.getElementById('phone').value = c.phone;
    document.getElementById('expirationDate').value = c.date;
    document.getElementById('clientCost').value = c.cost || '';
    document.getElementById('clientPrice').value = c.price || '';

    if (c.multiAccounts) {
        multiAccData = c.multiAccounts;
    } else {
        const platforms = c.platform.split(', ');
        multiAccData = {};
        platforms.forEach(p => {
            multiAccData[p] = { email: c.accountEmail || '', password: c.accountPassword || '', profile: c.accountProfile || '', pin: c.accountPin || '', saleType: c.accountSaleType || 'Perfil', units: c.accountUnits || 1, deviceName: c.accountDeviceName || '', deviceType: c.accountDeviceType || '' };
        });
    }

    const totalUnits = Object.values(multiAccData).reduce((sum, acc) => sum + (parseInt(acc.units) || 1), 0);
    const btn = document.getElementById('btnAccountData');
    btn.innerText = `✅ Datos de Cuenta (${totalUnits} ud)`;
    btn.style.backgroundColor = "var(--mac-green)"; btn.style.color = "white";

    const cbs = document.querySelectorAll('#checkboxDropdown input');
    cbs.forEach(cb => cb.checked = false);
    c.platform.split(', ').forEach(p => { cbs.forEach(cb => { if (cb.value === p) cb.checked = true; }); });
    document.getElementById('selectText').textContent = c.platform;
    document.getElementById('selectText').classList.add('has-selection');
    document.getElementById('actionButtonsContainer').innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><button type="button" class="btn-primary" onclick="window.saveClientData()">Guardar</button><button type="button" class="btn-secondary" onclick="window.cancelEdit()">Cancelar</button></div>`;

    // --- Llenar los proveedores en las cajitas generadas ---
    window.updateProviderDropdown();
    setTimeout(() => {
        if (c.multiAccounts) {
            Object.keys(c.multiAccounts).forEach(plat => {
                const inp = document.querySelector(`.dyn-prov-input[data-platform="${plat}"]`);
                if (inp && c.multiAccounts[plat].provider) inp.value = c.multiAccounts[plat].provider;
            });
        } else {
            // Soporte para clientes viejos
            const provs = c.providerName ? c.providerName.split(' | ') : [];
            if (provs.length === 1 && !provs[0].includes(':')) {
                const inp = document.querySelector('.dyn-prov-input');
                if (inp) inp.value = provs[0];
            } else {
                provs.forEach(p => {
                    const parts = p.split(': ');
                    if (parts.length === 2) {
                        const inp = document.querySelector(`.dyn-prov-input[data-platform="${parts[0]}"]`);
                        if (inp) inp.value = parts[1];
                    }
                });
            }
        }
    }, 50);

    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
};

// 6. Reescribir GuardarCliente para que lea todos los proveedores
const originalSaveClientData = window.saveClientData;
window.saveClientData = async () => {
    // Recopilamos todos los proveedores antes de llamar a la lógica de guardado
    let provNamesArray = [];
    document.querySelectorAll('.dyn-prov-input').forEach(inp => {
        const val = inp.value.trim();
        if (val) {
            provNamesArray.push(`${inp.dataset.platform}: ${val}`);
            if (multiAccData[inp.dataset.platform]) {
                multiAccData[inp.dataset.platform].provider = val;
            }
        }
    });

    // Inyectamos el string consolidado (Ej: "Netflix: Carlos | Disney+: Maria") en un campo oculto 
    // para que la función original lo recoja de forma invisible
    let hiddenProvider = document.getElementById('clientProviderName');
    if (!hiddenProvider) {
        hiddenProvider = document.createElement('input');
        hiddenProvider.type = 'hidden';
        hiddenProvider.id = 'clientProviderName';
        document.body.appendChild(hiddenProvider);
    }
    hiddenProvider.value = provNamesArray.join(' | ');

    // Llamamos a tu guardado normal
    await originalSaveClientData();
};

// 7. Resetear al cancelar
const originalCancelEdit = window.cancelEdit;
window.cancelEdit = () => {
    originalCancelEdit();
    window.updateProviderDropdown();
};

window.saveGateways = async () => {
    const mpTokenRaw = document.getElementById('mpAccessTokenInput') ? document.getElementById('mpAccessTokenInput').value.trim() : '';
    const binApiKeyRaw = document.getElementById('binanceApiKeyInput') ? document.getElementById('binanceApiKeyInput').value.trim() : '';
    const binSecretRaw = document.getElementById('binanceSecretKeyInput') ? document.getElementById('binanceSecretKeyInput').value.trim() : '';

    const mpToken = mpTokenRaw.includes('***') ? (currentUserData.gateways?.mercadoPago?.accessToken || currentUserData.mpAccessToken || '') : mpTokenRaw;
    const binApiKey = binApiKeyRaw.includes('***') ? (currentUserData.gateways?.binance?.apiKey || currentUserData.binanceApiKey || '') : binApiKeyRaw;
    const binSecret = binSecretRaw.includes('***') ? (currentUserData.gateways?.binance?.secretKey || currentUserData.binanceSecretKey || '') : binSecretRaw;

    try {
        const gateways = {
            mercadoPago: { accessToken: mpToken, active: !!mpToken },
            binance: { apiKey: binApiKey, secretKey: binSecret, active: !!binApiKey }
        };

        const updateData = {
            gateways: gateways,
            mpAccessToken: mpToken || null,
            binanceApiKey: binApiKey || null,
            binanceSecretKey: binSecret || null
        };

        // ADVERTENCIA DE SEGURIDAD: En producción, estos datos deben ir en una subcolección protegida
        await updateDoc(doc(db, "users", currentUser.uid), updateData);
        currentUserData.gateways = gateways;
        currentUserData.mpAccessToken = mpToken || null;
        currentUserData.binanceApiKey = binApiKey || null;
        currentUserData.binanceSecretKey = binSecret || null;

        window.showNotification("✅ Credenciales de pago guardadas");
    } catch (e) {
        window.showNotification("Error: " + e.message);
    }
};
