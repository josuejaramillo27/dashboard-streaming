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
const getCurrencyForCountry = (country) => { const dict = { "Perú": "S/", "España": "€", "México": "$" }; return dict[country] || "$"; };
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

window.doLogout = async () => {
    clients = []; currentUser = null; currentUserData = null; document.getElementById('tableBody').innerHTML = ''; showView('authView'); window.showLogin();
    try { await signOut(auth); window.showNotification("Sesión cerrada"); } catch (e) { console.error(e); }
};

onAuthStateChanged(auth, async (user) => {
    // 🛑 Candado de Tienda y Portal (Evita que el Login se superponga a las webs públicas)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tienda') || urlParams.get('portal')) return;

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
                
                // 🔥 MEJORA DE RENDIMIENTO: Guardado asíncrono SIN bloquear la pantalla
                const now = new Date(); let needsUpdate = false;
                if (currentUserData.active === true && currentUserData.activeUntil) { 
                    if (now > new Date(currentUserData.activeUntil)) { currentUserData.active = false; currentUserData.activeUntil = null; needsUpdate = true; } 
                } else if (currentUserData.active === false && currentUserData.suspendedUntil) { 
                    if (now > new Date(currentUserData.suspendedUntil)) { currentUserData.active = true; currentUserData.suspendedUntil = null; needsUpdate = true; } 
                }
                
                if (needsUpdate) { 
                    // NO usar await aquí. Firebase lo envía en segundo plano.
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
    const defaultWelcome = "¡Hola! 👋 Bienvenido.\n\nPara ver nuestro catálogo de streaming y precios actualizados, por favor escribe el comando:\n👉 */servicios*";
    document.getElementById('editWaWelcome').value = currentUserData.waWelcomeMessage || defaultWelcome;

    document.getElementById('editWaMessage').value = currentUserData.waTemplate || defaultMsg; 
    document.getElementById('editWaDeliveryMessage').value = currentUserData.waDeliveryMessage || defaultDelivery; 
    document.getElementById('editWaPayment').value = currentUserData.waPaymentInfo || ''; 
    
    document.getElementById('waModal').style.display = 'flex'; 
};

window.saveWaMessage = async () => { 
    const btn = document.querySelector('#waModal .btn-primary');
    btn.innerText = "Guardando..."; btn.disabled = true;
    try { 
        await updateDoc(doc(db, "users", currentUser.uid), { 
            waTemplate: document.getElementById('editWaMessage').value,
            waDeliveryMessage: document.getElementById('editWaDeliveryMessage').value,
            waWelcomeMessage: document.getElementById('editWaWelcome').value,
            waPaymentInfo: document.getElementById('editWaPayment').value,
        }); 
        
        currentUserData.waTemplate = document.getElementById('editWaMessage').value;
        currentUserData.waDeliveryMessage = document.getElementById('editWaDeliveryMessage').value;
        currentUserData.waPaymentInfo = document.getElementById('editWaPayment').value;
        currentUserData.waWelcomeMessage = document.getElementById('editWaWelcome').value;
        
        window.showNotification("Configuración de WhatsApp guardada."); 
        window.closeModals();
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally {
        btn.innerText = "Guardar Configuración"; btn.disabled = false;
    }
};
window.openProfileModal = () => { 
    document.getElementById('editProfileName').value = currentUserData.name || ''; 
    document.getElementById('editProfileCountry').value = currentUserData.country || ''; 
    document.getElementById('editProfilePhone').value = currentUserData.phone || ''; 
    document.getElementById('editProfileAlias').value = currentUserData.storeAlias || ''; 
    document.getElementById('editReferencesLink').value = currentUserData.referencesLink || '';
    
    const profileModal = document.getElementById('profileModal');
    
    // Aseguramos que se abra correctamente independientemente del CSS del PC
    if (window.innerWidth <= 768) {
        profileModal.style.setProperty('display', 'flex', 'important');
    } else {
        profileModal.style.display = 'flex';
    }
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

        let rawAlias = document.getElementById('editProfileAlias').value;
        let finalAlias = rawAlias.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        let refInput = document.getElementById('editReferencesLink');
        let referencesLink = refInput ? refInput.value.trim() : '';

        await updateDoc(doc(db, "users", currentUser.uid), { 
            name: name, country: country, currency: getCurrencyForCountry(country), 
            phone: phone, logoUrl: logoUrl, bannerUrl: bannerUrl, storeAlias: finalAlias,
            referencesLink: referencesLink
        });
        
        currentUserData.storeAlias = finalAlias; 
        currentUserData.name = name;
        currentUserData.country = country;
        currentUserData.phone = phone;
        currentUserData.logoUrl = logoUrl;
        currentUserData.bannerUrl = bannerUrl;
        currentUserData.referencesLink = referencesLink;
        globalCurrency = getCurrencyForCountry(country);
        currentUserData.currency = globalCurrency;

        // Actualización DOM blindada
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

        window.showNotification("Perfil y Logo guardados."); 
        window.closeModals();
        
        if (document.getElementById('tableBody')) window.renderTable();
        if (document.getElementById('statsPanel')) window.toggleStats(true);
        
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally {
        if(btn) { btn.innerText = "Guardar y Actualizar"; btn.disabled = false; }
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

window.openManageModal = (id, name, isActive) => { currentManageUserId = id; document.getElementById('manageUserName').innerText = name; document.getElementById('manageAction').value = isActive ? "true" : "false"; document.getElementById('manageDuration').value = "permanent"; window.toggleDurationFields(); document.getElementById('adminManageModal').style.display = 'flex'; };
window.toggleDurationFields = () => { document.getElementById('temporaryFields').style.display = document.getElementById('manageDuration').value === 'temporary' ? 'flex' : 'none'; };
window.toggleTempType = () => { document.getElementById('manageDays').style.display = document.getElementById('manageTempType').value === 'days' ? 'block' : 'none'; };
window.saveManageStatus = async () => {
    const action = document.getElementById('manageAction').value === "true", duration = document.getElementById('manageDuration').value;
    let activeUntil = null, suspendedUntil = null;
    if (duration === 'temporary') { const targetDate = new Date(); if (document.getElementById('manageTempType').value === 'hours') { targetDate.setHours(targetDate.getHours() + 3); } else { const days = parseInt(document.getElementById('manageDays').value); if (!days || days <= 0) return window.showNotification("Ingresa días."); targetDate.setDate(targetDate.getDate() + days); } if (action === true) activeUntil = targetDate.toISOString(); else suspendedUntil = targetDate.toISOString(); }
    const btn = document.querySelector('#adminManageModal .btn-primary'); btn.innerText = "Guardando..."; btn.disabled = true;
    try { await updateDoc(doc(db, "users", currentManageUserId), { active: action, activeUntil: activeUntil, suspendedUntil: suspendedUntil }); window.showNotification("Configuración aplicada."); window.closeModals(); loadAdminData(); } catch (e) { window.showNotification("Error: " + e.message); } finally { btn.innerText = "Guardar y Aplicar"; btn.disabled = false; }
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
async function loadAdminData() {
    // 🔥 MEJORA DE RENDIMIENTO: Descargar todas las colecciones al mismo tiempo
    const [qUsers, qSuggestions, qNews] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "suggestions")),
        getDocs(collection(db, "news"))
    ]);

    // 1. Cargar Usuarios
    const tbody = document.getElementById('adminTableBody'); tbody.innerHTML = '';
    qUsers.forEach((d) => {
        const data = d.data(), id = d.id; 
        if(data.role === 'admin') return;
        
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
                <button class="action-btn" style="border: 1px solid var(--mac-border); background: transparent;" onclick="window.openManageModal('${id}', '${data.name}', ${data.active})">⚙️ Estado</button>
                <button class="action-btn" style="border: 1px solid var(--mac-blue); color: var(--mac-blue); background: transparent;" onclick="window.openPlanModal('${id}', '${data.name}', '${data.plan_actual || 'demo'}')">💎 Plan</button>
            </td>`; 
        tbody.appendChild(tr);
    });

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
                // No tocamos la fecha original para que no se altere el orden
            });
            window.showNotification("Noticia actualizada con éxito ✏️");
            window.cancelEditNews(); // Resetea formulario y variables
        } else {
            // MODO CREACIÓN
            await addDoc(collection(db, "news"), { 
                titulo: title, 
                desc: desc, 
                img: imgUrl, 
                fechaIso: new Date().toISOString(),
                isPinned: false
            });
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
            portalCode: generatedPortalCode
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

    // Detectar cuántos meses tiene contratado este cliente
    let mesesARenovar = 1;
    if (c.multiAccounts) {
        const firstPlatform = Object.keys(c.multiAccounts)[0];
        if (c.multiAccounts[firstPlatform].months) mesesARenovar = parseInt(c.multiAccounts[firstPlatform].months);
    } else if (c.accountMonths) {
        mesesARenovar = parseInt(c.accountMonths);
    }

    let [year, month, day] = c.date.split('-');
    let fechaAntigua = new Date(year, month - 1, day);
    
    // Opción 1: Mes a Mes (Día a Día)
    let fechaMesAMes = new Date(fechaAntigua);
    fechaMesAMes.setMonth(fechaMesAMes.getMonth() + mesesARenovar);
    const strMesAMes = `${fechaMesAMes.getFullYear()}-${String(fechaMesAMes.getMonth()+1).padStart(2,'0')}-${String(fechaMesAMes.getDate()).padStart(2,'0')}`; 
    const bonitaMesAMes = fechaMesAMes.toLocaleDateString('es-ES'); 

    // Opción 2: 30 Días Exactos
    let fecha30Dias = new Date(fechaAntigua);
    fecha30Dias.setDate(fecha30Dias.getDate() + (30 * mesesARenovar));
    const str30Dias = `${fecha30Dias.getFullYear()}-${String(fecha30Dias.getMonth()+1).padStart(2,'0')}-${String(fecha30Dias.getDate()).padStart(2,'0')}`;
    const bonita30Dias = fecha30Dias.toLocaleDateString('es-ES');

    const antiguaFechaBonita = fechaAntigua.toLocaleDateString('es-ES');

    Swal.fire({
        title: '🔄 Opciones de Renovación',
        html: `
            <p style="color: var(--mac-text-secondary); font-size: 14px; margin-bottom: 15px;">
                Vencimiento actual: <strong>${antiguaFechaBonita}</strong><br>
                Selecciona la modalidad para sumar <b>${mesesARenovar} mes(es)</b>:
            </p>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="btnRenovarMes" style="background:var(--mac-blue); border:none; color:white; padding:14px; font-size:14px; border-radius:8px; cursor:pointer; font-weight:bold;">
                    📆 De Día a Día (Vence: ${bonitaMesAMes})
                </button>
                <button id="btnRenovar30" style="background:var(--mac-orange); border:none; color:white; padding:14px; font-size:14px; border-radius:8px; cursor:pointer; font-weight:bold;">
                    🔢 30 Días Exactos (Vence: ${bonita30Dias})
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        didOpen: () => {
            // Asignar funciones a los botones personalizados
            document.getElementById('btnRenovarMes').addEventListener('click', () => {
                Swal.close();
                aplicarRenovacionFirebase(id, strMesAMes, bonitaMesAMes, c);
            });
            document.getElementById('btnRenovar30').addEventListener('click', () => {
                Swal.close();
                aplicarRenovacionFirebase(id, str30Dias, bonita30Dias, c);
            });
        }
    });
};

// Función auxiliar para guardar la fecha que el cliente seleccionó
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
            const datosRenovacion = { distribuidorId: currentUser.uid, numeroCliente: c.phone, plataforma: c.platform, nuevaFecha: nuevaFechaBonita };
            fetch('https://bot.panelagc.com/api/confirmar-renovacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datosRenovacion) });
        }
    } catch (error) { 
        window.showNotification("Error: " + error.message); 
    }
};

