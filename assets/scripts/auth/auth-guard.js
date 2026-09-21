import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-client.js";

const target = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}${window.location.hash}`;
let redirecting = false;
let resolveAuth;
let rejectAuth;

// Las páginas internas esperan esta promesa en lugar de crear otro listener de
// Firebase. Así sólo se carga información de negocio después de validar el
// perfil activo en Firestore.
window.dicolAuthReady = new Promise((resolve, reject) => {
  resolveAuth = resolve;
  rejectAuth = reject;
});

function redirectToLogin() {
  if (redirecting) return;
  redirecting = true;
  sessionStorage.setItem("dicol_login_target", target);
  window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    rejectAuth(new Error("AUTH_REQUIRED"));
    redirectToLogin();
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!profileSnapshot.exists()) throw new Error("Perfil no encontrado.");
    const profile = profileSnapshot.data();
    if (profile.active !== true) throw new Error("Perfil no activo.");

    document.documentElement.dataset.userRole = profile.role || "";
    const session = { user, profile };
    resolveAuth(session);
    window.dispatchEvent(new CustomEvent("dicol-auth-ready", { detail: session }));
  } catch (error) {
    rejectAuth(error);
    try {
      await auth.signOut();
    } catch (_) {
      // Conserva el error de autorización original.
    }
    redirectToLogin();
  }
});
