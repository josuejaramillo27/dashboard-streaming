import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, setDoc, getDoc, limit, startAfter, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
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
let tempAccountData = { email: '', password: '', profile: '', pin: '', units: 1 };
let globalCurrency = "S/";
let lastVisibleDoc = null; 

const macPalette = ['#FF2D55', '#5856D6', '#FF9500', '#34C759', '#007AFF', '#AF52DE', '#FF3B30', '#FFCC00', '#5AC8FA'];
const getCurrencyForCountry = (country) => { const dict = { "Perú": "S/", "España": "€", "México": "$" }; return dict[country] || "$"; };

window.showNotification = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 5000); }
function showView(viewId) { 
    document.getElementById('authView').style.display = 'none'; 
    document.getElementById('appView').style.display = 'none'; 
    document.getElementById('adminView').style.display = 'none'; 
    document.getElementById(viewId).style.display = 'block'; 
    
    // 🔒 CANDADO: Le avisa al sistema si ya entramos al panel
    if (viewId === 'appView') {
        document.body.classList.add('logged-in');
    } else {
        document.body.classList.remove('logged-in');
    }
    
    // CANDADO DE SEGURIDAD PARA LA BARRA INFERIOR
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        // Solo se muestra si estamos en el panel de clientes Y es un celular
        if (viewId === 'appView' && window.innerWidth <= 768) {
            bottomNav.style.display = 'flex';
        } else {
            bottomNav.style.display = 'none'; // Se oculta en Login y Panel Admin
        }
    }
}
    
    // CANDADO DE SEGURIDAD PARA LA BARRA INFERIOR
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        // Solo se muestra si estamos en el panel de clientes Y es un celular
        if (viewId === 'appView' && window.innerWidth <= 768) {
            bottomNav.style.display = 'flex';
        } else {
            bottomNav.style.display = 'none'; // Se oculta en Login y Panel Admin
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
    const name = document.getElementById('regName').value, phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value, password = document.getElementById('regPassword').value;
    const country = document.getElementById('regCountry').value;
    
    if(!name || !email || !password || !country || !phone) return window.showNotification("Llena todos los campos");
    if(!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país (Ej: +51...)");
    
    const currency = getCurrencyForCountry(country);
    const btn = document.querySelector('#registerForm .btn-primary'); 
    const orig = btn.innerText; 
    btn.innerText = "Creando... ⏳"; 
    btn.disabled = true;
    
    try {
        // 1. Crea el usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // 2. Calculamos las fechas para la Demo (3 días)
        const fechaActual = new Date();
        const fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaActual.getDate() + 3);

        // 3. Asignación de Roles por defecto
        let role = 'distribuidor'; 
        let plan = 'demo';
        let limite = 20;
        let active = true; // Lo dejamos activo para que puedan usar la demo de inmediato
        
        // Mantengo tu regla para hacerte admin automáticamente con ese correo
        if (email.toLowerCase() === 'admin@akaza.com') { 
            role = 'admin'; 
            plan = 'elite'; 
            limite = 9999;
        }

        // 4. Guardamos el perfil en la colección "users" (tu BD usa "users" en vez de "distribuidores")
        await setDoc(doc(db, "users", user.uid), { 
            name: name, 
            phone: phone, 
            email: email, 
            country: country, 
            currency: currency, 
            role: role, 
            active: active, 
            plan_actual: plan,
            limite_clientes: limite,
            createdAt: fechaActual.toISOString(),
            vencimiento_plan: fechaVencimiento.toISOString(),
            suspendedUntil: null 
        });

        window.showNotification("¡Cuenta creada con éxito! Disfruta tu prueba gratuita.");
        // Firebase Auth detectará el inicio de sesión y la función onAuthStateChanged hará el resto
        
    } catch (e) { 
        window.showNotification("Error Reg: " + e.message); 
        btn.innerText = orig; 
        btn.disabled = false; 
    }
};