window.startEdit = (id) => {
    editingClientId = id; 
    const c = clients.find(x => x.id === id);
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
        let notesIcon = c.notes ? `<i class='bx bx-note' title="Nota: ${c.notes}" style="color:var(--mac-orange); cursor:help; margin-left:5px;"></i>` : '';
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
                <span style="color:${c.color || 'var(--mac-text-main)'}; font-weight: 800; font-size: 15px; letter-spacing: 0.5px;">${c.name}</span>${loyatyHtml}${notesIcon}<br>${tagHtml}
            </div>
        </td>
        <td data-label="Plataformas" style="font-weight: 500;">${c.platform}${deviceIndicator}</td>
        <td data-label="Cuenta"><button class="action-btn" style="color:var(--mac-text-main); font-weight:bold; border: 1px solid var(--mac-border);" onclick="window.viewAccountData('${c.id}')"><i class='bx bx-key'></i> Ver Datos</button></td>
        <td data-label="WhatsApp">${c.phone}</td>
        <td data-label="Utilidad (${globalCurrency})"><span style="color:var(--mac-green); font-weight:bold;">+${globalCurrency}${prof.toFixed(2)}</span>${dispUnits}</td>
        <td data-label="Vencimiento">${c.expDate.toLocaleDateString('es-ES')}</td>
        <td data-label="Estado"><span class="status ${c.statusCat}">${stText}</span></td>
        <td data-label="Acciones" class="actions-cell">
            <button class="action-btn btn-wa" onclick="window.sendWA('${c.phone}', '${c.name}', '${c.platform}', '${c.expDate.toLocaleDateString('es-ES')}')"><i class='bx bxl-whatsapp'></i> WA</button>
            <button class="action-btn" style="background: rgba(175, 82, 222, 0.15); color: #AF52DE; font-weight: bold;" onclick="window.downloadTicket('${c.id}', event)"><i class='bx bx-receipt'></i> Recibo</button>
            <button class="action-btn" style="background: rgba(0, 122, 255, 0.15); color: #007AFF; font-weight: bold;" onclick="window.openLinkModal('${c.id}', '${c.platform}')" title="Vincular a Matriz"><i class='bx bx-link'></i></button>
            ${c.statusCat !== 'active' ? `<button class="action-btn btn-renew" onclick="window.renewClient('${c.id}')"><i class='bx bx-refresh'></i></button>` : ''}
            <button class="action-btn" style="color: var(--mac-text-main);" onclick="window.startEdit('${c.id}')"><i class='bx bx-edit-alt'></i></button>
            <button class="action-btn btn-del" onclick="window.deleteClient('${c.id}')"><i class='bx bx-trash'></i></button>
        </td>`;
        tbody.appendChild(tr);
    });
    if(document.getElementById('statsPanel').style.display === 'grid') window.toggleStats(true);
};

window.sendWA = (phone, name, platform, dateStr) => { 
    let num = phone.replace(/[^\d+]/g, ''); 
    let baseMsg = currentUserData.waTemplate || "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*.\nPagos: {pago}";
    let paymentInfo = currentUserData.waPaymentInfo || "(Pregúntame por mis métodos de pago)";
    
    let finalMsg = baseMsg
        .replace(/{nombre}/g, name)
        .replace(/{plataforma}/g, platform)
        .replace(/{fecha}/g, dateStr)
        .replace(/{pago}/g, paymentInfo); 
        
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(finalMsg)}`, '_blank'); 
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
                    console.warn("El usuario canceló el menú de compartir", err);
                }
            } else {
                // Modo PC o Navegadores antiguos (Descarga Directa)
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = fileName;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                window.showNotification("✅ Recibo descargado al instante");
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
            <button class="action-btn btn-wa" style="padding:12px; font-size:14px;" onclick="window.sendWA('${c.phone}', '${safeName}', '${safePlatform}', '${exp.toLocaleDateString('es-ES')}')"><i class='bx bxl-whatsapp'></i> WhatsApp</button>
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
    
    // 🔓 BÁSICO TAMBIÉN ENTRA
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
    }
    document.getElementById('storeModal').style.display = 'flex';
};

