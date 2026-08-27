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
        if(typeof window.toggleStats === 'function') window.toggleStats(true); 
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
window.showLogin = () => { document.getElementById('loginForm').style.display='flex'; document.getElementById('registerForm').style.display='none'; document.getElementById('resetForm').style.display='none'; document.getElementById('authSubtitle').innerText='Iniciar Sesión'; }
window.showRegister = () => { document.getElementById('loginForm').style.display='none'; document.getElementById('registerForm').style.display='flex'; document.getElementById('resetForm').style.display='none'; document.getElementById('authSubtitle').innerText='Crear Cuenta'; }
window.showReset = () => { document.getElementById('loginForm').style.display='none'; document.getElementById('registerForm').style.display='none'; document.getElementById('resetForm').style.display='flex'; document.getElementById('authSubtitle').innerText='Recuperar Contraseña'; }
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

window.loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const docSnap = await getDoc(doc(db, "users", user.uid));
        
        if (!docSnap.exists()) {
            await setDoc(doc(db, "users", user.uid), { 
                name: user.displayName, email: user.email, role: 'user', active: false, 
                country: 'Perú', currency: 'S/', phone: '', createdAt: new Date().toISOString() 
            });
            window.showNotification("Cuenta creada. Contacta al administrador para activarla.");
            await signOut(auth);
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
    
    if(!name || !email || !password || !country || !phone) return window.showNotification("Llena todos los campos");
    if(!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país (Ej: +51...)");
    
    const btn = document.querySelector('#registerForm .btn-primary'); 
    const orig = btn.innerText; 
    btn.innerText = "Creando... ⏳"; 
    btn.disabled = true;
    
    try {
        // 1. Crea el usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // 2. Obtenemos el Token de Identidad (El pasaporte digital del usuario)
        const idToken = await user.getIdToken();

        // 3. Enviamos los datos a tu Bot en DigitalOcean para que él cree el perfil
        const response = await fetch('https://bot.panelagc.com/api/completar-registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idToken: idToken,
                name: name,
                phone: phone,
                country: country
            })
        });

        if (!response.ok) throw new Error("Error del servidor al asignar perfil.");
        // --- NUEVO: ACTIVACIÓN DE DEMO POR 3 HORAS ---
        const planElegido = document.getElementById('regPlanDemo').value;
        const targetDate = new Date();
        targetDate.setHours(targetDate.getHours() + 3);

        await updateDoc(doc(db, "users", user.uid), {
            active: true,
            activeUntil: targetDate.toISOString(),
            plan_actual: planElegido,
            limite_clientes: planElegido === 'pro' ? 9999 : 100,
            tutorialVisto: false // Activa el disparador del tutorial
        });
        window.showNotification("¡Cuenta creada con éxito! Disfruta tu prueba gratuita.");
        
    } catch (e) { 
        window.showNotification("Error Reg: " + e.message); 
    } finally {
        btn.innerText = orig; 
        btn.disabled = false;
    }
};

window.doLogin = async () => {
    const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
    if(!email || !password) return window.showNotification("Ingresa tus datos");
    
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
    const email = document.getElementById('resetEmail').value; if(!email) return window.showNotification("Ingresa tu correo");
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

        // 🔥 MEJORA VISUAL: Ocultar login y dar feedback INMEDIATO
        document.getElementById('loginForm').style.display = 'none';
        if(document.getElementById('authSubtitle')) {
            document.getElementById('authSubtitle').innerHTML = "Cargando tu panel... <i class='bx bx-loader-alt bx-spin'></i>";
        }

        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
                globalCurrency = currentUserData.currency || "S/";

                if(document.getElementById('brandName')) document.getElementById('brandName').innerText = currentUserData.name || 'Mi Panel';
                
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
                if(document.getElementById('brandNameSidebar')) document.getElementById('brandNameSidebar').innerText = currentUserData.name || 'Mi Panel';
                if(document.getElementById('mobileBrandName')) document.getElementById('mobileBrandName').innerText = currentUserData.name || 'Mi Panel';    
                
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
                if(currentUserData.logoUrl) {
                    if(document.getElementById('brandLogoSidebar')) { document.getElementById('brandLogoSidebar').src = currentUserData.logoUrl; document.getElementById('brandLogoSidebar').style.display = 'block'; }
                    if(document.getElementById('mobileBrandLogo')) { document.getElementById('mobileBrandLogo').src = currentUserData.logoUrl; document.getElementById('mobileBrandLogo').style.display = 'block'; }
                }

                if(document.getElementById('clientCost')) document.getElementById('clientCost').placeholder = `Costo Proveedor (${globalCurrency})`;
                if(document.getElementById('clientPrice')) document.getElementById('clientPrice').placeholder = `Precio de Venta (${globalCurrency})`;
                
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
                } else { 
                    if (currentUserData.active === true) { 
                        showView('appView'); 
                        if(document.getElementById('userGreeting')) document.getElementById('userGreeting').innerText = `Gestión de clientes`; 
                        loadUserClients();
                        window.checkNewNews();
                        window.requestNotificationPermission(); 
                        window.renderInventory();
                        window.syncUserServices();
                        
                        // --- LANZADOR DEL TUTORIAL ---
                        if (!currentUserData.tutorialVisto && window.innerWidth > 768) {
                            setTimeout(() => window.startTutorial(), 1500);
                        }
                    } else { 
                        await signOut(auth); 
                        window.showNotification("Tu cuenta está suspendida o pendiente."); 
                        showView('authView'); 
                        window.showLogin();
                    } 
                }
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
        if(document.getElementById('authSubtitle')) document.getElementById('authSubtitle').innerText = 'Área de Gestión y Control';
    }
});

window.closeModals = (resetTab = true) => { 
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); 
    document.body.style.overflow = 'auto'; // Devuelve el scroll al fondo
    
    // Solo devuelve el foco al botón de Clientes si es un cierre total (ej: tocar la X)
    if (resetTab === true) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const btnClientes = document.getElementById('navClientes');
        if(btnClientes) btnClientes.classList.add('active');
    }
};
/* --- CONTROLADOR DE SECCIONES DASHBOARD (PC Y MÓVIL) --- */
window.switchDashboardSection = (sectionId, menuElement) => {
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
    }, 60); 
};

// Blindaje del botón "Cerrar" para que regrese correctamente al Home en PC y CELULAR
const originalCloseModals = window.closeModals;
window.closeModals = (resetTab = true) => {
    originalCloseModals(resetTab);
    
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
        if(homeBtn) homeBtn.classList.add('active');
    }
};

/* --- CONFIGURACIÓN DE WHATSAPP Y PAGOS --- */
window.openWaModal = () => { 
    const defaultMsg = "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*. Para renovar, usa estos datos:\n\n{pago}"; 
    const defaultDelivery = `🎉 *¡Gracias por tu compra!*\n\nAquí tienes los datos de tu nueva cuenta de *{plataforma}*:\n\n📧 *Correo:* {correo}\n🔑 *Clave:* {pass}\n📌 *PIN:* {pin}\n\n📅 *Vence el:* {fecha}\n\n⚠️ *Reglas:* {reglas}\n\n¡Que disfrutes el contenido! 🍿`;

    document.getElementById('editWaMessage').value = currentUserData.waTemplate || defaultMsg; 
    document.getElementById('editWaDeliveryMessage').value = currentUserData.waDeliveryMessage || defaultDelivery; 
    
    document.getElementById('waModal').style.display = 'flex'; 
};