window.doLogin = async () => {
    const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
    if(!email || !password) return window.showNotification("Ingresa tus datos");
    const btn = document.querySelector('#loginForm .btn-primary'); const orig = btn.innerText; btn.innerText = "Iniciando... ⏳"; btn.disabled = true;
    try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { window.showNotification("Error Login: " + e.message); btn.innerText = orig; btn.disabled = false; }
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
    // 🛑 NUEVO CANDADO: Si el link es una tienda, detenemos el login
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tienda')) return;
    try {
        if (user) {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                currentUserData = docSnap.data(); currentUser = user;
                globalCurrency = currentUserData.currency || "S/";

                if(document.getElementById('brandName')) document.getElementById('brandName').innerText = currentUserData.name || 'Mi Panel';
               // --- LÓGICA DEL BADGE DE PLAN (NUEVO) ---
                const planBadge = document.getElementById('userPlanBadge');
                if (planBadge && currentUserData.role !== 'admin') {
                    const planActual = (currentUserData.plan_actual || 'demo').toLowerCase();
                    planBadge.style.display = 'inline-block';
                    planBadge.innerText = `Plan ${planActual}`;
                    
                    // Asignación de colores
                    if (planActual === 'pro' || planActual === 'elite') {
                        planBadge.style.color = '#FFD700'; // Dorado Premium
                        planBadge.style.backgroundColor = 'rgba(255, 215, 0, 0.1)';
                    } else if (planActual === 'basico') {
                        planBadge.style.color = 'var(--mac-green)'; // Verde
                        planBadge.style.backgroundColor = 'rgba(52, 199, 89, 0.1)';
                    } else {
                        planBadge.style.color = 'var(--mac-text-secondary)'; // Gris para Demo
                        planBadge.style.backgroundColor = 'rgba(152, 152, 157, 0.1)';
                    }
                } else if (planBadge) {
                    planBadge.style.display = 'none'; // Lo ocultamos para ti (Súper Admin)
                }
                if(currentUserData.logoUrl && document.getElementById('brandLogo')) {
                    document.getElementById('brandLogo').src = currentUserData.logoUrl;
                    document.getElementById('brandLogo').style.display = 'block';
                }

                if(document.getElementById('clientCost')) document.getElementById('clientCost').placeholder = `Costo Proveedor (${globalCurrency})`;
                if(document.getElementById('clientPrice')) document.getElementById('clientPrice').placeholder = `Precio de Venta (${globalCurrency})`;
                
                const now = new Date(); let needsUpdate = false;
                if (currentUserData.active === true && currentUserData.activeUntil) { if (now > new Date(currentUserData.activeUntil)) { currentUserData.active = false; currentUserData.activeUntil = null; needsUpdate = true; } } 
                else if (currentUserData.active === false && currentUserData.suspendedUntil) { if (now > new Date(currentUserData.suspendedUntil)) { currentUserData.active = true; currentUserData.suspendedUntil = null; needsUpdate = true; } }
                if (needsUpdate) { await updateDoc(doc(db, "users", user.uid), { active: currentUserData.active, activeUntil: currentUserData.activeUntil || null, suspendedUntil: currentUserData.suspendedUntil || null }); }
                
                const loginBtn = document.querySelector('#loginForm .btn-primary'); if (loginBtn) { loginBtn.innerText = "Ingresar"; loginBtn.disabled = false; }
                
                if (currentUserData.role === 'admin') { 
                    showView('adminView'); loadAdminData(); 
                    window.requestNotificationPermission(); // Pide permiso al admin
                } 
                else { 
                    if (currentUserData.active === true) { 
                        showView('appView'); 
                        if(document.getElementById('userGreeting')) document.getElementById('userGreeting').innerText = `Gestión de clientes`; 
                        loadUserClients();
                       window.checkNewNews();
                        window.requestNotificationPermission(); // Pide permiso al distribuidor
                    } 
                    else { await signOut(auth); window.showNotification("Tu cuenta está suspendida o pendiente."); showView('authView'); } 
                }
            } else { await signOut(auth); showView('authView'); }
        } else { currentUser = null; currentUserData = null; showView('authView'); window.showLogin(); }
    } catch (e) { 
        console.error(e); 
        window.showNotification("ERROR DB: " + e.message); 
        showView('authView'); 
    }
});

window.closeModals = () => { 
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); 
    
    // Devolver el foco al botón de Clientes en el menú inferior
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btnClientes = document.getElementById('navClientes');
    if(btnClientes) btnClientes.classList.add('active');
};

/* --- CONFIGURACIÓN DE WHATSAPP Y PAGOS --- */
window.openWaModal = () => { 
    const defaultMsg = "¡Hola, *{nombre}*! Tu servicio de *{plataforma}* vence el *{fecha}*. Para renovar, usa estos datos:\n\n{pago}"; 
    document.getElementById('editWaMessage').value = currentUserData.waTemplate || defaultMsg; 
    document.getElementById('editWaPayment').value = currentUserData.waPaymentInfo || ''; 
    document.getElementById('waModal').style.display = 'flex'; 
};
window.saveWaMessage = async () => { 
    const btn = document.querySelector('#waModal .btn-primary');
    btn.innerText = "Guardando..."; btn.disabled = true;
    try { 
        await updateDoc(doc(db, "users", currentUser.uid), { 
            waTemplate: document.getElementById('editWaMessage').value,
            waPaymentInfo: document.getElementById('editWaPayment').value 
        }); 
        currentUserData.waTemplate = document.getElementById('editWaMessage').value;
        currentUserData.waPaymentInfo = document.getElementById('editWaPayment').value;
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
    document.getElementById('profileModal').style.display = 'flex'; 
};

window.saveProfile = async () => { 
    const phone = document.getElementById('editProfilePhone').value.trim(); 
    const name = document.getElementById('editProfileName').value;
    const country = document.getElementById('editProfileCountry').value;
    if(!phone.startsWith('+')) return window.showNotification("⚠️ El teléfono DEBE incluir el código de país"); 
    
    const btn = document.querySelector('#profileModal .btn-primary');
    btn.innerText = "Subiendo... ⏳"; btn.disabled = true;

    try {
        let logoUrl = currentUserData.logoUrl || null;
        const fileInput = document.getElementById('editLogoUpload');
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `logos/${currentUser.uid}`);
            await uploadBytes(storageRef, file);
            logoUrl = await getDownloadURL(storageRef);
        }

        // Limpiamos el alias (solo minúsculas, números y guiones)
        let rawAlias = document.getElementById('editProfileAlias').value;
        let finalAlias = rawAlias.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        await updateDoc(doc(db, "users", currentUser.uid), { 
            name: name, country: country, currency: getCurrencyForCountry(country), 
            phone: phone, logoUrl: logoUrl, storeAlias: finalAlias 
        }); 
        
        currentUserData.storeAlias = finalAlias; // Actualizamos en memoria 
        
        currentUserData.name = name;
        currentUserData.country = country;
        currentUserData.phone = phone;
        currentUserData.logoUrl = logoUrl;
        globalCurrency = getCurrencyForCountry(country);
        currentUserData.currency = globalCurrency;

        document.getElementById('brandName').innerText = name || 'Mi Panel';
        if (logoUrl) { document.getElementById('brandLogo').src = logoUrl; document.getElementById('brandLogo').style.display = 'block'; }
        if (document.getElementById('clientCost')) document.getElementById('clientCost').placeholder = `Costo Proveedor (${globalCurrency})`;
        if (document.getElementById('clientPrice')) document.getElementById('clientPrice').placeholder = `Precio de Venta (${globalCurrency})`;

        window.showNotification("Perfil y Logo guardados."); 
        window.closeModals();
        window.renderTable();
        window.toggleStats(true);
        btn.innerText = "Guardar y Actualizar"; btn.disabled = false;
    } catch(e) { window.showNotification("Error: " + e.message); btn.innerText = "Guardar y Actualizar"; btn.disabled = false; } 
};

