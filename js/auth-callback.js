async function handleAuthCallback() {
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (errorDescription) {
    showToast(decodeURIComponent(errorDescription), "error");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);
    return;
  }

  // Supabase JS detects OAuth tokens/code in the URL and restores the session.
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    showToast(error?.message || "No login session found. Check redirect URL settings.", "error");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1800);
    return;
  }

  window.location.href = "dashboard.html";
}

document.addEventListener("DOMContentLoaded", handleAuthCallback);
