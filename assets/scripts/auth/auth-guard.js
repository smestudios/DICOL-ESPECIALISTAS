import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const target = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}${window.location.hash}`;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    sessionStorage.setItem("dicol_login_target", target);
    window.location.replace(`login.html?redirect=${encodeURIComponent(target)}`);
  }
});