window.openSuggestionModal = () => { document.getElementById('suggestionText').value = ''; document.getElementById('suggestionModal').style.display = 'flex'; };
window.sendSuggestion = async () => { const text = document.getElementById('suggestionText').value; if (!text) return window.showNotification("Escribe algo primero."); const btn = document.querySelector('#suggestionModal .btn-primary'); btn.innerText = "Enviando..."; btn.disabled = true; try { await addDoc(collection(db, "suggestions"), { userId: currentUser.uid, userName: currentUserData.name, text: text, date: new Date().toISOString(), approved: false }); window.showNotification("¡Gracias! 🚀"); window.closeModals(); } catch(e) { window.showNotification("Error: " + e.message); } finally { btn.innerText = "Enviar Idea 🚀"; btn.disabled = false; } };

window.openAccountModal = () => { document.getElementById('accEmail').value = tempAccountData.email; document.getElementById('accPassword').value = tempAccountData.password; document.getElementById('accProfile').value = tempAccountData.profile; document.getElementById('accPin').value = tempAccountData.pin; document.getElementById('accUnits').value = tempAccountData.units || 1; document.getElementById('accountModal').style.display = 'flex'; };
window.confirmAccountData = () => { tempAccountData.email = document.getElementById('accEmail').value; tempAccountData.password = document.getElementById('accPassword').value; tempAccountData.profile = document.getElementById('accProfile').value; tempAccountData.pin = document.getElementById('accPin').value; tempAccountData.units = parseInt(document.getElementById('accUnits').value) || 1; window.closeModals(); const btn = document.getElementById('btnAccountData'); btn.innerText = `✅ Datos Ingresados (${tempAccountData.units} ud)`; btn.style.backgroundColor = "var(--mac-green)"; btn.style.color = "white"; };
window.viewAccountData = (id) => { const c = clients.find(x => x.id === id); document.getElementById('viewAccEmail').innerText = c.accountEmail || '-'; document.getElementById('viewAccPassword').innerText = c.accountPassword || '-'; document.getElementById('viewAccProfile').innerText = c.accountProfile || '-'; document.getElementById('viewAccPin').innerText = c.accountPin || '-'; document.getElementById('viewAccUnits').innerText = c.accountUnits || '1'; document.getElementById('viewAccountModal').style.display = 'flex'; };

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
    // 1. Cargar Usuarios
    const q = await getDocs(collection(db, "users")); const tbody = document.getElementById('adminTableBody'); tbody.innerHTML = '';
