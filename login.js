import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const form = document.querySelector("#loginForm");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const rememberInput = document.querySelector("#remember");
const loginButton = document.querySelector("#loginButton");
const message = document.querySelector("#authMessage");
const togglePassword = document.querySelector("#togglePassword");
const forgotPassword = document.querySelector("#forgotPassword");

function showMessage(text = "") {
  message.textContent = text;
}

function friendlyError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/invalid-email": "Ingresa un correo electrónico válido.",
    "auth/user-disabled": "Esta cuenta está deshabilitada. Contacta al administrador.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
    "auth/network-request-failed": "No se pudo conectar. Revisa tu conexión a internet."
  };
  return messages[code] || "No fue posible iniciar sesión. Revisa tus datos e inténtalo de nuevo.";
}

function setLoading(loading) {
  loginButton.disabled = loading;
  loginButton.querySelector("span").textContent = loading ? "Verificando…" : "Iniciar sesión";
}

// Si ya existe una sesión válida, no mostramos nuevamente el login.
onAuthStateChanged(auth, (user) => {
  if (user) {
    const target = sessionStorage.getItem("dicol_login_target") || "index.html";
    sessionStorage.removeItem("dicol_login_target");
    window.location.replace(target);
  }
});

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.setAttribute("aria-pressed", String(isPassword));
  togglePassword.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("Completa tu correo y contraseña.");
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    return;
  }

  setLoading(true);
  document.body.classList.add("is-loading");

  try {
    await setPersistence(auth, rememberInput.checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showMessage(friendlyError(error));
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    setLoading(false);
    document.body.classList.remove("is-loading");
  }
});

forgotPassword.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  showMessage("");

  if (!email) {
    emailInput.focus();
    showMessage("Escribe primero tu correo para enviarte el enlace de recuperación.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Te enviamos un enlace para restablecer tu contraseña.");
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

// Permite que otras páginas guarden el destino antes de redirigir al login.
window.dicolRequireAuth = (target = "index.html") => {
  sessionStorage.setItem("dicol_login_target", target);
  window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
};
