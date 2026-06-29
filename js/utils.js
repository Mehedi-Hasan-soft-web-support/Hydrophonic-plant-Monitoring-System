function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return document.querySelectorAll(selector);
}

function formatValue(value, suffix = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 50);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function requireAuth() {
  return supabaseClient.auth.getSession().then(({ data }) => {
    if (!data.session) {
      window.location.href = "login.html";
      return null;
    }
    return data.session;
  });
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
}

function loadTheme() {
  const theme = localStorage.getItem("theme") || "dark";
  if (theme === "light") document.body.classList.add("light");
}

loadTheme();