q.forEach((d) => {
        const data = d.data(), id = d.id; 
        if(data.role === 'admin') return;
        
        const statusHtml = data.active ? `<span class="status active">Activado</span>` : `<span class="status expired">Suspendido</span>`;
        let expText = ""; 
        if (data.active && data.activeUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Vence: ${new Date(data.activeUntil).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</span>`; } else if (!data.active && data.suspendedUntil) { expText = `<br><span style="font-size:11px; color:var(--mac-text-secondary);">Hasta: ${new Date(data.suspendedUntil).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'})}</span>`; }
        
        // --- NUEVA LÓGICA DE PLANES ---
        const planDisplay = (data.plan_actual || 'demo').toUpperCase();
        // Le damos color al texto según el plan (Azul para Pro, Verde para Básico)
        const planColor = planDisplay === 'PRO' ? 'var(--mac-blue)' : (planDisplay === 'BASICO' ? 'var(--mac-green)' : 'var(--mac-text-secondary)');
        
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
    const qS = await getDocs(collection(db, "suggestions")); const sBody = document.getElementById('adminSuggestionsBody'); sBody.innerHTML = ''; let arrS = []; qS.forEach(d => arrS.push({ id: d.id, ...d.data() })); arrS.sort((a,b) => new Date(b.date) - new Date(a.date));
    arrS.forEach(s => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${new Date(s.date).toLocaleDateString('es-ES')}</td><td><strong>${s.userName}</strong></td><td style="color:var(--mac-text-secondary);">${s.text}</td><td>${s.approved ? '<span style="color:var(--mac-green);font-weight:bold;">✅ Aprobada</span>' : '<span style="color:var(--mac-orange);font-weight:bold;">⏳ Pendiente</span>'}</td><td class="actions-cell">${s.approved ? '' : `<button class="action-btn btn-wa" onclick="window.approveSuggestion('${s.id}')">✔️ Aprobar</button>`} <button class="action-btn btn-del" onclick="window.deleteSuggestion('${s.id}')">🗑️</button></td>`; sBody.appendChild(tr); });

    // 3. Cargar Noticias (NUEVO)
    const qN = await getDocs(collection(db, "news")); const nBody = document.getElementById('adminNewsBody'); nBody.innerHTML = ''; let arrN = []; qN.forEach(d => arrN.push({ id: d.id, ...d.data() })); arrN.sort((a,b) => new Date(b.fechaIso) - new Date(a.fechaIso));
    arrN.forEach(n => {
        const dateStr = new Date(n.fechaIso).toLocaleDateString('es-ES');
        const imgHtml = n.img ? `<a href="${n.img}" target="_blank" style="color:var(--mac-blue); font-size:12px;">Ver Foto</a>` : '<span style="font-size:12px; color:var(--mac-text-secondary);">Sin foto</span>';
        const tr = document.createElement('tr'); tr.innerHTML = `<td>${dateStr}</td><td><strong>${n.titulo}</strong></td><td>${imgHtml}</td><td class="actions-cell"><button class="action-btn btn-del" onclick="window.deleteNews('${n.id}')">🗑️ Borrar</button></td>`; nBody.appendChild(tr);
    });
}

/* --- FUNCIONES DE ADMINISTRAR NOTICIAS --- */
window.saveNews = async () => {
    const title = document.getElementById('newsInputTitle').value;
    const desc = document.getElementById('newsInputDesc').value;
    const fileInput = document.getElementById('newsInputImg');
    if (!title || !desc) return window.showNotification("Falta título o descripción");
    
    const btn = document.querySelector('#adminView .btn-primary');
    const origText = btn.innerText; btn.innerText = "Subiendo... ⏳"; btn.disabled = true;

    try {
        let imgUrl = "";
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `news/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(storageRef);
        }
        await addDoc(collection(db, "news"), { titulo: title, desc: desc, img: imgUrl, fechaIso: new Date().toISOString() });
        window.showNotification("Noticia publicada con éxito");
        document.getElementById('newsInputTitle').value = ''; document.getElementById('newsInputDesc').value = ''; fileInput.value = '';
        loadAdminData(); // Recarga la tabla
    } catch(e) { window.showNotification("Error: " + e.message); } 
    finally { btn.innerText = origText; btn.disabled = false; }
};

window.deleteNews = async (id) => {
    if(confirm("¿Seguro que deseas eliminar esta noticia de todos los paneles?")) {
        await deleteDoc(doc(db, "news", id));
        window.showNotification("Noticia eliminada");
        loadAdminData();
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

const resetAccountButton = () => { tempAccountData = { email: '', password: '', profile: '', pin: '', units: 1 }; const btn = document.getElementById('btnAccountData'); btn.innerText = "🔑 Ingresar Datos de Cuenta"; btn.style.backgroundColor = "var(--mac-gray)"; btn.style.color = "var(--mac-text-main)"; };

/* --- GUARDAR CLIENTE (CON HERENCIA DE COLOR INTELIGENTE) --- */
/* --- GUARDAR CLIENTE (CON LÍMITES Y HERENCIA DE COLOR) --- */
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
        // 🔒 EL CANDADO: Verificamos el límite SOLO si es un cliente nuevo (no si está editando)
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
                        window.mostrarPlanesSuscripcion(); // <-- Aquí llamamos al catálogo
                    }
                });
                btn.innerText = origBtnText;
                btn.disabled = false;
                return;
            }
        }

        const data = { userId: currentUser.uid, name: document.getElementById('clientName').value, platform: checked.join(', '), phone: phone, date: document.getElementById('expirationDate').value, cost: cost, price: price, accountEmail: tempAccountData.email, accountPassword: tempAccountData.password, accountProfile: tempAccountData.profile, accountPin: tempAccountData.pin, accountUnits: tempAccountData.units || 1 };

        if (editingClientId) { 
            data.color = clients.find(c => c.id === editingClientId).color; 
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

window.deleteClient = async (id) => { if(confirm('¿Borrar registro?')) { await deleteDoc(doc(db, "clients", id)); loadUserClients(); } };
window.renewClient = async (id) => { if(confirm('¿Renovar 1 mes desde HOY?')) { const h = new Date(); h.setMonth(h.getMonth() + 1); const str = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`; await updateDoc(doc(db, "clients", id), { date: str }); window.showNotification("Renovado"); loadUserClients(); } };

window.startEdit = (id) => {
    editingClientId = id; const c = clients.find(x => x.id === id);
    document.getElementById('clientName').value = c.name; document.getElementById('phone').value = c.phone; document.getElementById('expirationDate').value = c.date;
    document.getElementById('clientCost').value = c.cost || ''; document.getElementById('clientPrice').value = c.price || '';
    tempAccountData.email = c.accountEmail || ''; tempAccountData.password = c.accountPassword || ''; tempAccountData.profile = c.accountProfile || ''; tempAccountData.pin = c.accountPin || ''; tempAccountData.units = c.accountUnits || 1;
    const btn = document.getElementById('btnAccountData'); btn.innerText = `✅ Datos de Cuenta (${tempAccountData.units} ud)`; btn.style.backgroundColor = "var(--mac-green)"; btn.style.color = "white";
    const cbs = document.querySelectorAll('#checkboxDropdown input'); cbs.forEach(cb => cb.checked = false); c.platform.split(', ').forEach(p => { cbs.forEach(cb => { if(cb.value === p) cb.checked = true; }); });
    document.getElementById('selectText').textContent = c.platform; document.getElementById('selectText').classList.add('has-selection');
    document.getElementById('actionButtonsContainer').innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><button type="button" class="btn-primary" onclick="window.saveClientData()">Guardar</button><button type="button" class="btn-secondary" onclick="window.cancelEdit()">Cancelar</button></div>`;
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
};
window.cancelEdit = () => { editingClientId = null; document.getElementById('clientForm').reset(); resetAccountButton(); document.getElementById('selectText').textContent = 'Plataforma(s)...'; document.getElementById('selectText').classList.remove('has-selection'); document.getElementById('actionButtonsContainer').innerHTML = `<button type="button" class="btn-primary" onclick="window.saveClientData()">Agregar Cliente</button>`; };

/* --- RENDERIZAR TABLA (NOMBRES DE COLORES) --- */
window.renderTable = () => {
    const tbody = document.getElementById('tableBody'); tbody.innerHTML = ''; const today = new Date(); today.setHours(0,0,0,0);
    const search = document.getElementById('searchInput').value.toLowerCase(); const filter = document.getElementById('filterSelect').value;
    let proc = clients.map(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); exp.setHours(0,0,0,0); const diff = Math.ceil((exp - today) / 86400000); return { ...c, expDate: exp, diffDays: diff, statusCat: diff > 3 ? 'active' : (diff >= 0 ? 'warning' : 'expired') }; }).sort((a, b) => a.diffDays - b.diffDays);
    
    proc.forEach(c => {
        if (filter !== 'all' && c.statusCat !== filter) return;
        if (search && !c.name.toLowerCase().includes(search) && !c.phone.toLowerCase().includes(search) && !c.platform.toLowerCase().includes(search)) return;
        const stText = c.diffDays > 0 ? `Faltan ${c.diffDays} d` : (c.diffDays === 0 ? 'Hoy' : 'Vencido');
        const uCount = c.accountUnits || 1; const prof = ((c.price || 0) - (c.cost || 0)) * uCount; const dispUnits = uCount > 1 ? `<span style="font-size:11px;color:var(--mac-text-secondary);display:block;">(${uCount} unidades)</span>` : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `<td data-label="Cliente" onclick="if(window.innerWidth <= 768) window.openMobileClientModal('${c.id}')"><div class="client-profile"><span style="color:${c.color || 'var(--mac-text-main)'}; font-weight: 800; font-size: 15px; letter-spacing: 0.5px;">${c.name}</span></div></td>
        <td data-label="Plataformas" style="font-weight: 500;">${c.platform}</td>
        <td data-label="Cuenta"><button class="action-btn" style="color:var(--mac-text-main); font-weight:bold; border: 1px solid var(--mac-border);" onclick="window.viewAccountData('${c.id}')">🔑 Ver Datos</button></td>
        <td data-label="WhatsApp">${c.phone}</td>
        <td data-label="Utilidad (${globalCurrency})"><span style="color:var(--mac-green); font-weight:bold;">+${globalCurrency}${prof.toFixed(2)}</span>${dispUnits}</td>
        <td data-label="Vencimiento">${c.expDate.toLocaleDateString('es-ES')}</td>
        <td data-label="Estado"><span class="status ${c.statusCat}">${stText}</span></td>
        <td data-label="Acciones" class="actions-cell">
            <button class="action-btn btn-wa" onclick="window.sendWA('${c.phone}', '${c.name}', '${c.platform}', '${c.expDate.toLocaleDateString('es-ES')}')"><i class='bx bxl-whatsapp'></i> WA</button>
            <button class="action-btn" style="background: rgba(175, 82, 222, 0.15); color: #AF52DE; font-weight: bold;" onclick="window.downloadTicket('${c.id}', event)"><i class='bx bx-receipt'></i> Recibo</button>
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
    const p = document.getElementById('statsPanel'); if (!forceUpdate) p.style.display = p.style.display === 'grid' ? 'none' : 'grid';
    if (p.style.display === 'grid') {
        let a=0, w=0, e=0, profit=0, income=0, cost=0; const t = new Date(); t.setHours(0,0,0,0);
        clients.forEach(c => {
            const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0,0,0,0);
            const d = Math.ceil((x-t)/86400000);
            if(d>=0) { if(d>3) a++; else w++; const uCount = c.accountUnits || 1; profit += ((c.price || 0) - (c.cost || 0)) * uCount; income += (c.price || 0) * uCount; cost += (c.cost || 0) * uCount; } else e++;
        });
        document.getElementById('statActive').innerText=a; document.getElementById('statWarning').innerText=w; document.getElementById('statExpired').innerText=e;
        document.getElementById('statProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`; document.getElementById('bdIncome').innerText = `${globalCurrency}${income.toFixed(2)}`; document.getElementById('bdCost').innerText = `${globalCurrency}${cost.toFixed(2)}`; document.getElementById('bdProfit').innerText = `${globalCurrency}${profit.toFixed(2)}`;
    }
};

window.exportToExcel = () => { if (!clients.length) return window.showNotification("No hay datos"); let csv = `data:text/csv;charset=utf-8,Cliente,Plataformas,WhatsApp,Unidades,Costo Total(${globalCurrency}),Precio Total(${globalCurrency}),Vencimiento\n`; clients.forEach(c => { const exp = new Date(c.date); exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset()); const u = c.accountUnits||1; csv += `${c.name},"${c.platform}",${c.phone},${u},${(c.cost||0)*u},${(c.price||0)*u},${exp.toLocaleDateString('es-ES')}\n`; }); const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", `Clientes_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
window.copyExpiredList = () => { const t = new Date(); t.setHours(0,0,0,0); let exp = []; clients.forEach(c => { const x = new Date(c.date); x.setMinutes(x.getMinutes() + x.getTimezoneOffset()); x.setHours(0,0,0,0); if (x < t) exp.push(`- ${c.name} | ${c.platform} | ${c.phone}`); }); if (!exp.length) return window.showNotification("Sin vencidos"); navigator.clipboard.writeText("🚨 VENCEDORES:\n\n" + exp.join('\n')).then(() => window.showNotification("Lista copiada")); }

const updateThemeIcon = () => { 
    const isDark = document.body.classList.contains('dark-mode'); 
    document.querySelectorAll('.theme-toggle').forEach(btn => { 
        btn.innerHTML = isDark ? "<i class='bx bx-sun'></i> Modo claro" : "<i class='bx bx-moon'></i> Modo oscuro"; 
    }); 
};
if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode'); updateThemeIcon(); 
window.toggleTheme = () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('darkMode', document.body.classList.contains('dark-mode')); updateThemeIcon(); };