// PEGA ESTAS DOS FUNCIONES NUEVAS JUSTO DEBAJO:

window.saveExternalStore = async () => {
    const url = document.getElementById('storeExternalInput').value.trim();
    if (!url) return window.showNotification("Por favor, ingresa un link válido.");
    if (!url.startsWith('http')) return window.showNotification("⚠️ El link debe empezar con http:// o https://");
    
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { externalStoreUrl: url });
        currentUserData.externalStoreUrl = url; // Actualizamos la memoria
        
        document.getElementById('storeExternalInput').value = '';
        window.showNotification("¡Catálogo externo vinculado con éxito! 🔗");
        
        // Recargamos el modal para que se apliquen los cambios visuales
        window.openStoreModal(); 
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    }
};

window.removeExternalStore = async () => {
    try {
        // Borramos el campo en Firebase
        await updateDoc(doc(db, "users", currentUser.uid), { externalStoreUrl: null });
        currentUserData.externalStoreUrl = null; // Limpiamos la memoria
        
        window.showNotification("Catálogo desvinculado. Tiendita interna reactivada 🏪");
        
        // Recargamos el modal
        window.openStoreModal();
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    }
};
window.handleStoreTypeChange = () => {
    const isAutoStock = document.getElementById('storeAutoStock').checked;
    if (isAutoStock) {
        window.toggleStoreStockFields();
    }
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
        listContainer.innerHTML = ''; // Limpiar selectores previos

        if (type === 'Combo') {
            label.innerText = 'Selecciona las plataformas del inventario que integran este Combo:';
            if (addComboBtn) addComboBtn.style.display = 'inline-flex';
            // Para combo, creamos al menos 2 filas de selección por defecto
            window.addStoreStockSelectRow();
            window.addStoreStockSelectRow();
        } else {
            label.innerText = 'Selecciona la plataforma del inventario vinculada a este servicio:';
            if (addComboBtn) addComboBtn.style.display = 'none';
            // Para servicio único, 1 sola fila
            window.addStoreStockSelectRow();
        }
    } else {
        configDiv.style.display = 'none';
        document.getElementById('storeStockPlatformsList').innerHTML = '';
        window.updateStoreStockCount();
    }
};

// 3. Agrega una fila de selector de plataforma al contenedor de stock
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

    // Botón para borrar fila si hay más de 1 selector
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
        countText.innerText = '0 disp.';
        countText.style.color = 'var(--mac-text-secondary)';
        return;
    }

    const stock = currentUserData.inventory || [];
    const type = document.getElementById('storeType') ? document.getElementById('storeType').value : 'Servicio';

    if (type === 'Combo') {
        // En un combo, el stock es el MÍNIMO de todas las plataformas seleccionadas
        const counts = selectedPlatforms.map(plat => stock.filter(i => i.status === 'libre' && i.platform === plat).length);
        const minStock = Math.min(...counts);
        
        countText.innerText = `${minStock} Combos disp.`;
        countText.style.color = minStock > 0 ? 'var(--mac-green)' : 'var(--mac-red)';
    } else {
        // Servicio único: stock de la primera plataforma
        const count = stock.filter(i => i.status === 'libre' && i.platform === selectedPlatforms[0]).length;
        countText.innerText = `${count} disp.`;
        countText.style.color = count > 0 ? 'var(--mac-green)' : 'var(--mac-red)';
    }
};

