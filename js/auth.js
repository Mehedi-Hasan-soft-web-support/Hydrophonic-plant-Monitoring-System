function getLocalRedirectUrl(pageName) {
  return new URL(pageName, window.location.href).href;
}

async function initAuthPage() {
  const loginForm = $("#loginForm");
  const signupForm = $("#signupForm");
  const forgotForm = $("#forgotForm");
  const googleBtn = $("#googleLoginBtn");

  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (errorDescription) {
    showToast(decodeURIComponent(errorDescription), "error");
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = "dashboard.html";
    return;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Login successful", "success");
    window.location.href = "dashboard.html";
  });

  signupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = $("#signupName").value.trim();
    const email = $("#signupEmail").value.trim();
    const password = $("#signupPassword").value;

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        },
        emailRedirectTo: getLocalRedirectUrl("auth-callback.html")
      }
    });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Account created. Please verify your email.", "success");
  });

  forgotForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("#forgotEmail").value.trim();

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: getLocalRedirectUrl("auth-callback.html")
    });

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Password reset email sent", "success");
  });

  googleBtn?.addEventListener("click", async () => {
    const redirectUrl = getLocalRedirectUrl("auth-callback.html");

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        scopes: "email profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent"
        }
      }
    });

    if (error) {
      showToast(error.message, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", initAuthPage);