/* --- GENERADOR DE RECIBOS EN IMAGEN (VERSIÓN DEFINITIVA ANTI-CACHÉ CONTAMINADA) --- */
window.downloadTicket = async (clientId, event) => {
    const btn = event.currentTarget; 
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

        // 1.5 Hack Supremo: Engañar a la caché y crear un lienzo virtual
        const ticketLogo = document.getElementById('ticketLogo');
        if (ticketLogo) {
            if (currentUserData.logoUrl) {
                await new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous'; // Exigimos permisos
                    
                    // El "?cb=" le hace creer al navegador que es una imagen totalmente nueva
                    img.src = currentUserData.logoUrl + (currentUserData.logoUrl.includes('?') ? '&' : '?') + 'cb=' + new Date().getTime();
                    
                    img.onload = () => {
                        // La redibujamos en un mini-lienzo invisible y extraemos el código puro
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
                        resolve(); // Que el recibo siga adelante aunque falle el logo
                    };
                });
                
                // Micro-pausa para darle tiempo al navegador a inyectar la imagen en el HTML
                await new Promise(r => setTimeout(r, 150));
            } else {
                ticketLogo.style.display = 'none';
            }
        }

        // 2. Tomar la foto
        const ticketEl = document.getElementById('ticketTemplate');
        ticketEl.style.left = '0px'; 
        
        const canvas = await html2canvas(ticketEl, { 
            backgroundColor: '#1c1c1e',
            scale: 2, 
            useCORS: true, 
            allowTaint: true
        });
        
        ticketEl.style.left = '-9999px'; 

        // 3. Descargar la imagen
        const link = document.createElement('a');
        link.download = `Recibo_${c.name.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        window.showNotification("Recibo generado al instante 🧾");

    } catch(e) {
        console.error(e);
        window.showNotification("Error al generar el recibo.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
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
        noticias.sort((a,b) => new Date(b.fechaIso) - new Date(a.fechaIso));

        sidebar.innerHTML = '';
        content.innerHTML = '<div style="display:flex; height:100%; align-items:center; justify-content:center;"><p style="color: var(--mac-text-secondary); text-align: center;">👈 Selecciona una noticia de la izquierda para ver los detalles.</p></div>';

        if(noticias.length === 0) {
            sidebar.innerHTML = '<div style="padding:15px; text-align:center; color:var(--mac-text-secondary);">No hay noticias nuevas por ahora.</div>';
            return;
        }

        noticias.forEach((noticia) => {
            const dateStr = new Date(noticia.fechaIso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const div = document.createElement('div');
            div.className = 'news-item-title';
            div.innerHTML = `<strong>${noticia.titulo}</strong><br><span style="font-size:11px; font-weight:normal; opacity: 0.8;">${dateStr}</span>`;
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
        <p style="font-size: 14px; line-height: 1.6; color: var(--mac-text-main); margin-bottom: 20px;">${noticia.desc}</p>
    `;
};

