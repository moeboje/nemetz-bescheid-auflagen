import { validatePassword } from "./security.js";

const insecureDefaultAdmin = {
  email: "admin@example.com",
  password: "ChangeMe123!"
} as const;

export function resolveExplicitAdminCredentials(context: "bootstrap" | "seed") {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const capitalizedContext = capitalizeContext(context);

  if (!adminEmail) {
    throw new Error(`${capitalizedContext} requires explicit ADMIN_EMAIL.`);
  }

  if (!adminPassword) {
    throw new Error(`${capitalizedContext} requires explicit ADMIN_PASSWORD.`);
  }

  if (adminPassword === insecureDefaultAdmin.password) {
    throw new Error(
      `${capitalizedContext} refuses placeholder ADMIN_PASSWORD "${insecureDefaultAdmin.password}". Set a unique non-default admin password.`
    );
  }

  const passwordValidation = validatePassword(adminPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || "Invalid ADMIN_PASSWORD");
  }

  return {
    adminEmail,
    adminPassword
  };
}

function capitalizeContext(context: string) {
  return context.charAt(0).toUpperCase() + context.slice(1);
}
