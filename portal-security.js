// Seguridad adicional para el Portal del Cliente.
// Esta capa reemplaza la validación de teléfono+código que antes ocurría
// completamente en el navegador y la delega a una Cloud Function.

const PORTAL_API_URL = "https://us-central1-dashboard-streaming-akaza.cloudfunctions.net/portalAccess";
let securePortalId = null;
let securePortalStoreData = null;

const portalPost = async (payload) => {
    const response = await fetch(PORTAL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}

    if (!response.ok) {
        const err = new Error(data.message || `Error del portal (${response.status})`);
        err.status = response.status;
        err.retryAfter = data.retryAfter || null;
        throw err;
    }
    return data;
};

const applyStoreBranding = (store) => {
    securePortalStoreData = store || {};

    const nameEl = document.getElementById("portalStoreName");
    if (nameEl) nameEl.innerText = securePortalStoreData.name || "Mi Portal";

    const logo = document.getElementById("portalStoreLogo");
    if (logo) {
        if (securePortalStoreData.logoUrl) {
            logo.src = securePortalStoreData.logoUrl;
            logo.style.display = "block";
        } else {
            logo.style.display = "none";
        }
    }

    const vendorPhone = securePortalStoreData.phone
        ? String(securePortalStoreData.phone).replace(/[^\d+]/g, "")
        : "";
    const supportLink = document.getElementById("portalSupportWaBtn");
    if (supportLink && vendorPhone) {
        supportLink.href = `https://wa.me/${vendorPhone}?text=${encodeURIComponent("Hola, necesito ayuda con mis servicios del portal.")}`;
    }
};

// Reemplaza la versión original. Ya no consulta la colección clients desde
// el navegador, ni permite entrar directamente mediante ?client=<id>.
window.checkClientPortal = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const portalId = urlParams.get("portal") || urlParams.get("store");
    if (!portalId) return false;

    securePortalId = portalId;

    if (document.getElementById("authView")) document.getElementById("authView").style.display = "none";
    if (document.getElementById("appView")) document.getElementById("appView").style.display = "none";
    if (document.getElementById("adminView")) document.getElementById("adminView").style.display = "none";
    if (document.getElementById("publicStoreView")) document.getElementById("publicStoreView").style.display = "none";

    const portalView = document.getElementById("clientPortalView");
    if (portalView) portalView.style.display = "block";

    try {
        const result = await portalPost({ action: "bootstrap", portalId });
        applyStoreBranding(result.store);

        // Los enlaces antiguos que incluyan client= siguen abriendo el portal,
        // pero ya no revelan datos sin teléfono + código.
        if (urlParams.get("client")) {
            window.history.replaceState({}, "", `${window.location.pathname}?portal=${encodeURIComponent(portalId)}`);
        }

        return true;
    } catch (e) {
        console.error("Error inicializando portal seguro:", e);
        const nameEl = document.getElementById("portalStoreName");
        if (nameEl) nameEl.innerText = e.status === 404 ? "Portal no encontrado" : "Portal temporalmente no disponible";
        return true;
    }
};

window.searchPortalByPhone = async () => {
    const phoneEl = document.getElementById("portalPhoneSearchInput");
    const codeEl = document.getElementById("portalCodeSearchInput");
    const phoneInput = phoneEl ? phoneEl.value.trim() : "";
    const codeInput = codeEl ? codeEl.value.trim().toUpperCase() : "";

    if (!phoneInput || !codeInput) {
        return window.showNotification("⚠️ Ingresa tu WhatsApp y el Código del portal.");
    }
    if (!securePortalId) {
        return window.showNotification("⚠️ No se pudo identificar este portal.");
    }

    const btn = document.querySelector("#portalSearchCard .btn-primary");
    const origText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.innerHTML = "Verificando... <i class='bx bx-loader-alt bx-spin'></i>";
        btn.disabled = true;
    }

    try {
        const result = await portalPost({
            action: "login",
            portalId: securePortalId,
            phone: phoneInput,
            code: codeInput
        });

        applyStoreBranding(result.store);

        if (Array.isArray(result.clients) && result.clients.length > 0) {
            const card = document.getElementById("portalSearchCard");
            if (card) card.style.display = "none";
            window.renderClientPortalData(result.clients, securePortalStoreData);
        } else {
            window.showNotification("❌ Datos incorrectos. Revisa tu número y código.");
        }
    } catch (e) {
        console.error("Error de acceso al portal:", e);
        if (e.status === 429) {
            const minutes = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : 15;
            window.showNotification(`🔒 Demasiados intentos. Intenta nuevamente en ${minutes} min.`);
        } else if (e.status === 401) {
            window.showNotification("❌ Datos incorrectos. Revisa tu número y código.");
        } else {
            window.showNotification("⚠️ No se pudo verificar el acceso. Intenta nuevamente.");
        }
    } finally {
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }
};