/* =========================================================
   A.G.C. WRAPPED - ALGORITMO DE MÉTRICAS PREMIUM SIN LOGO
========================================================= */
window.showWrapped = () => {
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
                📸 Descargar Historia (IG/WA)
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

/* --- MODAL DE DETALLES DEL CLIENTE (EXCLUSIVO MÓVIL) --- */
window.openMobileClientModal = (id) => {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    
    // 1. Llenar textos
    document.getElementById('mcName').innerText = c.name;
    document.getElementById('mcPhone').innerText = c.phone;
    
    const uCount = c.accountUnits || 1; 
    const total = (c.price || 0) * uCount;
    document.getElementById('mcPrice').innerText = `${globalCurrency}${total.toFixed(2)}`;
    
    const exp = new Date(c.date);
    exp.setMinutes(exp.getMinutes() + exp.getTimezoneOffset());
    exp.setHours(0,0,0,0);
    document.getElementById('mcDate').innerText = exp.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    
    // 2. Calcular estado
    const today = new Date(); today.setHours(0,0,0,0);
    const diffDays = Math.ceil((exp - today) / 86400000);
    const statusCat = diffDays > 3 ? 'active' : (diffDays >= 0 ? 'warning' : 'expired');
    const stText = diffDays > 0 ? `Faltan ${diffDays} d` : (diffDays === 0 ? 'Hoy' : 'Vencido');
    
    const statusBadge = document.getElementById('mcStatus');
    statusBadge.className = `status ${statusCat}`;
    statusBadge.innerText = stText;
    
    // 3. Inyectar Botones Grandes
    const renewBtn = statusCat !== 'active' ? `<button class="action-btn btn-renew" style="padding:12px; font-size:14px;" onclick="window.closeModals(); window.renewClient('${c.id}')">🔄 Renovar</button>` : '';
    
    document.getElementById('mcActions').innerHTML = `
        <button class="action-btn btn-wa" style="padding:12px; font-size:14px;" onclick="window.sendWA('${c.phone}', '${c.name}', '${c.platform}', '${exp.toLocaleDateString('es-ES')}')">💬 WhatsApp</button>
        <button class="action-btn" style="padding:12px; font-size:14px; background: rgba(175, 82, 222, 0.15); color: #AF52DE; font-weight: bold;" onclick="window.downloadTicket('${c.id}', event)">🧾 Recibo</button>
        <button class="action-btn" style="padding:12px; font-size:14px; color: var(--mac-text-main);" onclick="window.closeModals(); window.startEdit('${c.id}')"><i class='bx bx-edit-alt'></i> Editar</button>
        <button class="action-btn btn-del" style="padding:12px; font-size:14px;" onclick="window.closeModals(); window.deleteClient('${c.id}')">🗑️ Borrar</button>
        ${renewBtn}
    `;
    
    document.getElementById('mobileClientModal').style.display = 'flex';
};

/* --- SISTEMA DE NOTIFICACIONES PUSH (FCM) --- */
window.requestNotificationPermission = async () => {
    try {
        console.log("Solicitando permiso de notificaciones...");
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log("Permiso concedido. Obteniendo token...");
            // AQUÍ PONDREMOS TU LLAVE PÚBLICA DE FIREBASE (VAPID KEY)
            const currentToken = await getToken(messaging, { vapidKey: 'BKBlbQcgMzLg-oCuFXjhn_2ekkAcrsGRS49RP3mKBvJDB-fPLzovUeYnNfmFi96ib5RtjJzta5nMlm7VsmSJC7k' });
            
            if (currentToken) {
                // Si obtiene el código, lo guarda en el perfil del usuario en la base de datos
                await updateDoc(doc(db, "users", currentUser.uid), { 
                    fcmToken: currentToken 
                });
                console.log("Token de notificaciones guardado con éxito.");
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

// 1. EL CANDADO DE SEGURIDAD (Solo PRO)
window.openStoreModal = () => {
    const plan = currentUserData.plan_actual || 'demo';
    
    if (plan !== 'pro' && plan !== 'elite') {
        window.closeModals();
        Swal.fire({
            icon: 'lock',
            title: 'Función Premium',
            text: 'Tener tu propio Catálogo Web para vender en automático es exclusivo del Plan PRO.',
            confirmButtonText: '💎 Mejorar a PRO',
            confirmButtonColor: '#FFD700',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            background: document.body.classList.contains('dark-mode') ? '#1c1c1e' : '#ffffff',
            color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'
        }).then((result) => {
            if (result.isConfirmed) window.mostrarPlanesSuscripcion();
        });
        return;
    }

    // Si es PRO, preparamos su link único y abrimos
    const aliasOrUid = currentUserData.storeAlias || currentUser.uid;
    const myUrl = window.location.origin + window.location.pathname + "?tienda=" + aliasOrUid;
    document.getElementById('storeLinkInput').value = myUrl;
    
    // ¡ESTAS SON LAS DOS LÍNEAS QUE FALTABAN PARA QUE SE ABRA LA VENTANA!
    window.renderStoreItems();
    document.getElementById('storeModal').style.display = 'flex';
};

// 2. GESTIÓN DEL CATÁLOGO INTERNO
window.addStoreItem = async () => {
    const plat = document.getElementById('storePlatform').value.trim();
    const price = document.getElementById('storePrice').value;
    if (!plat || !price) return window.showNotification("Completa plataforma y precio");

    const btn = document.querySelector('#storeModal .btn-primary');
    btn.innerText = "⏳"; btn.disabled = true;

    try {
        let catalog = currentUserData.storeCatalog || [];
        catalog.push({ platform: plat, price: parseFloat(price) });
        
        await updateDoc(doc(db, "users", currentUser.uid), { storeCatalog: catalog });
        currentUserData.storeCatalog = catalog;
        
        document.getElementById('storePlatform').value = '';
        document.getElementById('storePrice').value = '';
        window.renderStoreItems();
        window.showNotification("Producto añadido al catálogo");
    } catch(e) { window.showNotification("Error: " + e.message); }
    finally { btn.innerHTML = "<i class='bx bx-plus'></i>"; btn.disabled = false; }
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
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--mac-surface); padding:10px; border-radius:8px; border:1px solid var(--mac-border);";
        div.innerHTML = `
            <div>
                <strong style="color:var(--mac-text-main); font-size:14px;">${item.platform}</strong><br>
                <span style="color:var(--mac-green); font-size:13px; font-weight:bold;">${globalCurrency}${item.price.toFixed(2)}</span>
            </div>
            <button class="action-btn btn-del" onclick="window.deleteStoreItem(${index})"><i class='bx bx-trash'></i></button>
        `;
        list.appendChild(div);
    });
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

// 3. EL DETECTOR DEL CLIENTE PÚBLICO (MAGIA SPA)
// Esta función revisa si alguien entró usando el link de "Tiendita"
const checkPublicStore = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('tienda');
    
    if (storeId) {
        // Apagamos todas las ventanas del panel de control
        document.getElementById('authView').style.display = 'none';
        document.getElementById('appView').style.display = 'none';
        document.getElementById('adminView').style.display = 'none';
        
        // Encendemos la vista de la Tienda
        const storeView = document.getElementById('publicStoreView');
        storeView.style.display = 'block';

        try {
            let data = null;

            // 1. Primero buscamos si el link coincide con algún Alias personalizado
            const q = query(collection(db, "users"), where("storeAlias", "==", storeId));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                data = snap.docs[0].data();
            } else {
                // 2. Si no es un alias, probamos si es un código UID normal (por si acaso)
                const docRef = await getDoc(doc(db, "users", storeId));
                if (docRef.exists()) data = docRef.data();
            }

            // 3. Si no existe ni por alias ni por ID, abortamos
            if (!data) {
                document.getElementById('publicStoreName').innerText = "Tienda no encontrada";
                return;
            }
            
            // Si el distribuidor dejó de pagar el PRO o está suspendido, apagamos su tienda
            const plan = data.plan_actual || 'demo';
            if ((plan !== 'pro' && plan !== 'elite') || data.active === false) {
                document.getElementById('publicStoreName').innerText = "Tienda inactiva";
                document.getElementById('publicStoreCatalog').innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary);">Este distribuidor no tiene su catálogo habilitado en este momento.</p>';
                return;
            }

            // Pintamos la tienda
            document.getElementById('publicStoreName').innerText = data.name || "Distribuidor A.G.C.";
            
            const logoEl = document.getElementById('publicStoreLogo');
            if (data.logoUrl) {
                logoEl.src = data.logoUrl;
                logoEl.style.display = 'block';
            }

            const catalogBox = document.getElementById('publicStoreCatalog');
            const catalog = data.storeCatalog || [];
            
            if (catalog.length === 0) {
                catalogBox.innerHTML = '<p style="text-align:center; color:var(--mac-text-secondary);">No hay productos publicados aún.</p>';
            } else {
                catalogBox.innerHTML = '';
                catalog.forEach(item => {
                    const priceStr = `${data.currency || 'S/'}${item.price.toFixed(2)}`;
                    
                    // El botón manda directo al WhatsApp del distribuidor con el texto armado
                    const numLimpio = data.phone.replace(/[^\d+]/g, '');
                    const msg = encodeURIComponent(`Hola ${data.name}, deseo adquirir la cuenta de *${item.platform}* por el precio de *${priceStr}*. ¿A dónde deposito?`);
                    const waLink = `https://wa.me/${numLimpio}?text=${msg}`;

                    const card = document.createElement('div');
                    card.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--mac-gray); padding:15px 20px; border-radius:16px; border:1px solid var(--mac-border); box-shadow:0 4px 6px rgba(0,0,0,0.1);";
                    card.innerHTML = `
                        <div>
                            <strong style="color:var(--mac-text-main); font-size:16px;">${item.platform}</strong><br>
                            <span style="color:var(--mac-green); font-size:18px; font-weight:900;">${priceStr}</span>
                        </div>
                        <a href="${waLink}" target="_blank" style="text-decoration:none; background:#25D366; color:white; padding:10px 20px; border-radius:20px; font-weight:bold; font-size:14px; box-shadow:0 4px 10px rgba(37,211,102,0.3);"><i class='bx bxl-whatsapp'></i> Comprar</a>
                    `;
                    catalogBox.appendChild(card);
                });
            }
        } catch (e) {
            console.error("Error cargando tienda:", e);
        }
    }
};

// Ejecutamos el detector apenas se lee el archivo
checkPublicStore();
// Al final de app.js, exporta las funciones necesarias a window
window.doLogin = doLogin;
window.doRegister = doRegister;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.showReset = showReset;
window.doResetPassword = doResetPassword;
window.togglePassword = togglePassword;
// Asegúrate de agregar cualquier otra función que uses en los onclick de tu HTML