// 2. GESTIÓN DEL CATÁLOGO INTERNO (Con Combos y Estado Agotado)
window.addStoreItem = async () => {
    const type = document.getElementById('storeType') ? document.getElementById('storeType').value : 'Servicio';
    const plat = document.getElementById('storePlatform').value.trim();
    const price = document.getElementById('storePrice').value;
    const desc = document.getElementById('storeDesc') ? document.getElementById('storeDesc').value.trim() : '';

    const autoStock = document.getElementById('storeAutoStock').checked;
    const badgeOption = document.getElementById('storeBadgeOption').value;

    // Obtenemos todas las plataformas seleccionadas en el formulario
    const selects = document.querySelectorAll('.store-stock-select');
    const stockPlatforms = Array.from(selects).map(s => s.value).filter(val => val !== '');

    if (!plat || !price) return window.showNotification("Completa plataforma y precio");
    if (autoStock && stockPlatforms.length === 0) {
        return window.showNotification("⚠️ Debes seleccionar al menos una plataforma del inventario para conectar el stock.");
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
            desc: desc, 
            imgUrl: imgUrl,
            type: type, 
            autoStock: autoStock, 
            stockPlatforms: stockPlatforms, // Lista de plataformas vinculadas (Array)
            badgeOption: badgeOption,
            status: 'disponible' 
        });

        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;

        // Limpieza del formulario
        document.getElementById('storePlatform').value = '';
        document.getElementById('storePrice').value = '';
        if (document.getElementById('storeDesc')) document.getElementById('storeDesc').value = '';
        if (fileInput) fileInput.value = '';
        document.getElementById('storeAutoStock').checked = false;
        document.getElementById('storeBadgeOption').value = '';
        window.toggleStoreStockFields();

        window.renderStoreItems();
        window.showNotification("✅ Producto añadido al catálogo");
    } catch(e) { 
        window.showNotification("Error: " + e.message); 
    } finally { 
        btn.innerHTML = "<i class='bx bx-plus'></i>"; btn.disabled = false; 
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
        const isAgotado = item.status === 'agotado';
        const statusBadge = isAgotado ? `<span style="background:var(--mac-red); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">AGOTADO</span>` : `<span style="background:var(--mac-green); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">DISPONIBLE</span>`;
        const typeBadge = item.type === 'Combo' ? `<span style="background:var(--mac-orange); color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold; margin-right:5px;"><i class='bx bx-gift'></i> COMBO</span>` : '';

        const div = document.createElement('div');
        div.style.cssText = `display:flex; justify-content:space-between; align-items:center; background:var(--mac-surface); padding:10px; border-radius:8px; border:1px solid var(--mac-border); opacity: ${isAgotado ? '0.7' : '1'};`;
        div.innerHTML = `
            <div style="flex:1; padding-right:10px;">
                ${typeBadge}
                <strong style="color:var(--mac-text-main); font-size:14px;">${item.platform}</strong><br>
                <span style="color:var(--mac-text-secondary); font-size:12px; display:block; margin:4px 0;">${item.desc || ''}</span>
                <span style="color:var(--mac-green); font-size:13px; font-weight:bold;">${globalCurrency}${item.price.toFixed(2)}</span>
                <div style="margin-top: 5px;">${statusBadge}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; min-width: 100px;">
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

    // Abrimos el modal de SweetAlert adaptado a tu modo oscuro/claro
    const { value: formValues } = await Swal.fire({
        title: 'Editar Producto',
        html: `
            <div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary);">Nombre del Servicio/Combo:</label>
                <input id="swal-plat" class="swal2-input" style="margin:0; width: 100%; box-sizing:border-box;" value="${item.platform}">
                
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary); margin-top: 10px;">Precio:</label>
                <input id="swal-price" type="number" step="0.1" class="swal2-input" style="margin:0; width: 100%; box-sizing:border-box;" value="${item.price}">
                
                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary); margin-top: 10px;">Descripción:</label>
                <input id="swal-desc" class="swal2-input" style="margin:0; width: 100%; box-sizing:border-box;" value="${item.desc || ''}">

                <label style="font-size: 12px; font-weight: bold; color: var(--mac-text-secondary); margin-top: 10px;">Cambiar Imagen (Opcional):</label>
                <input type="file" id="swal-img" accept="image/*" style="margin:0; width: 100%; padding: 10px; font-size: 12px; border: 1px solid var(--mac-border); border-radius: 8px; background: var(--mac-bg); color: var(--mac-text-main); box-sizing: border-box;">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#007AFF',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000',
        preConfirm: () => {
            const plat = document.getElementById('swal-plat').value.trim();
            const price = parseFloat(document.getElementById('swal-price').value);
            const desc = document.getElementById('swal-desc').value.trim();
            const fileInput = document.getElementById('swal-img');
            const file = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;

            if (!plat || isNaN(price)) {
                Swal.showValidationMessage('El nombre y el precio son obligatorios');
                return false;
            }

            return { platform: plat, price: price, desc: desc, file: file };
        }
    });

    // Si el usuario le dio a "Guardar Cambios" y no canceló
    if (formValues) {
        let newImgUrl = item.imgUrl || ""; // Mantiene la foto vieja por defecto

        try {
            // Si seleccionó una nueva foto, la subimos primero a Firebase Storage
            if (formValues.file) {
                window.showNotification("⏳ Subiendo nueva imagen...");
                const storageRef = ref(storage, `store_images/${currentUser.uid}_${Date.now()}_${formValues.file.name}`);
                const snapshot = await uploadBytes(storageRef, formValues.file);
                newImgUrl = await getDownloadURL(snapshot.ref);
            }

            // 1. Modificamos el objeto en la memoria local
            catalog[index].platform = formValues.platform;
            catalog[index].price = formValues.price;
            catalog[index].desc = formValues.desc;
            catalog[index].imgUrl = newImgUrl; // Guardamos la foto (nueva o mantenemos la vieja)

            // 2. Lo enviamos a Firebase
            await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
            currentUserData.storeCatalog = catalog;
            
            // 3. Volvemos a dibujar la lista y avisamos
            window.renderStoreItems();
            window.showNotification("✅ Producto editado correctamente");
        } catch(e) {
            window.showNotification("Error al editar: " + e.message);
        }
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
// Funciones auxiliares para controlar el filtrado de categorías en tiempo real
window.filterStore = (type) => {
    // Alterna la clase activa en la interfaz visual de los chips
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes('Combos') && type === 'Combo') btn.classList.add('active');
        else if (btn.textContent.includes('Servicios') && type === 'Servicio') btn.classList.add('active');
        else if (btn.textContent === 'Todos' && type === 'Todos') btn.classList.add('active');
    });
    window.renderPublicCatalog(type);
};

