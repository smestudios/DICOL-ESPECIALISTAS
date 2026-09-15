import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const target = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}${window.location.hash}`;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    sessionStorage.setItem("dicol_login_target", target);
    window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists() || profile.data().active !== true) throw new Error("Perfil no activo.");
    document.documentElement.dataset.userRole = profile.data().role || "";
  } catch (error) {
    await auth.signOut();
    sessionStorage.setItem("dicol_login_target", target);
    window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
  }
});
