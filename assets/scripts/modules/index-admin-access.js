const adminTool = document.querySelector(".admin-only");

(window.dicolAuthReady || Promise.reject(new Error("AUTH_REQUIRED")))
  .then(({ profile }) => {
    adminTool.hidden = profile?.role !== "admin";
  })
  .catch(() => {
    adminTool.hidden = true;
  });