window.saveWaMessage = async () => { 
    const btn = document.querySelector('#waModal .btn-primary');
    btn.innerText = "Guardando..."; btn.disabled = true;
    try { 
        await updateDoc(doc(db, "users", currentUser.uid), { 
            waTemplate: document.getElementById('editWaMessage').value,
            waDeliveryMessage: document.getElementById('editWaDeliveryMessage').value
        }); 
        
        currentUserData.waTemplate = document.getElementById('editWaMessage').value;
        currentUserData.waDeliveryMessage = document.getElementById('editWaDeliveryMessage').value;
        
        window.showNotification("Configuración de WhatsApp guardada."); 
        window.closeModals();
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally {
        btn.innerText = "Guardar Configuración"; btn.disabled = false;
    }
};
// 🔥 NUEVO SISTEMA DE MEMORIA TEMPORAL PARA MÉTODOS DE PAGO
let tempPaymentMethods = []; 

window.openProfileModal = () => { 
    // 1. Carga los datos de texto del perfil
    document.getElementById('editProfileName').value = currentUserData.name || ''; 
    document.getElementById('editProfileCountry').value = currentUserData.country || ''; 
    document.getElementById('editProfilePhone').value = currentUserData.phone || ''; 
    document.getElementById('editProfileAlias').value = currentUserData.storeAlias || ''; 
    document.getElementById('editReferencesLink').value = currentUserData.referencesLink || '';
    
    // 2. Carga los chips de servicios personalizados
    if (typeof window.renderCustomServicesChips === 'function') {
        window.renderCustomServicesChips();
    }

    // 🔥 3. CARGA LOS MÉTODOS DE PAGO DESDE FIREBASE
    tempPaymentMethods = (currentUserData.paymentMethods || []).map(m => ({ ...m, isEditing: false }));
    window.renderPaymentMethodsList();
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
    if(!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país"); 
    
    const btn = document.querySelector('#profileModal .btn-primary');
    if(btn) { btn.innerText = "Subiendo... ⏳"; btn.disabled = true; }

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

        // 🔥 PROCESAR Y SUBIR LOS MÉTODOS DE PAGO CONFIRMADOS
        let finalPaymentMethods = [];
        
        for (let i = 0; i < tempPaymentMethods.length; i++) {
            let m = tempPaymentMethods[i];
            
            // Por si le dio a "Guardar Perfil" olvidando confirmar un método que estaba abierto
            if (m.isEditing) {
                 m.bank = document.getElementById(`pmBank_${i}`).value.trim();
                 m.number = document.getElementById(`pmNumber_${i}`).value.trim();
                 m.holder = document.getElementById(`pmHolder_${i}`).value.trim();
                 const fInput = document.getElementById(`pmQrFile_${i}`);
                 if (fInput && fInput.files.length > 0) m.fileObj = fInput.files[0];
            }
            
            if (!m.bank && !m.number) continue; // Ignora los vacíos

            let finalQrUrl = m.qrUrl;
            
            // Si hay un archivo File esperando, lo subimos a Firebase
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

        // Guardar absolutamente todo en Firebase de un solo tiro
        await updateDoc(doc(db, "users", currentUser.uid), { 
            name: name, country: country, currency: getCurrencyForCountry(country), 
            phone: phone, logoUrl: logoUrl, bannerUrl: bannerUrl, storeAlias: finalAlias,
            referencesLink: referencesLink,
            paymentMethods: finalPaymentMethods // 🔥 Se guarda el arreglo limpio
        });
        
        // Actualizar la memoria global
        currentUserData.storeAlias = finalAlias; 
        currentUserData.name = name;
        currentUserData.country = country;
        currentUserData.phone = phone;
        currentUserData.logoUrl = logoUrl;
        currentUserData.bannerUrl = bannerUrl;
        currentUserData.referencesLink = referencesLink;
        currentUserData.paymentMethods = finalPaymentMethods; 

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

        window.showNotification("Perfil y Métodos de Pago guardados."); 
        window.closeModals();
        
        if (document.getElementById('tableBody')) window.renderTable();
        if (document.getElementById('statsPanel')) window.toggleStats(true);
        
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally {
        if(btn) { btn.innerText = "Guardar Perfil"; btn.disabled = false; }
    }
};

window.openSuggestionModal = () => { document.getElementById('suggestionText').value = ''; document.getElementById('suggestionModal').style.display = 'flex'; };
window.sendSuggestion = async () => { const text = document.getElementById('suggestionText').value; if (!text) return window.showNotification("Escribe algo primero."); const btn = document.querySelector('#suggestionModal .btn-primary'); btn.innerText = "Enviando..."; btn.disabled = true; try { await addDoc(collection(db, "suggestions"), { userId: currentUser.uid, userName: currentUserData.name, text: text, date: new Date().toISOString(), approved: false }); window.showNotification("¡Gracias! 🚀"); window.closeModals(); } catch(e) { window.showNotification("Error: " + e.message); } finally { btn.innerText = "Enviar Idea 🚀"; btn.disabled = false; } };

window.openAccountModal = () => { 
    const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(cb => cb.value); 
    if(checked.length === 0) return window.showNotification("⚠️ Primero selecciona las plataformas en el menú desplegable.");

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
        if(document.getElementById('accMonths')) document.getElementById('accMonths').value = data.months || 1;
        document.getElementById('accDeviceName').value = data.deviceName || '';
        document.getElementById('accDeviceType').value = data.deviceType || '';
    } else {
        document.getElementById('viewAccSaleType').innerText = data.saleType || 'Perfil';
        document.getElementById('viewAccEmail').innerText = data.email || '-';
        document.getElementById('viewAccPassword').innerText = data.password || '-';
        document.getElementById('viewAccProfile').innerText = data.profile || '-';
        document.getElementById('viewAccPin').innerText = data.pin || '-';
        if(document.getElementById('viewAccMonths')) document.getElementById('viewAccMonths').innerText = data.months || '1';
        
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
        if (data.active && data.activeUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Vence: ${new Date(data.activeUntil).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</span>`; } else if (!data.active && data.suspendedUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Hasta: ${new Date(data.suspendedUntil).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</span>`; }
        
        const planDisplay = (data.plan_actual || 'demo').toUpperCase();
        const planColor = planDisplay === 'PRO' ? 'var(--mac-blue)' : (planDisplay === 'BASICO' ? 'var(--mac-green)' : 'var(--mac-text-secondary)');
        const safeName = (data.name || 'Usuario').replace(/'/g, "\\'");
        
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td data-label="Nombre"><strong>${data.name}</strong></td>
            <td data-label="País">${data.country||'-'}</td>
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
        if(d.data().role !== 'admin') adminUsersCache.push({ id: d.id, ...d.data() });
    });
    window.toggleAdminPlanFilter();

    // 2. Cargar Sugerencias
    const sBody = document.getElementById('adminSuggestionsBody'); sBody.innerHTML = ''; 
    let arrS = []; qSuggestions.forEach(d => arrS.push({ id: d.id, ...d.data() })); 
    arrS.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    arrS.forEach(s => { 
        const tr = document.createElement('tr'); 
        tr.innerHTML = `<td>${new Date(s.date).toLocaleDateString('es-ES')}</td><td><strong>${s.userName}</strong></td><td style="color:var(--mac-text-secondary);">${s.text}</td><td>${s.approved ? '<span style="color:var(--mac-green);font-weight:bold;">✅ Aprobada</span>' : '<span style="color:var(--mac-orange);font-weight:bold;">⏳ Pendiente</span>'}</td><td class="actions-cell">${s.approved ? '' : `<button class="action-btn btn-wa" onclick="window.approveSuggestion('${s.id}')">✔️ Aprobar</button>`} <button class="action-btn btn-del" onclick="window.deleteSuggestion('${s.id}')">🗑️</button></td>`; 
        sBody.appendChild(tr); 
    });

    // 3. Cargar Noticias
    const nBody = document.getElementById('adminNewsBody'); nBody.innerHTML = ''; 
    let arrN = []; qNews.forEach(d => arrN.push({ id: d.id, ...d.data() })); 
    
    arrN.sort((a,b) => {
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
    if(btnSubmit) btnSubmit.innerHTML = "<i class='bx bx-save'></i> Guardar Cambios";
    
    const btnCancel = document.getElementById('btnCancelEditNews');
    if(btnCancel) btnCancel.style.display = 'block';
    
    document.getElementById('newsInputTitle').scrollIntoView({ behavior: 'smooth' });
};

window.cancelEditNews = () => {
    editingNewsId = null;
    editingNewsOldImg = null;
    
    document.getElementById('newsInputTitle').value = ''; 
    document.getElementById('newsInputDesc').value = ''; 
    document.getElementById('newsInputImg').value = '';
    
    const btnSubmit = document.getElementById('btnSubmitNews');
    if(btnSubmit) btnSubmit.innerHTML = "<i class='bx bx-send'></i> Publicar Noticia a Todos";
    
    const btnCancel = document.getElementById('btnCancelEditNews');
    if(btnCancel) btnCancel.style.display = 'none';
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
    } catch(e) { 
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
    if(confirm("¿Seguro que deseas eliminar esta noticia de todos los paneles?")) {
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
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    }
};
window.approveSuggestion = async (id) => { await updateDoc(doc(db, "suggestions", id), { approved: true }); window.showNotification("Idea aprobada."); loadAdminData(); };
window.deleteSuggestion = async (id) => { if(confirm("¿Eliminar sugerencia?")) { await deleteDoc(doc(db, "suggestions", id)); loadAdminData(); } };

async function loadUserClients() { 
    document.getElementById('tableLoader').style.display = 'block'; 
    document.getElementById('mainTable').style.display = 'none'; 
    if(document.getElementById('loadMoreContainer')) document.getElementById('loadMoreContainer').style.display = 'none';
    clients = []; 
    
    try {
        const q = query(collection(db, "clients"), where("userId", "==", currentUser.uid), limit(30)); 
        const snapshot = await getDocs(q); 
        
        if(!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            if(snapshot.docs.length === 30 && document.getElementById('loadMoreContainer')) {
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
    if(!lastVisibleDoc) return;
    const btn = document.querySelector('#loadMoreContainer button');
    btn.innerText = "Cargando..."; btn.disabled = true;

    try {
        const q = query(collection(db, "clients"), where("userId", "==", currentUser.uid), startAfter(lastVisibleDoc), limit(30));
        const snapshot = await getDocs(q);

        if(!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            snapshot.forEach((d) => { clients.push({ id: d.id, ...d.data() }); }); 
            window.renderTable();
        }
        
        if(snapshot.docs.length < 30 && document.getElementById('loadMoreContainer')) {
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
    if(!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE empezar con +");
    
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

        // 🗑️ MAGIA AUTOMÁTICA: Eliminamos del stock lo que hayamos entregado en las pestañas
        let stock = currentUserData.inventory || [];
        let updatedStock = false;
        Object.values(multiAccData).forEach(acc => {
            if (acc.inventoryId) {
                stock = stock.filter(item => item.id !== acc.inventoryId);
                updatedStock = true;
            }
        });
        if (updatedStock) {
            await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
            currentUserData.inventory = stock;
        }
        
        // Limpiamos el puente de enlace de la Matriz para el siguiente registro
        if(typeof variablesEnlaceMatriz !== 'undefined') {
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

    } catch(e) { 
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
        
        if(type === 'mes') {
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
        const strFirebase = `${fechaNueva.getFullYear()}-${String(fechaNueva.getMonth()+1).padStart(2,'0')}-${String(fechaNueva.getDate()).padStart(2,'0')}`;
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
            let baseMsg = currentUserData.waTemplate || "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*.\nPagos: {pago}";
            let paymentInfo = currentUserData.waPaymentInfo || "(Pregúntame por mis métodos de pago)";
            let uCount = c.accountUnits || 1;
            let precioCalculado = (c.price || 0) * uCount;
            let moneda = currentUserData.currency || "S/";

            let finalMsg = baseMsg
                .replace(/{nombre}/g, c.name)
                .replace(/{plataforma}/g, c.platform)
                .replace(/{fecha}/g, nuevaFechaBonita)
                .replace(/{pago}/g, paymentInfo)
                .replace(/{precio}/g, precioCalculado.toFixed(2))
                .replace(/{moneda}/g, moneda);

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
    c.platform.split(', ').forEach(p => { cbs.forEach(cb => { if(cb.value === p) cb.checked = true; }); });
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
    const tbody = document.getElementById('tableBody'); tbody.innerHTML = ''; const today = new Date(); today.setHours(0,0,0,0);
    const search = document.getElementById('searchInput').value.toLowerCase(); const filter = document.getElementById('filterSelect').value;
    let proc = clients.map(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0,0,0,0); const diff = Math.ceil((exp - today) / 86400000); return { ...c, expDate: exp, diffDays: diff, statusCat: diff > 3 ? 'active' : (diff >= 0 ? 'warning' : 'expired') }; }).sort((a, b) => a.diffDays - b.diffDays);
    
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
    if(document.getElementById('statsPanel').style.display === 'grid') window.toggleStats(true);
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
        let baseMsg = currentUserData.waTemplate || "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*.\nPagos: {pago}";
        let paymentInfo = currentUserData.waPaymentInfo || "(Pregúntame por mis métodos de pago)";
        finalMsg = baseMsg
            .replace(/{nombre}/g, c.name)
            .replace(/{plataforma}/g, c.platform)
            .replace(/{fecha}/g, dateStr)
            .replace(/{pago}/g, paymentInfo);

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
document.querySelectorAll('#checkboxDropdown input').forEach(cb => { cb.addEventListener('change', () => { const checked = Array.from(document.querySelectorAll('#checkboxDropdown input:checked')).map(c => c.value); const el = document.getElementById('selectText'); if(checked.length) { el.textContent = checked.join(', '); el.classList.add('has-selection'); } else { el.textContent = 'Plataforma(s)...'; el.classList.remove('has-selection'); } }); });

window.toggleStats = (forceUpdate = false) => {
    const p = document.getElementById('statsPanel'); 
    const a = document.getElementById('analyticsSection');
    
    if (!forceUpdate) {
        const isVisible = p.style.display === 'grid';
        p.style.display = isVisible ? 'none' : 'grid';
        a.style.display = isVisible ? 'none' : 'flex';
    }
    
    if (p.style.display === 'grid') {
        let act=0, w=0, e=0, profit=0, income=0, cost=0; const t = new Date(); t.setHours(0,0,0,0);
        clients.forEach(c => {
            const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0,0,0,0);
            const d = Math.ceil((x-t)/86400000);
            if(d>=0) { if(d>3) act++; else w++; const uCount = c.accountUnits || 1; profit += ((c.price || 0) - (c.cost || 0)) * uCount; income += (c.price || 0) * uCount; cost += (c.cost || 0) * uCount; } else e++;
        });
        document.getElementById('statActive').innerText=act; document.getElementById('statWarning').innerText=w; document.getElementById('statExpired').innerText=e;
        document.getElementById('statProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`; document.getElementById('bdIncome').innerText = `${globalCurrency}${income.toFixed(2)}`; document.getElementById('bdCost').innerText = `${globalCurrency}${cost.toFixed(2)}`; document.getElementById('bdProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`;
        
        // ¡Magia! Renderizamos los gráficos si la librería ya cargó
        if(typeof ApexCharts !== 'undefined') {
            window.renderCharts(income, cost, profit);
        }
    }
};

window.exportToExcel = () => { if (!clients.length) return window.showNotification("No hay datos"); let csv = `data:text/csv;charset=utf-8,Cliente,Plataformas,WhatsApp,Unidades,Costo Total(${globalCurrency}),Precio Total(${globalCurrency}),Vencimiento\n`; clients.forEach(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); const u = c.accountUnits||1; csv += `"${c.name}","${c.platform}",${c.phone},${u},${(c.cost||0)*u},${(c.price||0)*u},${exp.toLocaleDateString('es-ES')}\n`; }); const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", `Clientes_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
window.copyExpiredList = () => { const t = new Date(); t.setHours(0,0,0,0); let exp = []; clients.forEach(c => { const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0,0,0,0); if (x < t) exp.push(`- ${c.name} | ${c.platform} | ${c.phone}`); }); if (!exp.length) return window.showNotification("Sin vencidos"); navigator.clipboard.writeText("🚨 VENCEDORES:\n\n" + exp.join('\n')).then(() => window.showNotification("Lista copiada")); }


/* --- GENERADOR DE RECIBOS EN IMAGEN (VERSIÓN DEFINITIVA IPHONE + PC) --- */
window.downloadTicket = async (clientId, event) => {
    // Capturamos el botón correctamente
    const btn = event.currentTarget || event.target; 
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Gen...";
    btn.disabled = true;

    try {
        const c = clients.find(x => x.id === clientId);
        if(!c) return window.showNotification("Cliente no encontrado");

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

    } catch(e) {
        console.error("Error completo en Recibo:", e);
        window.showNotification("Error al generar el recibo.");
    } finally {
        // Restaurar el botón original
        if(btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
/* --- SISTEMA DE NOTICIAS PARA EL CLIENTE (FIREBASE) --- */
window.openNewsModal = async () => {
    // 1. Apagamos el punto rojo y guardamos el "Visto"
    const badge = document.getElementById('newsBadge');
    if(badge) badge.style.display = 'none';
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
        noticias.sort((a,b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.fechaIso) - new Date(a.fechaIso);
        });

        sidebar.innerHTML = '';
        content.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center;"><p style="color: var(--mac-text-secondary); text-align: center;">👈 Selecciona una noticia de la izquierda para ver los detalles.</p></div>';

        if(noticias.length === 0) {
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
            div.onclick = () => window.viewNewsDetail({...noticia, fecha: dateStr}, div);
            sidebar.appendChild(div);
        });
    } catch(e) {
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
window.showWrapped = () => {
    window.closeModals(false);
    let totalUnits = 0;
    let platformCounts = {};
    let dayCounts = {};
    let clientLoyalty = {}; 

    const today = new Date();

    // Recorrido analítico de toda la base de clientes local
    clients.forEach(c => {
        const u = c.accountUnits || 1;
        totalUnits += u;

        // 1. Mapeo de plataformas más vendidas
        if (c.platform) {
            c.platform.split(', ').forEach(p => {
                platformCounts[p] = (platformCounts[p] || 0) + u;
            });
        }

        // 2. Mapeo de días con mayor índice de registros
        if (c.date) {
            let cleanDate = String(c.date);
            if (cleanDate.includes('-')) {
                const parts = cleanDate.split('-');
                if (parts.length === 3) cleanDate = `${parts[2]}/${parts[1]}`;
            }
            dayCounts[cleanDate] = (dayCounts[cleanDate] || 0) + u;
        }

        // 3. Mapeo de Cliente Fiel (Nombre idéntico + Mismo WhatsApp)
        if (c.name && c.phone) {
            const clientKey = `${c.name.trim().toLowerCase()}_${c.phone.trim()}`;
            if (!clientLoyalty[clientKey]) {
                clientLoyalty[clientKey] = {
                    originalName: c.name.trim(),
                    registeredUnits: 0,
                    appearances: 0
                };
            }
            clientLoyalty[clientKey].registeredUnits += u;
            clientLoyalty[clientKey].appearances += 1;
        }
    });

    // Encontrar Plataforma Líder
    let topPlatform = "Ninguna"; let maxPlatformU = 0;
    for (let p in platformCounts) {
        if (platformCounts[p] > maxPlatformU) { maxPlatformU = platformCounts[p]; topPlatform = p; }
    }

    // Encontrar Día Pico de Ventas
    let topDay = "Sin registros"; let maxDayU = 0;
    for (let d in dayCounts) {
        if (dayCounts[d] > maxDayU) { maxDayU = dayCounts[d]; topDay = d; }
    }

    // Encontrar Cliente Más Fiel
    let topClientName = "No detectado"; let topClientUnits = 0; let maxAppearances = 0;
    for (let k in clientLoyalty) {
        if (clientLoyalty[k].appearances > maxAppearances) {
            maxAppearances = clientLoyalty[k].appearances;
            topClientName = clientLoyalty[k].originalName;
            topClientUnits = clientLoyalty[k].registeredUnits;
        } else if (clientLoyalty[k].appearances === maxAppearances && clientLoyalty[k].registeredUnits > topClientUnits) {
            topClientName = clientLoyalty[k].originalName;
            topClientUnits = clientLoyalty[k].registeredUnits;
        }
    }
    
    // Fallback por si todos tienen 1 sola aparición pero hay clientes
    if (maxAppearances === 1 && Object.keys(clientLoyalty).length > 0) {
        let maxU = 0;
        for (let k in clientLoyalty) {
            if (clientLoyalty[k].registeredUnits > maxU) {
                maxU = clientLoyalty[k].registeredUnits;
                topClientName = clientLoyalty[k].originalName;
                topClientUnits = clientLoyalty[k].registeredUnits;
            }
        }
    }

    const mesActual = today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
    
    let frase = "";
    if (totalUnits >= 100) frase = "¡Nivel Dios! Tu imperio sigue expandiéndose sin límites. 👑";
    else if (totalUnits >= 50) frase = "¡Imparable! Estás dominando el mercado con fuerza absoluta. 🔥";
    else if (totalUnits >= 20) frase = "¡Excelente ritmo! Tienes una base poderosa para escalar. 🚀";
    else if (totalUnits > 0) frase = "¡Gran trabajo! Cada cuenta suma para alcanzar la cima. 🌱";
    else frase = "Aún no hay ventas registradas. ¡Es hora de despertar tu poder! 💥";

    // 🛑 CAMBIO AQUÍ: Ahora llama al nuevo modal exclusivo y elimina el sidebar
    document.getElementById('wrappedModal').style.display = 'flex';
    
    const content = document.getElementById('wrappedContentArea');
    content.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <span style="display:inline-block; background:rgba(255,45,85,0.2); color:#FF2D55; padding:5px 15px; border-radius:20px; font-weight:bold; font-size:12px; margin-bottom:10px;">A.G.C. WRAPPED</span>
            <h2 style="margin-top: 0; margin-bottom: 5px; font-size: 24px;">Resumen de ${mesActual}</h2>
            <p style="font-size: 14px; color: var(--mac-text-secondary); margin-bottom: 20px;">${frase}</p>
            
            <div style="display: flex; gap: 10px; flex-direction: column; max-width: 360px; margin: 0 auto 25px auto; text-align: left;">
                <div style="background: var(--mac-gray); padding: 12px 15px; border-radius: 12px; border: 1px solid var(--mac-border);">
                    <span style="font-size:11px; color: var(--mac-text-secondary); font-weight:bold; text-transform:uppercase;">Cuentas Totales</span>
                    <p style="margin:2px 0 0 0; font-size:18px; font-weight:900; color:var(--mac-green);">${totalUnits}</p>
                </div>
                <div style="background: var(--mac-gray); padding: 12px 15px; border-radius: 12px; border: 1px solid var(--mac-border);">
                    <span style="font-size:11px; color: var(--mac-text-secondary); font-weight:bold; text-transform:uppercase;">Plataforma Líder</span>
                    <p style="margin:2px 0 0 0; font-size:18px; font-weight:900; color:var(--mac-blue);">${topPlatform}</p>
                </div>
                <div style="background: var(--mac-gray); padding: 12px 15px; border-radius: 12px; border: 1px solid var(--mac-border);">
                    <span style="font-size:11px; color: var(--mac-text-secondary); font-weight:bold; text-transform:uppercase;">Día de Mayor Flujo</span>
                    <p style="margin:2px 0 0 0; font-size:18px; font-weight:900; color:var(--mac-orange);">${topDay}</p>
                </div>
                <div style="background: var(--mac-gray); padding: 12px 15px; border-radius: 12px; border: 1px solid var(--mac-border);">
                    <span style="font-size:11px; color: var(--mac-text-secondary); font-weight:bold; text-transform:uppercase;">Cliente Más Fiel</span>
                    <p style="margin:2px 0 0 0; font-size:18px; font-weight:900; color:#AF52DE;">${topClientName}</p>
                    <span style="font-size:12px; color:var(--mac-text-secondary); font-weight:500;">Registró: ${topClientUnits} cuentas</span>
                </div>
            </div>
            
            <button class="btn-primary" style="padding:16px; font-size:15px; width:100%; max-width:320px; background: linear-gradient(45deg, #FF2D55, #5856D6); border:none; box-shadow: 0 10px 20px rgba(88, 86, 214, 0.3);" onclick="window.downloadWrapup('${totalUnits}', '${topPlatform}', '${topDay}', '${topClientName}', '${topClientUnits}', '${frase}', '${mesActual}', event)">
                <i class='bx bxs-camera'></i> Descargar Historia (IG/WA)
            </button>
        </div>
    `;
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
    exp.setHours(0,0,0,0);
    
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
    const today = new Date(); today.setHours(0,0,0,0);
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
    if(installBtn) installBtn.style.display = 'block';
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
    if(installBtn) installBtn.style.display = 'none';
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
            noticias.sort((a,b) => new Date(b.fechaIso) - new Date(a.fechaIso));
            
            const latestNewsDate = noticias[0].fechaIso;
            const lastSeen = localStorage.getItem('lastSeenNews');
            
            // Si nunca ha visto las noticias, o si la noticia más nueva es más reciente que su última visita
            if (!lastSeen || new Date(latestNewsDate) > new Date(lastSeen)) {
                const badge = document.getElementById('newsBadge');
                if(badge) badge.style.display = 'block';
            }
        }
    } catch(e) {
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
    document.getElementById('storeLinkInput').value = window.location.origin + window.location.pathname + "?tienda=" + aliasOrUid;
    
    // 🔥 ACTUALIZAR EL SWITCH DE ESTADO
    const storeToggle = document.getElementById('storeActiveToggle');
    if (storeToggle) storeToggle.checked = currentUserData.storeActive !== false; // true por defecto

    const externalUrl = currentUserData.externalStoreUrl;
    if (externalUrl && externalUrl.trim() !== '') {
        document.getElementById('externalCatalogSetup').style.display = 'none';
        document.getElementById('internalCatalogSection').style.display = 'none';
        document.getElementById('btnCopyInternalLink').style.display = 'none';
        document.getElementById('externalCatalogActive').style.display = 'block';
        document.getElementById('activeExternalLinkText').innerText = externalUrl;
    } else {
        document.getElementById('externalCatalogSetup').style.display = 'block';
        document.getElementById('internalCatalogSection').style.display = 'block';
        document.getElementById('btnCopyInternalLink').style.display = 'block';
        document.getElementById('externalCatalogActive').style.display = 'none';
        window.renderStoreItems();
        window.syncStoreCategories();
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
    } catch(e) { 
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
    } catch(e) { window.showNotification("Error: " + e.message); }
};

window.removeExternalStore = async () => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { externalStoreUrl: null });
        currentUserData.externalStoreUrl = null; 
        window.showNotification("Catálogo desvinculado. Tiendita interna reactivada 🏪");
        window.openStoreModal();
    } catch(e) { window.showNotification("Error: " + e.message); }
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
    const price = document.getElementById('storePrice').value;
    const cat = document.getElementById('storeCategorySelect').value;
    const desc = document.getElementById('storeDesc') ? document.getElementById('storeDesc').value.trim() : '';
    const autoStock = document.getElementById('storeAutoStock').checked;
    const requiresInvite = document.getElementById('storeRequiresInvite') ? document.getElementById('storeRequiresInvite').checked : false;
    const badgeOption = document.getElementById('storeBadgeOption').value;

    const selects = document.querySelectorAll('.store-stock-select');
    const stockPlatforms = Array.from(selects).map(s => s.value).filter(val => val !== '');

    if (!plat || !price) return window.showNotification("Completa plataforma y precio");
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

        let catalog = currentUserData.storeCatalog || [];
        catalog.push({ 
            id: 'item_' + Date.now(), 
            platform: plat, 
            price: parseFloat(price),
            category: cat,
            desc: desc, imgUrl: imgUrl, type: type, 
            autoStock: autoStock, stockPlatforms: stockPlatforms,
            requiresInvite: requiresInvite,
            badgeOption: badgeOption, status: 'disponible' 
        });

        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;

        document.getElementById('storePlatform').value = '';
        document.getElementById('storePrice').value = '';
        if (document.getElementById('storeDesc')) document.getElementById('storeDesc').value = '';
        if (fileInput) fileInput.value = '';
        document.getElementById('storeCategorySelect').value = '';
        
        // Reset de checkboxes
        document.getElementById('storeAutoStock').checked = false;
        if(document.getElementById('storeRequiresInvite')) document.getElementById('storeRequiresInvite').checked = false;
        
        // 🔥 Apagar las luces de las tarjetas visuales
        document.querySelectorAll('.store-toggle-card').forEach(label => {
            label.style.border = '1px solid var(--mac-border)';
            label.style.background = 'var(--mac-surface)';
            const icon = label.querySelector('.store-toggle-icon');
            if(icon) {
                icon.className = 'bx bx-circle store-toggle-icon';
                icon.style.color = 'var(--mac-text-secondary)';
            }
        });

        document.getElementById('storeBadgeOption').value = '';
        window.toggleStoreStockFields();
        window.renderStoreItems();
        window.showNotification("✅ Producto añadido al catálogo");
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally { 
        btn.innerHTML = "<i class='bx bx-plus-circle' style='font-size: 22px;'></i> Añadir al Catálogo"; 
        btn.disabled = false; 
    }
};
window.renderStoreItems = () => {
    const list = document.getElementById('storeItemsList');
    list.innerHTML = '';
    const catalog = currentUserData.storeCatalog || [];
    
    if(catalog.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); font-size:12px;">Tu catálogo está vacío.</p>';
        return;
    }

    catalog.forEach((item, index) => {
        let isAgotado = item.status === 'agotado';
        if (item.badgeOption === 'a_pedido') isAgotado = false; // A Pedido ignora el botón de agotado
        
        const statusBadge = isAgotado ? `<span style="background:var(--mac-red); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">AGOTADO</span>` : `<span style="background:var(--mac-green); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">DISPONIBLE</span>`;
        const typeBadge = item.type === 'Combo' ? `<span style="background:var(--mac-orange); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold; margin-right:5px;"><i class='bx bx-gift'></i> COMBO</span>` : '';

        const titleSafe = item.platform.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descSafe = item.desc ? item.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '') : 'Sin detalles adicionales.';

        // 🔥 FIX: Un solo div con el diseño correcto
        const div = document.createElement('div');
        div.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--mac-surface); padding:10px; border-radius:8px; border:1px solid var(--mac-border); opacity: ${isAgotado ? '0.7' : '1'}; gap: 10px;`;
        
        div.innerHTML = `
            <div style="flex:1; min-width:0; overflow:hidden;">
                ${typeBadge}
                <strong style="color:var(--mac-text-main); font-size:14px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.platform}</strong>
                <span style="color:var(--mac-text-secondary); font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap; margin:4px 0;">${item.desc || ''}</span>
                <span style="color:var(--mac-green); font-size:13px; font-weight:bold; display:block; margin-top:2px;">${globalCurrency}${item.price.toFixed(2)}</span>
                <div style="margin-top: 5px;">${statusBadge}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; width: 100px; flex-shrink: 0;">
                <button class="action-btn" style="border: 1px solid var(--mac-border); color: var(--mac-text-main); font-size: 11px; padding: 4px; border-radius:6px; background:transparent;" onclick="window.toggleStoreItemStatus(${index})">🔄 Cambiar Estado</button>
                <button class="action-btn" style="border: 1px solid var(--mac-blue); color: var(--mac-blue); font-size: 11px; padding: 4px; border-radius:6px; background:transparent;" onclick="window.editStoreItem(${index})"><i class='bx bx-edit'></i> Editar</button>
                <button class="action-btn btn-del" style="padding: 4px; font-size: 11px; border-radius:6px;" onclick="window.deleteStoreItem(${index})"><i class='bx bx-trash'></i> Borrar</button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.editStoreItem = async (index) => {
    let catalog = currentUserData.storeCatalog || [];
    let item = catalog[index];
    if (!item) return;

    let catOptions = '<option value="">Sin Categoría</option>';
    const userCats = currentUserData.storeCategories || [];
    userCats.forEach(c => {
        const sel = item.category === c ? 'selected' : '';
        catOptions += `<option value="${c}" ${sel}>${c}</option>`;
    });

    const { value: formValues } = await Swal.fire({
        title: 'Editar Producto',
        html: `
            <div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary);">Nombre del Servicio/Combo:</label>
                <input id="swal-plat" class="swal2-input" style="margin:0; width: 100%; box-sizing:border-box;" value="${item.platform}">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div>
                        <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary);">Precio:</label>
                        <input id="swal-price" type="number" step="0.1" class="swal2-input" style="margin:0; width: 100%; box-sizing:border-box;" value="${item.price}">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary);">Categoría:</label>
                        <select id="swal-cat" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-bg); color: var(--mac-text-main); margin-top: 5px;">
                            ${catOptions}
                        </select>
                    </div>
                </div>
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-orange); margin-top: 10px;">
                    <input type="checkbox" id="swal-invite" ${item.requiresInvite ? 'checked' : ''}> Venta por Invitación
                </label>
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary); margin-top: 10px;">Descripción:</label>
                <textarea id="swal-desc" class="swal2-textarea" style="margin: 5px 0 0 0; width: 100%; box-sizing:border-box; padding: 10px; border-radius: 8px; font-size: 14px; min-height: 80px;">${item.desc || ''}</textarea>
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary); margin-top: 10px;">Cambiar Imagen (Opcional):</label>
                <input type="file" id="swal-img" accept="image/*" style="margin:0; width: 100%; padding: 10px; font-size: 12px; border: 1px solid var(--mac-border); border-radius: 8px; background: var(--mac-bg); color: var(--mac-text-main); box-sizing: border-box;">
            </div>
        `,
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'Guardar Cambios', cancelButtonText: 'Cancelar', confirmButtonColor: '#007AFF',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff', color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        preConfirm: () => {
            const plat = document.getElementById('swal-plat').value.trim();
            const price = parseFloat(document.getElementById('swal-price').value);
            const cat = document.getElementById('swal-cat').value;
            const invite = document.getElementById('swal-invite').checked;
            const desc = document.getElementById('swal-desc').value.trim();
            const fileInput = document.getElementById('swal-img');
            const file = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;
            if (!plat || isNaN(price)) { Swal.showValidationMessage('El nombre y el precio son obligatorios'); return false; }
            return { platform: plat, price: price, category: cat, desc: desc, requiresInvite: invite, file: file };
        }
    });

    if (formValues) {
        let newImgUrl = item.imgUrl || ""; 
        try {
            if (formValues.file) {
                const storageRef = ref(storage, `store_images/${currentUser.uid}_${Date.now()}_${formValues.file.name}`);
                const snapshot = await uploadBytes(storageRef, formValues.file);
                newImgUrl = await getDownloadURL(snapshot.ref);
            }
            catalog[index].platform = formValues.platform;
            catalog[index].price = formValues.price;
            catalog[index].category = formValues.category; // 👈 Guarda categoría
            catalog[index].desc = formValues.desc;
            catalog[index].requiresInvite = formValues.requiresInvite;
            catalog[index].imgUrl = newImgUrl; 
            await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
            currentUserData.storeCatalog = catalog;
            window.renderStoreItems();
            window.showNotification("✅ Producto editado correctamente");
        } catch(e) { window.showNotification("Error al editar: " + e.message); }
    }
};
window.toggleStoreItemStatus = async (index) => {
    let catalog = currentUserData.storeCatalog || [];
    catalog[index].status = catalog[index].status === 'agotado' ? 'disponible' : 'agotado';
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;
        window.renderStoreItems();
    } catch(e) { window.showNotification("Error al cambiar estado"); }
};

window.deleteStoreItem = async (index) => {
    let catalog = currentUserData.storeCatalog || [];
    catalog.splice(index, 1);
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;
        window.renderStoreItems();
    } catch(e) { window.showNotification("Error al borrar"); }
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
    const priceStr = `${data.currency || 'S/'}${item.price.toFixed(2)}`;
    const text = `🔥 ¡Mira esta oferta de *${item.platform}* a solo *${priceStr}* en la tienda oficial de ${data.name}!`;
    
    if (navigator.share) {
        try {
            await navigator.share({ title: data.name, text: text, url: storeUrl });
        } catch (err) { console.log("Compartir cancelado o no soportado"); }
    } else {
        window.copyToClipboard(text + " " + storeUrl, "Link de Oferta");
    }
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
                    <div class="cart-item-price">${data.currency || 'S/'}${item.price.toFixed(2)}</div>
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
    
    // Preparar el objeto maestro para submitCheckout
    currentCheckoutItem = {
        platform: joinedPlatforms,
        price: totalPrice,
        requiresInvite: requiresInvite,
        type: finalType
    };
    
    document.getElementById('checkoutItemName').innerText = window.storeCart.length > 1 ? `Paquete (${window.storeCart.length} servicios)` : joinedPlatforms;
    document.getElementById('checkoutItemPrice').innerText = `${data.currency || 'S/'}${totalPrice.toFixed(2)}`;
    
    const emailContainer = document.getElementById('checkoutEmailContainer');
    if(emailContainer) {
        emailContainer.style.display = requiresInvite ? 'flex' : 'none';
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
        selectHtml += `</select><div id="pmDetailsContainer" style="display:none; background: var(--mac-bg); padding: 15px; border-radius: 10px; border: 1px dashed var(--mac-border);"></div>`;
        pmContainer.innerHTML = selectHtml;
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
    if(event) event.currentTarget.classList.add('active');
    window.renderPublicCatalog();
};

window.filterStoreCategory = (cat, event) => {
    window.currentStoreCatFilter = cat;
    document.querySelectorAll('#publicStoreCategoryFilters .spotify-chip-btn').forEach(btn => btn.classList.remove('active'));
    if(event) event.currentTarget.classList.add('active');
    window.renderPublicCatalog();
};

window.renderPublicCatalog = () => {
    const catalogBox = document.getElementById('publicStoreCatalog');
    if (!catalogBox) return;
    catalogBox.innerHTML = '';
    
    const catalog = window.publicCatalogCache || [];
    const data = window.publicStoreDataCache;
    if (!data) return;

    const isStoreOpen = data.storeActive !== false; 
    const searchTerm = document.getElementById('publicStoreSearchInput') ? document.getElementById('publicStoreSearchInput').value.toLowerCase() : '';
    
    // 1. Extraemos las categorías ÚNICAS
    const activeCategories = [...new Set(catalog.map(i => i.category).filter(c => c && c !== ''))];
    const catContainer = document.getElementById('publicStoreCategoryFilters');
    
    if (activeCategories.length > 0) {
        catContainer.style.display = 'flex';
        // Solo repintamos los botones si cambió la lista de categorías
        if (catContainer.children.length !== activeCategories.length + 1) {
            catContainer.innerHTML = `<button class="spotify-chip-btn ${window.currentStoreCatFilter === 'Todas' ? 'active' : ''}" onclick="window.filterStoreCategory('Todas', event)">Todo el Catálogo</button>`;
            activeCategories.forEach(cat => {
                catContainer.innerHTML += `<button class="spotify-chip-btn ${window.currentStoreCatFilter === cat ? 'active' : ''}" onclick="window.filterStoreCategory('${cat}', event)">${cat}</button>`;
            });
        }
    } else {
        catContainer.style.display = 'none';
    }

    // 2. Filtramos el catálogo
    const typeF = window.currentStoreTypeFilter;
    const catF = window.currentStoreCatFilter;

    const itemsFiltrados = catalog.filter(item => {
        const matchType = typeF === 'Todos' || item.type === typeF;
        const matchCat = catF === 'Todas' || item.category === catF;
        const matchSearch = item.platform.toLowerCase().includes(searchTerm) || (item.desc && item.desc.toLowerCase().includes(searchTerm));
        return matchType && matchCat && matchSearch;
    });

    // 3. Generamos el Título Dinámico con Emoji Minimalista
    const titleContainer = document.getElementById('dynamicCategoryTitle');
    if (titleContainer) {
        if (searchTerm) {
            titleContainer.innerHTML = `<span style="font-size: 13px; color: var(--mac-text-secondary); font-weight:bold;">Resultados para: "${searchTerm}"</span>`;
        } else {
            let titlePrefix = typeF === 'Combo' ? 'COMBOS DE' : (typeF === 'Servicio' ? 'SERVICIOS DE' : 'EXPLORAR');
            let rawCat = catF === 'Todas' ? 'TODO EL CATÁLOGO' : catF;
            
            // Atrapamos el Emoji para volverlo un ícono vectorial
            const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
            let emojiMatch = rawCat.match(emojiRegex);
            let emoji = emojiMatch ? emojiMatch[0] : "<i class='bx bx-category'></i>";
            let cleanText = rawCat.replace(emojiRegex, '').trim().toUpperCase();

            // Magia CSS para monocromatizar el Emoji original
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

    if (itemsFiltrados.length === 0) {
        catalogBox.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); width: 100%; grid-column: 1/-1; padding: 40px 0; font-weight: 500;">No hay productos que coincidan con la búsqueda o filtro.</p>';
        return;
    }

    // 4. Dibujar las tarjetas (El código de diseño queda idéntico al que ya tenías)
    itemsFiltrados.forEach(item => {
        const priceStr = `${data.currency || 'S/'}${item.price.toFixed(2)}`;
        let isAgotado = item.status === 'agotado';
        let stockHtml = '';
        
        if (item.badgeOption === 'a_pedido') {
            isAgotado = false;
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

        const titleSafe = item.platform.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descSafe = item.desc ? item.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '') : 'Sin detalles adicionales.';
        const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}" alt="${item.platform}">` : `<div style="width:100%; height:100%; background:var(--mac-gray); display:flex; align-items:center; justify-content:center;"><i class='bx bx-play-circle' style='font-size:48px; color:var(--mac-text-secondary); opacity:0.3;'></i></div>`;

        let btnHTML = '';
        if (!isStoreOpen) {
            btnHTML = `<span class="status expired" style="padding:10px; border-radius:12px; font-weight:800; font-size:12px; background: var(--mac-gray); color: var(--mac-text-secondary);"><i class='bx bx-store-alt'></i> Cerrada</span>`;
        } else if (isAgotado) {
            btnHTML = `<span class="status expired" style="padding:10px; border-radius:12px; font-weight:800; font-size:12px;">Agotado</span>`;
        } else {
            btnHTML = `<button onclick="window.addToCart('${item.id}')" class="btn-wa" style="border:none; cursor:pointer; padding:0; border-radius:14px; display:inline-flex; align-items:center; justify-content:center; margin:0; width: 48px; height: 48px; box-shadow: 0 4px 10px rgba(37, 211, 102, 0.3); background: linear-gradient(135deg, #25D366 0%, #128C7E 100%) !important; color: white !important;"><i class='bx bx-cart-add' style='margin:0; font-size: 24px;'></i></button>`;
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
            <div class="store-product-glass-footer">
                <div style="width: 100%; margin-bottom: 12px;">
                    <strong class="store-product-title" style="display:block; font-size:18px; line-height:1.3; color: var(--mac-text-main); word-break: break-word;">${item.platform}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; width:100%; margin-top: auto;">
                    <div class="store-product-info" style="display:flex; flex-direction:column; gap:4px;">
                        <span class="store-product-price" style="font-size: 22px; font-weight: 900; color: var(--mac-green);">${priceStr}</span>
                        ${stockHtml} 
                    </div>
                    <div class="store-product-action" style="flex-shrink:0;">
                        ${btnHTML}
                    </div>
                </div>
            </div>
        `;
        catalogBox.appendChild(card);
    });
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

            // Activamos Filtros y Buscador estilo Spotify
            const searchContainer = document.getElementById('publicStoreSearchContainer');
            const filtersWrapper = document.getElementById('storeAppFiltersWrapper');
            if (window.publicCatalogCache.length > 0) {
                if (searchContainer) searchContainer.style.display = 'block';
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
    if(emailContainer) {
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
    
    const data = window.publicStoreDataCache;
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
        const data = window.publicStoreDataCache;
        const vendedorId = data.uid; 
        
        const storageRef = ref(storage, `comprobantes/${vendedorId}_${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const comprobanteUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, "pedidos"), {
            vendedorId: vendedorId,
            clienteNombre: name,
            clienteNumero: phone,
            tipo: currentCheckoutItem.type || 'Servicio',
            plataforma: currentCheckoutItem.platform,
            precio: currentCheckoutItem.price,
            comprobanteUrl: comprobanteUrl,
            requiereInvitacion: currentCheckoutItem.requiresInvite || false,
            clienteCorreo: clienteCorreo,
            estado: 'pendiente',
            fecha: new Date().toISOString()
        });

        // 🔥 NUEVO: GATILLAR NOTIFICACIÓN AL VENDEDOR (DISPARA EL PUSH)
        fetch('https://bot.panelagc.com/api/notificar-venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vendedorId: vendedorId,
                plataforma: currentCheckoutItem.platform,
                precio: currentCheckoutItem.price,
                moneda: data.currency || 'S/'
            })
        }).catch(err => console.error("Error enviando alerta de venta:", err));

        document.getElementById('checkoutModal').style.display = 'none';
        // Vaciar carrito
        window.storeCart = [];
        document.getElementById('cartBadge').innerText = '0';
        document.getElementById('floatingCartBtn').style.display = 'none';
        
        Swal.fire({
            icon: 'success',
            title: '¡Pago Enviado!',
            html: '<p style="font-size:14px; color:var(--mac-text-secondary);">El vendedor verificará tu comprobante en breve.</p>',
            confirmButtonColor: '#34C759',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
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
    } catch(e) {
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
        if(btnClientes) { btnClientes.style.background = 'var(--mac-blue)'; btnClientes.style.color = 'white'; }
        if(btnCuentas) { btnCuentas.style.background = 'transparent'; btnCuentas.style.color = 'var(--mac-text-secondary)'; }
        
        if(tableClientesWrapper) tableClientesWrapper.style.setProperty('display', 'block', 'important'); 
        if(tableCuentas) tableCuentas.style.setProperty('display', 'none', 'important');
        if(subtitle) subtitle.innerText = 'Gestión de clientes';
        
        if(filterSelect) filterSelect.style.display = 'block'; 
        if(searchInput) searchInput.value = '';
        window.renderTable();

    } else if (tab === 'cuentas') {
        if(btnCuentas) { btnCuentas.style.background = 'var(--mac-blue)'; btnCuentas.style.color = 'white'; }
        if(btnClientes) { btnClientes.style.background = 'transparent'; btnClientes.style.color = 'var(--mac-text-secondary)'; }
        
        if(tableClientesWrapper) tableClientesWrapper.style.setProperty('display', 'none', 'important');
        if(tableCuentas) tableCuentas.style.setProperty('display', 'block', 'important');
        if(subtitle) subtitle.innerText = 'Gestión de cuentas';
        
        if(filterSelect) filterSelect.style.display = 'none'; 
        if(searchInput) searchInput.value = '';
        if(typeof window.renderMasterAccounts === 'function') window.renderMasterAccounts(); 
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
    if(!item) return;

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
    if(!item) return;

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
    cbs.forEach(cb => { if(cb.value === item.platform) cb.checked = true; });
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
    if(!item) return;

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
            window.opcionesCuentasGlobal += `<option value="${acc.id}">[${acc.platform} - ${acc.type}] ${acc.email} ${acc.type === 'Perfil' ? '(P: '+acc.profile+')' : ''}</option>`;
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

                <button class="btn-primary" style="width:100%; background:var(--mac-green); border:none; padding:14px; font-size:14px; font-weight:bold;" onclick="window.aprobarVenta('${pId}', '${pedido.clienteNumero}', ${pedido.requiereInvitacion ? 'true' : 'false'}, '${pedido.clienteCorreo || ''}', '${pedido.plataforma}', '${nombreCli.replace(/'/g, "\\'")}')">
                    <i class='bx bx-check-shield'></i> Aprobar y Entregar Automático
                </button>
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
        const dateFirebase = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`; 
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
                stock = stock.map(item => item.id === cuenta.id ? { ...item, status: 'vendida' } : item);
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
        window.renderInventory(); 
        loadUserClients(); 

        const plan = (currentUserData.plan_actual || 'demo').toLowerCase();

        if (plan === 'pro' || plan === 'elite') {
            const payloadEntrega = {
                distribuidorId: currentUser.uid,
                numeroCliente: numeroLimpio + '@s.whatsapp.net', 
                cuentas: requiereInvitacion ? [{platform: plataforma}] : cuentasEntregar, 
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
            } catch(e) { window.showNotification("Error: " + e.message); }
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
            // 1. Actualizamos la matriz en Firebase
            await updateDoc(doc(db, "masterAccounts", editingMasterId), { platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName });
            window.showNotification("✅ Cuenta Matriz actualizada");

            // 2. Sincronizamos clientes vinculados y preparamos la lista para el Bot
            const qCli = query(collection(db, "clients"), where("userId", "==", currentUser.uid));
            const snapCli = await getDocs(qCli);
            const updatePromises = [];
            let clientesParaAvisar = []; // 🔥 LA LISTA NEGRA PARA EL BOT
            
            snapCli.forEach(d => {
                const c = d.data();
                let needsUpdate = false;
                let mAccounts = c.multiAccounts || {};
                let rootUpdates = {};
                let datosAviso = null;
                
                // Actualizar si usaba el sistema antiguo de enlace
                if (c.linkedMasterId === editingMasterId) {
                    // 🔥 FIX: Solo actualizar y avisar si REALMENTE cambió el correo o la clave
                    if (c.accountEmail !== email || c.accountPassword !== pass) {
                        rootUpdates.accountEmail = email;
                        rootUpdates.accountPassword = pass;
                        needsUpdate = true;
                        datosAviso = { name: c.name, phone: c.phone, platform: c.platform, email: email, pass: pass, profile: c.accountProfile, pin: c.accountPin };
                    }
                }
                
                // Actualizar si usa el sistema nuevo (multipestaña)
                if (c.multiAccounts) {
                    for (let platKey in mAccounts) {
                        if (mAccounts[platKey].masterAccountId === editingMasterId) {
                            // 🔥 FIX: Solo actualizar y avisar si REALMENTE cambió el correo o la clave
                            if (mAccounts[platKey].email !== email || mAccounts[platKey].password !== pass) {
                                mAccounts[platKey].email = email;
                                mAccounts[platKey].password = pass;
                                needsUpdate = true;
                                datosAviso = { name: c.name, phone: c.phone, platform: platKey, email: email, pass: pass, profile: mAccounts[platKey].profile, pin: mAccounts[platKey].pin };
                            }
                        }
                    }
                }
                
                // Si este cliente pertenece a la matriz y hubo cambios, guardamos en BD y lo metemos a la lista del Bot
                if (needsUpdate) {
                    let finalUpdate = { ...rootUpdates };
                    if (c.multiAccounts) finalUpdate.multiAccounts = mAccounts;
                    updatePromises.push(updateDoc(doc(db, "clients", d.id), finalUpdate));
                    if (datosAviso) clientesParaAvisar.push(datosAviso);
                }
            });
            
            // 3. Ejecutar actualizaciones en Firebase
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                if (typeof loadUserClients === 'function') loadUserClients(); // Recarga la tabla de clientes
                
                // 🔥 4. EL GATILLO DEL BOT (Solo Plan PRO/Elite)
                if ((plan === 'pro' || plan === 'elite') && clientesParaAvisar.length > 0) {
                    fetch('https://bot.panelagc.com/api/actualizar-credenciales', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            distribuidorId: currentUser.uid,
                            clientes: clientesParaAvisar
                        })
                    }).catch(e => console.error("Error al contactar al bot para actualizar:", e));
                    
                    setTimeout(() => {
                        window.showNotification(`🤖 Bot avisando a ${clientesParaAvisar.length} cliente(s) sobre el cambio de clave.`);
                    }, 1500); // Pequeño retraso para que no se superponga con el aviso de "Matriz actualizada"
                }
            }

        } else {
            // MODO CREACIÓN
            await addDoc(collection(db, "masterAccounts"), { userId: currentUser.uid, platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName, timestamp: Date.now() });
            window.showNotification("✅ Cuenta Matriz registrada con éxito");
        }
        
        document.getElementById('masterAccountModal').style.display = 'none';
        editingMasterId = null;
        window.renderMasterAccounts();
    } catch(e) { 
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
    if(!alertsContainer) {
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
                    const hoy = new Date(); hoy.setHours(0,0,0,0);
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
                            <button class="btn-primary" style="font-size: 11px; padding: 4px 8px; width: 100%; text-align: center; background: rgba(48, 209, 88, 0.15); color: var(--mac-green); border: 1px solid var(--mac-green);" onclick="window.vincularClienteAMatriz('${accId}', '${pPlat}', '${pMail}', '${pPass}', ${i})">
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

    } catch(e) {
        container.innerHTML = `<p style="text-align:center; color:var(--mac-orange);">Error cargando matrices: ${e.message}</p>`;
    }
};

// 7. ACCIÓN PARA SALTAR AL FORMULARIO DE CLIENTE DESDE LA MATRIZ
window.vincularClienteAMatriz = (masterId, platform, email, pass, profileNum) => {
    variablesEnlaceMatriz.masterId = masterId;
    variablesEnlaceMatriz.profileNum = profileNum;

    editingClientId = null;
    document.getElementById('clientForm').reset();
    document.getElementById('clientName').value = "Perfil " + profileNum;
    
    const cbs = document.querySelectorAll('#checkboxDropdown input'); 
    cbs.forEach(cb => cb.checked = false); 
    cbs.forEach(cb => { if(cb.value === platform) cb.checked = true; });
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
    window.showNotification("Completa el teléfono y los precios para guardar.");
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
                    
                    if (matSelect && matSelect.value) {
                        const perfil = perfInput.value.trim();
                        if (!perfil || !/\d/.test(perfil)) {
                            Swal.showValidationMessage(`El perfil para ${plataformas[i]} debe contener al menos un NÚMERO (Ej: 3, J3).`);
                            return false;
                        }
                        resultados.push({
                            plataforma: matSelect.getAttribute('data-plat'),
                            matrizId: matSelect.value,
                            perfil: perfil
                        });
                    }
                }
                return resultados; // Retorna un array con todas las asignaciones
            }
        });

        if (formValues && formValues.length > 0) { 
            // Reconstruir o usar multiAccounts existente
            let multiAccounts = c.multiAccounts || {};
            
            // Si estaba usando estructura antigua (1 sola plataforma genérica), la pasamos al nuevo formato multi-pestaña
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

            // Aplicar los nuevos vínculos seleccionados
            formValues.forEach(vinculo => {
                const matrizSeleccionada = masterDataMap[vinculo.matrizId];
                if (!multiAccounts[vinculo.plataforma]) multiAccounts[vinculo.plataforma] = window.getDefaultAccData();
                
                multiAccounts[vinculo.plataforma].masterAccountId = vinculo.matrizId;
                multiAccounts[vinculo.plataforma].profile = vinculo.perfil;
                multiAccounts[vinculo.plataforma].email = matrizSeleccionada.email;
                multiAccounts[vinculo.plataforma].password = matrizSeleccionada.pass;

                // Actualizamos las variables raíz base al primer vínculo para compatibilidad con paneles legados
                if (vinculo.plataforma === formValues[0].plataforma) {
                    rootUpdates.linkedMasterId = vinculo.matrizId;
                    rootUpdates.accountProfile = vinculo.perfil;
                    rootUpdates.accountEmail = matrizSeleccionada.email;
                    rootUpdates.accountPassword = matrizSeleccionada.pass;
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

window.renderCharts = (totalIncome, totalCost, totalProfit) => {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#ebebf5' : '#1d1d1f';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    // --- 1. DATOS: Curva de Proyección de Renovaciones ---
    const today = new Date(); today.setHours(0,0,0,0);
    let daysLabels = [];
    let renewalsData = [];
    
    for(let i=0; i<14; i++) {
        let d = new Date(today);
        d.setDate(today.getDate() + i);
        daysLabels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
        
        let sum = 0;
        clients.forEach(c => {
            const exp = new Date(c.date);
            exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
            exp.setHours(0,0,0,0);
            if (exp.getTime() === d.getTime()) sum += (c.price || 0) * (c.accountUnits || 1);
        });
        renewalsData.push(sum);
    }

    // --- 2. DATOS: Top Plataformas ---
    let platCounts = {};
    clients.forEach(c => {
        const u = c.accountUnits || 1;
        c.platform.split(', ').forEach(p => { platCounts[p] = (platCounts[p] || 0) + u; });
    });
    const sortedPlats = Object.entries(platCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const platLabels = sortedPlats.length ? sortedPlats.map(x => x[0]) : ['Sin Datos'];
    const platData = sortedPlats.length ? sortedPlats.map(x => x[1]) : [1];

    const commonOptions = {
        chart: { background: 'transparent', toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
        theme: { mode: isDark ? 'dark' : 'light' },
        tooltip: { theme: isDark ? 'dark' : 'light' }
    };

    // --- RENDER 1: Gráfico de Curva Suave (Área) ---
    if(revenueChartInst) revenueChartInst.destroy();
    revenueChartInst = new ApexCharts(document.querySelector("#revenueChart"), {
        ...commonOptions,
        series: [{ name: `Por Cobrar (${globalCurrency})`, data: renewalsData }],
        chart: { type: 'area', height: 250, toolbar: { show: false } },
        colors: ['#0a84ff'],
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [0, 90, 100] } },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: { categories: daysLabels, labels: { style: { colors: textColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { colors: textColor }, formatter: (val) => globalCurrency + val.toFixed(0) } },
        grid: { borderColor: gridColor, strokeDashArray: 4 }
    });
    revenueChartInst.render();

    // --- RENDER 2: Gráfico de Anillo (Donut) ---
    if(platformChartInst) platformChartInst.destroy();
    platformChartInst = new ApexCharts(document.querySelector("#platformChart"), {
        ...commonOptions,
        series: platData,
        labels: platLabels,
        chart: { type: 'donut', height: 260 },
        colors: ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a'],
        plotOptions: { 
            pie: { donut: { size: '72%', labels: { show: true, name: { color: textColor }, value: { color: textColor, fontSize: '20px', fontWeight: 'bold', formatter: (val) => val + " ud" }, total: { show: true, showAlways: true, label: 'Cuentas', color: textColor } } } } 
        },
        dataLabels: { enabled: false },
        stroke: { show: true, colors: [isDark ? '#1c1c1e' : '#ffffff'], width: 2 },
        legend: { position: 'right', labels: { colors: textColor } }
    });
    platformChartInst.render();

    // --- RENDER 3: Embudo Financiero (Barras Horizontales Premium) ---
    if(funnelChartInst) funnelChartInst.destroy();
    funnelChartInst = new ApexCharts(document.querySelector("#funnelChart"), {
        ...commonOptions,
        series: [{ name: 'Monto', data: [totalIncome, totalCost, totalProfit] }],
        chart: { type: 'bar', height: 180, toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 6, horizontal: true, distributed: true, dataLabels: { position: 'bottom' } } },
        colors: ['#0a84ff', '#ff453a', '#30d158'],
        dataLabels: { 
            enabled: true, textAnchor: 'start', 
            style: { colors: ['#fff'], fontSize: '13px', fontWeight: 'bold' }, 
            formatter: function (val, opt) { return opt.w.globals.labels[opt.dataPointIndex] + ": " + globalCurrency + val.toFixed(2); }, 
            offsetX: 10, dropShadow: { enabled: true, top: 1, left: 1, blur: 1, opacity: 0.5 } 
        },
        stroke: { width: 0 },
        xaxis: { categories: ['1. Ingresos Brutos', '2. Inversión Total', '3. Ganancia Neta'], labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { show: false } },
        grid: { show: false }
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
        if(sidebar) sidebar.classList.add('collapsed');
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
    } catch(e) {
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
                <div style="background: var(--mac-bg); padding: 15px; border-radius: 16px; border: 1px solid var(--mac-border); margin-bottom: 15px; text-align: left;">
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
                ${accountsHtml}
                ${diffDays <= 3 ? `<a href="${renewUrl}" target="_blank" class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: white; text-decoration: none; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 14px;"><i class='bx bxl-whatsapp' style="font-size: 20px;"></i> Renovar Servicio</a>` : ''}
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
                if(checked.length) { el.textContent = checked.join(', '); el.classList.add('has-selection'); } 
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
    if(c && c.notes) {
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
        if(menu.id !== menuId) menu.classList.remove('show');
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
