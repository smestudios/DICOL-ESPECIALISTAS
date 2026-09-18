import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase-client.js";

document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut(auth);
      sessionStorage.removeItem("dicol_login_target");
      window.location.replace("login.html");
    } finally {
      button.disabled = false;
    }
  });
});