window.renderPublicCatalog = (filterType) => {
    const catalogBox = document.getElementById('publicStoreCatalog');
    if (!catalogBox) return;
    catalogBox.innerHTML = '';
    
    const catalog = window.publicCatalogCache || [];
    const data = window.publicStoreDataCache;
    if (!data) return;

    // Filtrado analítico en base al Chip seleccionado
    const itemsFiltrados = catalog.filter(item => {
        if (filterType === 'Todos') return true;
        return item.type === filterType;
    });

    if (itemsFiltrados.length === 0) {
        catalogBox.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); width: 100%; grid-column: 1/-1; padding: 40px 0; font-weight: 500;">No hay productos disponibles en esta sección por el momento.</p>';
        return;
    }

    itemsFiltrados.forEach(item => {
        const priceStr = `${data.currency || 'S/'}${item.price.toFixed(2)}`;
        let isAgotado = item.status === 'agotado';
        
        // 1. CÁLCULO DE STOCK EN VIVO (SERVICIO ÚNICO O COMBOS MULTI-PLATAFORMA)
let stockHtml = '';
if (item.autoStock && item.stockPlatforms && item.stockPlatforms.length > 0 && data.inventory) {
    const stock = data.inventory || [];

    if (item.type === 'Combo') {
        // Calcula cuántas unidades de cada plataforma hay en stock libre
        const counts = item.stockPlatforms.map(p => stock.filter(i => i.status === 'libre' && i.platform === p).length);
        const comboDisponible = Math.min(...counts); // El combo depende de la menor disponibilidad

        if (comboDisponible === 0) isAgotado = true; // Auto-Agotado

        const colorStock = comboDisponible > 2 ? 'var(--mac-green)' : (comboDisponible > 0 ? 'var(--mac-orange)' : 'var(--mac-red)');
        stockHtml = `<span style="font-size:10px; color:var(--mac-text-secondary); display:block; margin-top:6px; font-weight:bold;"><i class='bx bx-box'></i> Stock Combo: <span style="color:${colorStock};">${comboDisponible} disp.</span></span>`;
    } else {
        // Servicio Único
        const cantidadLibre = stock.filter(i => i.status === 'libre' && i.platform === item.stockPlatforms[0]).length;
        if (cantidadLibre === 0) isAgotado = true;

        const colorStock = cantidadLibre > 2 ? 'var(--mac-green)' : (cantidadLibre > 0 ? 'var(--mac-orange)' : 'var(--mac-red)');
        stockHtml = `<span style="font-size:10px; color:var(--mac-text-secondary); display:block; margin-top:6px; font-weight:bold;"><i class='bx bx-box'></i> Stock en vivo: <span style="color:${colorStock};">${cantidadLibre} disp.</span></span>`;
    }
}

// 2. ETIQUETAS Y EMOJIS DE TIENDA
let typeBadgeHtml = item.type === 'Combo' ? `<div class="store-vibrant-badge badge-combo"><i class='bx bx-gift'></i> Combo</div>` : '';

if (item.badgeOption) {
    if (item.badgeOption === 'oferta') {
        typeBadgeHtml = `<div class="store-vibrant-badge badge-oferta"><i class='bx bxs-flame'></i> Oferta Especial</div>`;
    } else if (item.badgeOption === 'poco_stock') {
        typeBadgeHtml = `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #FF9500 0%, #FF5E00 100%);"><i class='bx bx-error-alt'></i> Poco Stock</div>`;
    } else if (item.badgeOption === 'tiempo_limitado') {
        typeBadgeHtml = `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #AF52DE 0%, #5856D6 100%);"><i class='bx bxs-time-five'></i> Tiempo Limitado</div>`;
    } else if (item.badgeOption === 'nuevo') {
        typeBadgeHtml = `<div class="store-vibrant-badge badge-oferta" style="background: linear-gradient(135deg, #34C759 0%, #28CD41 100%);"><i class='bx bxs-star'></i> Nuevo Ingreso</div>`;
    }
}
        const numLimpio = data.phone.replace(/[^\d+]/g, '');
        const msg = encodeURIComponent(`/comprar ${item.platform.toLowerCase()}`);
        const waLink = `https://wa.me/${numLimpio}?text=${msg}`;

        const titleSafe = item.platform.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const descSafe = item.desc ? item.desc.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n') : 'Sin detalles adicionales.';

        const imgHTML = item.imgUrl ? `<img src="${item.imgUrl}" alt="${item.platform}">` : `<div style="width:100%; height:100%; background:var(--mac-gray); display:flex; align-items:center; justify-content:center;"><i class='bx bx-play-circle' style='font-size:48px; color:var(--mac-text-secondary); opacity:0.3;'></i></div>`;

        let btnHTML = isAgotado ? `<span class="status expired" style="padding:10px 16px; border-radius:20px; font-weight:800; font-size:13px; text-transform:none; letter-spacing:0;">Agotado</span>` : `<a href="${waLink}" target="_blank" class="btn-wa" style="text-decoration:none; padding:10px 18px; border-radius:20px; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:4px; margin:0;"><i class='bx bxl-whatsapp' style='font-size:16px;'></i> Comprar</a>`;

        const card = document.createElement('div');
        card.className = `store-product-card ${isAgotado ? 'is-agotado' : ''}`;
        card.innerHTML = `
            ${typeBadgeHtml}
            <div class="store-product-visual" onclick="window.openProductDesc('${titleSafe}', '${descSafe}')">
                ${imgHTML}
                <div class="store-product-visual-overlay"><span class="view-desc-hint"><i class='bx bx-zoom-in'></i> Detalles</span></div>
            </div>
            <div class="store-product-glass-footer">
                <div class="store-product-info">
                    <strong class="store-product-title">${item.platform}</strong>
                    <span class="store-product-price">${priceStr}</span>
                    ${stockHtml} <!-- AQUÍ SE INYECTA EL STOCK EN VIVO -->
                </div>
                <div class="store-product-action">${btnHTML}</div>
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
            
            if (!snap.empty) { data = snap.docs[0].data(); } 
            else {
                const docRef = await getDoc(doc(db, "users", storeId));
                if (docRef.exists()) data = docRef.data();
            }

            if (!data) {
                document.getElementById('publicStoreName').innerText = "Tienda no encontrada";
                return;
            }
            
            const plan = data.plan_actual || 'demo';
            if ((plan !== 'pro' && plan !== 'elite') || data.active === false) {
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

            // Activamos la barra de chips y el botón de soporte flotante vinculando el número de WhatsApp
            const filtersEl = document.getElementById('publicStoreFilters');
            if (filtersEl && window.publicCatalogCache.length > 0) filtersEl.style.display = 'flex';

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

            // Primer renderizado general automático
            window.renderPublicCatalog('Todos');

        } catch (e) {
            console.error("Error cargando la tienda pública:", e);
        }
    }
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
            list.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary); margin-top:20px;">No tienes ventas pendientes de aprobar.</p>';
            return;
        }

        list.innerHTML = '';
        const inventarioLimpio = (currentUserData.inventory || []).filter(i => i.status === 'libre');

        // Guardamos las opciones globalmente para poder clonarlas en los combos
        window.opcionesCuentasGlobal = `<option value="">-- Selecciona una cuenta para entregar --</option>`;
        inventarioLimpio.forEach(acc => {
            window.opcionesCuentasGlobal += `<option value="${acc.id}">[${acc.platform} - ${acc.type}] ${acc.email} ${acc.type === 'Perfil' ? '(P: '+acc.profile+')' : ''}</option>`;
        });

        snapshot.forEach(docSnap => {
            const pedido = docSnap.data();
            const pId = docSnap.id;

            const div = document.createElement('div');
            div.style.cssText = "background:var(--mac-bg); padding:15px; border-radius:10px; border:1px solid var(--mac-border);";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div>
                        <strong style="color:var(--mac-blue); font-size:15px;">Comprobante Recibido</strong><br>
                        <span style="color:var(--mac-text-main); font-size:13px;">📞 Número: ${pedido.clienteNumero}</span>
                        <span style="display:block; font-size:11px; color:var(--mac-text-secondary);">Tipo: ${pedido.tipo.toUpperCase()}</span>
                    </div>
                    <button class="action-btn btn-del" onclick="window.rechazarPedido('${pId}')" title="Rechazar"><i class='bx bx-x'></i></button>
                </div>
                
                <div id="cuentas_container_${pId}">
                    <select class="select_acc_${pId}" style="width:100%; margin-bottom:5px; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border);">
                        ${window.opcionesCuentasGlobal}
                    </select>
                </div>
                
                <button class="action-btn" style="color:var(--mac-blue); font-size:12px; margin-bottom:10px; font-weight:bold; background:transparent; border:none; padding:0; cursor:pointer;" onclick="window.addSelectToPedido('${pId}')">
                    + Añadir otra cuenta (Combos)
                </button>
                
                <div style="margin-bottom:10px;">
                    <input type="number" id="precio_venta_${pId}" placeholder="Precio Total Cobrado (Ej: 30.00)" style="width:100%; padding:8px; border-radius:6px; background:var(--mac-surface); color:var(--mac-text-main); border:1px solid var(--mac-border);">
                </div>

                <button class="btn-primary" style="width:100%; background:var(--mac-green); border:none;" onclick="window.aprobarVenta('${pId}', '${pedido.clienteNumero}')">
                    <i class='bx bx-check-circle'></i> Aprobar y Enviar WhatsApp
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
window.aprobarVenta = async (pedidoId, numeroCliente) => {
    const selects = document.querySelectorAll(`.select_acc_${pedidoId}`);
    const cuentasIds = Array.from(selects).map(s => s.value).filter(val => val !== "");
    
    if (cuentasIds.length === 0) return window.showNotification("⚠️ Debes seleccionar al menos una cuenta del inventario para entregar.");
    
    const precioTotal = parseFloat(document.getElementById(`precio_venta_${pedidoId}`).value) || 0;
    const precioDividido = precioTotal / cuentasIds.length;

   const confirmacion = await Swal.fire({
        title: '¿Confirmar Entrega?',
        text: `Se enviarán ${cuentasIds.length} cuenta(s) al cliente por WhatsApp.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="bx bx-send"></i> Sí, Aprobar y Enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#34C759',
        cancelButtonColor: '#FF3B30',
        background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
    });

    if (!confirmacion.isConfirmed) return;

    try {
        window.showNotification("⏳ Procesando entrega...");

        let stock = currentUserData.inventory || [];
        let cuentasEntregar = [];
        const h = new Date(); 
        h.setMonth(h.getMonth() + 1); 
        const dateFirebase = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`; 
        const dateWhatsApp = h.toLocaleDateString('es-ES'); 
        const numeroBonito = "+" + numeroCliente.split('@')[0].split(':')[0];
        const rulesDB = currentUserData.platformRules || {};

        // Validamos que todas existan
        for (let id of cuentasIds) {
            const acc = stock.find(c => c.id === id);
            if (!acc) return window.showNotification("Error: Una de las cuentas ya no está en el inventario.");
            cuentasEntregar.push(acc);
        }

        // Bucle de creación (Separación Inteligente para la Matriz)
        for (let cuenta of cuentasEntregar) {
            let matrizAsignada = null;
            const qMatriz = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid), where("email", "==", cuenta.email));
            const snapMatriz = await getDocs(qMatriz);
            if (!snapMatriz.empty) matrizAsignada = snapMatriz.docs[0].id;

            await addDoc(collection(db, "clients"), {
                userId: currentUser.uid,
                name: "Cliente Nuevo", 
                phone: numeroBonito, 
                platform: cuenta.platform,
                accountEmail: cuenta.email,      
                accountPassword: cuenta.pass,    
                accountPin: cuenta.pin,          
                accountProfile: cuenta.profile || "1",
                accountUnits: 1,
                cost: 0,
                price: precioDividido, 
                date: dateFirebase,
                linkedMasterId: matrizAsignada, 
                color: macPalette[Math.floor(Math.random() * macPalette.length)]
            });

            cuenta.rules = rulesDB[cuenta.platform] || "Uso personal, no modificar los datos de acceso.";
            stock = stock.map(item => item.id === cuenta.id ? { ...item, status: 'vendida' } : item);
        }

        await updateDoc(doc(db, "users", currentUser.uid), { inventory: stock });
        currentUserData.inventory = stock;
        await updateDoc(doc(db, "pedidos", pedidoId), { estado: "aprobado" });

        // EL DISPARO AL BOT (Cuentas Agrupadas)
        const payloadEntrega = {
            distribuidorId: currentUser.uid,
            numeroCliente: numeroCliente, 
            cuentas: cuentasEntregar, 
            fechaVencimiento: dateWhatsApp,
            mensajeEntrega: currentUserData.waDeliveryMessage || "" 
        };

        fetch('https://bot.panelagc.com/api/entregar-cuenta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadEntrega)
        }).then(res => console.log("Señal de entrega procesada por el servidor"))
          .catch(err => console.error("Error de red al contactar al bot:", err));

        window.showNotification("✅ ¡Entrega completada con éxito!");
        window.renderInventory(); 
        loadUserClients(); 
        window.openPedidosModal(); 

    } catch (e) {
        console.error(e);
        window.showNotification("Error: " + e.message);
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

// 4. GUARDAR (CREAR O ACTUALIZAR) Y SINCRONIZAR
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
        if (!editingMasterId) {
            const plan = currentUserData.plan_actual || 'demo';
            const qMatCount = query(collection(db, "masterAccounts"), where("userId", "==", currentUser.uid));
            const snapMatCount = await getDocs(qMatCount);
            if (snapMatCount.size >= 20 && plan === 'basico') {
                return window.showNotification("⚠️ El Plan Básico te permite hasta 20 Cuentas Matrices. Actualiza a PRO para ilimitadas.");
            }
        }

        if (editingMasterId) {
            // Actualizamos la matriz
            await updateDoc(doc(db, "masterAccounts", editingMasterId), { platform, email, pass, maxProfiles, cost, provider, expiryDate, providerName });
            window.showNotification("✅ Cuenta Matriz actualizada");

            // --- INICIO NUEVA LÓGICA: Sincronizar clientes vinculados ---
            const qCli = query(collection(db, "clients"), where("userId", "==", currentUser.uid));
            const snapCli = await getDocs(qCli);
            const updatePromises = [];
            
            snapCli.forEach(d => {
                const c = d.data();
                let needsUpdate = false;
                let mAccounts = c.multiAccounts || {};
                let rootUpdates = {};
                
                // Actualizar si usaba el sistema antiguo de enlace
                if (c.linkedMasterId === editingMasterId) {
                    rootUpdates.accountEmail = email;
                    rootUpdates.accountPassword = pass;
                    needsUpdate = true;
                }
                
                // Actualizar si usa el sistema nuevo (multipestaña)
                if (c.multiAccounts) {
                    for (let platKey in mAccounts) {
                        if (mAccounts[platKey].masterAccountId === editingMasterId) {
                            mAccounts[platKey].email = email;
                            mAccounts[platKey].password = pass;
                            needsUpdate = true;
                        }
                    }
                }
                
                // Si este cliente pertenece a la matriz, preparamos la actualización
                if (needsUpdate) {
                    let finalUpdate = { ...rootUpdates };
                    if (c.multiAccounts) finalUpdate.multiAccounts = mAccounts;
                    updatePromises.push(updateDoc(doc(db, "clients", d.id), finalUpdate));
                }
            });
            
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                if (typeof loadUserClients === 'function') loadUserClients(); // Recarga la tabla de clientes para que veas el cambio
            }
            // --- FIN NUEVA LÓGICA ---

        } else {
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
                // NUEVA LÓGICA MULTI-PLATAFORMA
                const clienteEnPerfil = clientesDeEstaCuenta.find(c => {
                    let pName = null;
                    if (c.multiAccounts) {
                        // Buscamos específicamente la plataforma de ESTA matriz
                        const linkedAcc = Object.values(c.multiAccounts).find(a => a.masterAccountId === accId || c.linkedMasterId === accId);
                        if (linkedAcc) pName = linkedAcc.profile;
                    } else {
                        pName = c.accountProfile;
                    }
                    if (!pName) return false;
                    
                    const numeroEncontrado = String(pName).match(/\d+/); 
                    return numeroEncontrado && parseInt(numeroEncontrado[0]) === i;
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
/* ==========================================================================
   PORTAL DE AUTOGESTIÓN DEL CLIENTE (ETAPA 2 - 100% BLINDADA)
   ========================================================================== */
let portalStoreData = null;
let portalMatchedClients = [];

window.checkClientPortal = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const portalAlias = urlParams.get('portal');
    
    if (!portalAlias) return false;

    // Ocultamos todos los paneles
    document.getElementById('authView').style.display = 'none';
    document.getElementById('appView').style.display = 'none';
    document.getElementById('adminView').style.display = 'none';
    if (document.getElementById('publicStoreView')) document.getElementById('publicStoreView').style.display = 'none';
    
    // Encendemos el Portal del Cliente con prioridad máxima
    const portalView = document.getElementById('clientPortalView');
    if (portalView) portalView.style.display = 'flex';

    try {
        // Buscamos a qué distribuidor le pertenece este link
        const q = query(collection(db, "users"), where("storeAlias", "==", portalAlias));
        const snap = await getDocs(q);
        
        if (!snap.empty) { 
            portalStoreData = snap.docs[0].data(); 
            portalStoreData.uid = snap.docs[0].id;
        } else {
            const docRef = await getDoc(doc(db, "users", portalAlias));
            if (docRef.exists()) {
                portalStoreData = docRef.data();
                portalStoreData.uid = portalAlias;
            }
        }

        if (!portalStoreData) {
            document.getElementById('portalStoreName').innerText = "Portal no encontrado";
            return false;
        }

        // 🎨 Actualizar la Interfaz Visual con los datos de TU TIENDA
        document.getElementById('portalStoreName').innerText = portalStoreData.name || "Mi Portal";
        if (portalStoreData.logoUrl) {
            const logo = document.getElementById('portalLogo');
            logo.src = portalStoreData.logoUrl;
            logo.style.display = 'block';
        }

        // Configuramos el botón de soporte de forma súper segura
        if (portalStoreData.phone) {
            const numLimpio = String(portalStoreData.phone).replace(/[^\d+]/g, '');
            const supportBtn = document.getElementById('portalSupportBtn');
            if (supportBtn) supportBtn.href = `https://wa.me/${numLimpio}?text=${encodeURIComponent('Hola, necesito ayuda con mis servicios del portal.')}`;
        }

        // 🪄 MAGIA: Verificamos si el cliente le dio a "Recordar Sesión" antes
        const savedPhone = localStorage.getItem(`portal_phone_${portalStoreData.uid}`);
        const savedCode = localStorage.getItem(`portal_code_${portalStoreData.uid}`);
        
        if (savedPhone && savedCode) {
            document.getElementById('portalPhoneInput').value = savedPhone;
            document.getElementById('portalCodeInput').value = savedCode;
            window.loginClientPortal(); // Hacemos login automático
        }
        return true;
    } catch (e) {
        console.error("Error cargando portal:", e);
        return false;
    }
};

