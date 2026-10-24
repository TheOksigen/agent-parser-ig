import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/controls";
export default async function Login() {
  if (await isAdmin()) redirect("/");
  return (
    <main className="login-page">
      <section className="login-card">
        <span className="brand-mark">
          <Archive size={25} />
        </span>
        <p className="eyebrow">POSTARXİV</p>
        <h1>Arxivinizə daxil olun.</h1>
        <p className="description">
          Profillər, paylaşımlar və bütün təsvirlər bir yerdə.
        </p>
        <LoginForm />
        <p className="muted text-small">
          Giriş şifrəsi serverin .env faylında saxlanılır.
        </p>
      </section>
    </main>
  );
}