window.loginClientPortal = async () => {
    let phone = document.getElementById('portalPhoneInput').value.trim();
    const code = document.getElementById('portalCodeInput').value.trim().toUpperCase();
    const remember = document.getElementById('portalRememberMe').checked;

    if (!phone || !code) return window.showNotification("Ingresa tu teléfono y el código de 4 dígitos.");

    // 🛡️ RE-VALIDACIÓN FORZADA
    if (!portalStoreData || !portalStoreData.uid) {
        const cargado = await window.checkClientPortal();
        if (!cargado) return window.showNotification("⚠️ Error de conexión. Revisa el link que te dio tu proveedor.");
    }

    // Doble candado por si acaso
    if (!portalStoreData || !portalStoreData.uid) return window.showNotification("No se pudo conectar a la base de datos.");

    const btn = document.querySelector('#portalLoginScreen .btn-primary');
    const origText = btn.innerText;
    btn.innerText = "Buscando... ⏳";
    btn.disabled = true;

    try {
        // Traemos todos los clientes de este distribuidor para filtrarlos en memoria (Seguridad Antifallos)
        const q = query(collection(db, "clients"), where("userId", "==", portalStoreData.uid));
        const snap = await getDocs(q);

        portalMatchedClients = [];
        
        // 🧹 Limpiamos el número que escribió el cliente para que sea 100% compatible
        const cleanInputPhone = String(phone).replace(/[^\d]/g, '');

        snap.forEach(d => {
            const c = d.data();
            const cleanDbPhone = c.phone ? String(c.phone).replace(/[^\d]/g, '') : '';
            
            if (c.portalCode === code && (cleanDbPhone === cleanInputPhone || cleanDbPhone.endsWith(cleanInputPhone))) {
                if (c.multiAccounts) {
                    // Desarmamos las pestañas y las convertimos en tarjetas independientes para el portal
                    Object.entries(c.multiAccounts).forEach(([platName, accData]) => {
                        portalMatchedClients.push({ 
                            id: d.id + '_' + platName, date: c.date, platform: platName, 
                            accountEmail: accData.email, accountPassword: accData.password, 
                            accountProfile: accData.profile, accountPin: accData.pin, accountSaleType: accData.saleType 
                        });
                    });
                } else {
                    c.platform.split(', ').forEach(platName => {
                        portalMatchedClients.push({ ...c, platform: platName });
                    });
                }
            }
        });

        if (portalMatchedClients.length === 0) {
            window.showNotification("Datos incorrectos. Revisa tu número o pide tu código de acceso.");
            btn.innerText = origText; btn.disabled = false;
            return;
        }

        // Guardar o borrar sesión
        if (remember) {
            localStorage.setItem(`portal_phone_${portalStoreData.uid}`, phone);
            localStorage.setItem(`portal_code_${portalStoreData.uid}`, code);
        } else {
            localStorage.removeItem(`portal_phone_${portalStoreData.uid}`);
            localStorage.removeItem(`portal_code_${portalStoreData.uid}`);
        }

        // Cambiamos a la pantalla de servicios
        document.getElementById('portalLoginScreen').style.display = 'none';
        document.getElementById('portalDashboardScreen').style.display = 'block';
        
        renderClientPortalDashboard();

    } catch (e) {
        window.showNotification("Error: " + e.message);
    } finally {
        btn.innerText = origText; btn.disabled = false;
    }
};

const renderClientPortalDashboard = () => {
    const list = document.getElementById('portalServicesList');
    list.innerHTML = '';

    const today = new Date(); today.setHours(0,0,0,0);
    const storePhone = portalStoreData.phone ? String(portalStoreData.phone).replace(/[^\d+]/g, '') : '';

    portalMatchedClients.forEach((c, index) => {
        const exp = new Date(c.date);
        exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
        exp.setHours(0,0,0,0);
        const diffDays = Math.ceil((exp - today) / 86400000);
        
        const isExpired = diffDays < 0;
        const isWarning = diffDays >= 0 && diffDays <= 3;
        
        let statusBadge = '';
        let borderStyle = '1px solid #38383a';
        
        if (isExpired) {
            statusBadge = `<span style="background: rgba(255, 59, 48, 0.15); color: #ff3b30; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 59, 48, 0.3);">🔴 VENCIDO</span>`;
            borderStyle = '1px solid #ff3b30';
        } else if (isWarning) {
            statusBadge = `<span style="background: rgba(255, 149, 0, 0.15); color: #ff9f0a; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: bold; border: 1px solid rgba(255, 149, 0, 0.3);">🟠 VENCE EN ${diffDays} DÍAS</span>`;
            borderStyle = '1px solid #ff9f0a';
        } else {
            statusBadge = `<span style="background: rgba(52, 199, 89, 0.15); color: #30d158; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: bold; border: 1px solid rgba(52, 199, 89, 0.3);">🟢 ACTIVO</span>`;
        }

        const saleTypeBadge = c.accountSaleType === 'Completa' 
            ? `<span style="background: #ff9f0a; color: #000; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: bold;"><i class='bx bxs-star'></i> COMPLETA</span>`
            : `<span style="background: #0a84ff; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: bold;"><i class='bx bxs-user'></i> PERFIL</span>`;

        // 🔒 LÓGICA DE SEGURIDAD: Censurar contraseñas si venció
        const displayPass = isExpired ? '••••••••' : (c.accountPassword || '-');
        const displayPin = isExpired ? '•••' : (c.accountPin || '-');

        let actionButton = '';
        if (isExpired) {
            const msg = encodeURIComponent(`Hola, quiero renovar mi servicio de ${c.platform}.`);
            actionButton = `<a href="https://wa.me/${storePhone}?text=${msg}" target="_blank" style="background: #ff3b30; color: #ffffff; text-decoration: none; padding: 10px 15px; border-radius: 8px; font-size: 13px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%;"><i class='bx bx-refresh'></i> Renovar Ahora</a>`;
        } else {
            actionButton = `<button style="background: #1c1c1e; color: #ffffff; border: 1px solid #38383a; padding: 10px 15px; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; transition: 0.2s;" onclick="window.copyPortalData(${index})"><i class='bx bx-copy'></i> Copiar Credenciales</button>`;
        }

        const div = document.createElement('div');
        div.style.cssText = `background: #0a0a0c; border: ${borderStyle}; border-radius: 16px; padding: 20px; position: relative;`;
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #ffffff;">${c.platform}</h3>
                    ${saleTypeBadge}
                </div>
                ${statusBadge}
            </div>

            <div style="background: #1c1c1e; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 0 0 5px 0; font-size: 13px; color: #86868b;"><i class='bx bx-envelope'></i> Correo: <span style="color: #ffffff; user-select: all;">${c.accountEmail || '-'}</span></p>
                <p style="margin: 0 0 5px 0; font-size: 13px; color: #86868b;"><i class='bx bx-lock-alt'></i> Clave: <span style="color: #ffffff; user-select: all;">${displayPass}</span></p>
                <div style="display: flex; gap: 15px; margin-top: 5px;">
                    <p style="margin: 0; font-size: 13px; color: #86868b;"><i class='bx bx-user-circle'></i> N° Perfil: <span style="color: #ffffff;">${c.accountProfile || '-'}</span></p>
                    <p style="margin: 0; font-size: 13px; color: #86868b;"><i class='bx bx-pin'></i> PIN: <span style="color: #ffffff;">${displayPin}</span></p>
                </div>
            </div>

            ${actionButton}
        `;
        list.appendChild(div);
    });
};

window.copyPortalData = (idx) => {
    const c = portalMatchedClients[idx];
    const text = `Mis accesos de ${c.platform}:\n📧 Correo: ${c.accountEmail}\n🔑 Clave: ${c.accountPassword}\n👤 Perfil: ${c.accountProfile}\n📌 PIN: ${c.accountPin}`;
    navigator.clipboard.writeText(text).then(() => {
        window.showNotification("Credenciales copiadas 📋");
    });
};

window.logoutClientPortal = () => {
    if(portalStoreData) {
        localStorage.removeItem(`portal_phone_${portalStoreData.uid}`);
        localStorage.removeItem(`portal_code_${portalStoreData.uid}`);
    }
    portalMatchedClients = [];
    document.getElementById('portalPhoneInput').value = '';
    document.getElementById('portalCodeInput').value = '';
    document.getElementById('portalRememberMe').checked = false;
    
    document.getElementById('portalDashboardScreen').style.display = 'none';
    document.getElementById('portalLoginScreen').style.display = 'block';
};

// 🔥 DETONADORES PRINCIPALES (Ejecutan el código al entrar al link automáticamente)
document.addEventListener('DOMContentLoaded', () => { window.checkClientPortal(); });
window.checkClientPortal();

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

// Modificamos el perfil para que pinte los chips al entrar
window.openProfileModal = () => { 
    document.getElementById('editProfileName').value = currentUserData.name || ''; 
    document.getElementById('editProfileCountry').value = currentUserData.country || ''; 
    document.getElementById('editProfilePhone').value = currentUserData.phone || ''; 
    document.getElementById('editProfileAlias').value = currentUserData.storeAlias || ''; 
    document.getElementById('editReferencesLink').value = currentUserData.referencesLink || '';
    if (typeof window.renderCustomServicesChips === 'function') window.renderCustomServicesChips();
};
