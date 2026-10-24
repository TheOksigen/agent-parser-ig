"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  Plus,
  Search,
  Smartphone,
  LogOut,
  ArrowRight,
} from "lucide-react";

async function post(action: string, payload: unknown, base = "/api/admin/") {
  const response = await fetch(base + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Sorğu tamamlanmadı.");
  return result;
}
function Feedback({ error, message }: { error?: string; message?: string }) {
  return error ? (
    <p className="feedback error" role="alert">
      {error}
    </p>
  ) : message ? (
    <p className="feedback success" role="status">
      {message}
    </p>
  ) : null;
}

export function CollectionSettingsForm({
  intervalSeconds,
}: {
  intervalSeconds: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      id="collection-settings"
      className="panel collection-settings"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = Number(
          new FormData(event.currentTarget).get("intervalSeconds"),
        );
        setPending(true);
        setError("");
        setMessage("");
        try {
          const result = await post("collection-settings", {
            intervalSeconds: value,
          });
          setMessage(result.message);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="collection-settings-copy">
        <h2>Toplama intervalı</h2>
        <p className="muted text-small" id="interval-help">
          Hər cihazda səhifə açılışları arasındakı minimum vaxt. Başlanğıc: 10
          saniyə. Intervalı artırmaq 429 ehtimalını azalda bilər, zəmanət
          vermir.
        </p>
      </div>
      <div className="collection-settings-controls">
        <div>
          <label htmlFor="intervalSeconds">Interval (saniyə)</label>
          <input
            id="intervalSeconds"
            name="intervalSeconds"
            type="number"
            inputMode="numeric"
            min={2}
            max={300}
            step={1}
            required
            defaultValue={intervalSeconds}
            key={intervalSeconds}
            aria-describedby="interval-help"
          />
        </div>
        <button className="button secondary" disabled={pending}>
          {pending ? "Saxlanılır…" : "Tətbiq et"}
        </button>
      </div>
      <div className="collection-settings-feedback">
        <Feedback error={error} message={message} />
      </div>
    </form>
  );
}

export function ActionButton({
  action,
  payload,
  children,
  secondary = true,
}: {
  action: string;
  payload: unknown;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="action-control">
      <button
        className={secondary ? "button secondary small" : "button small"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            await post(action, payload);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending && <LoaderCircle size={14} className="spin" />}
        {children}
      </button>
      <Feedback error={error} />
    </div>
  );
}

export function ProfileForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");
    setMessage("");
    try {
      const r = await post("profiles", {
        usernames: values.get("usernames"),
        publicConfirmed: values.get("publicConfirmed") === "on",
      });
      setMessage(r.message);
      form.reset();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        className="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Plus size={17} /> Profil əlavə et
      </button>
      {open && (
        <form className="panel add-form" onSubmit={submit}>
          <h2>İzlənəcək profillər</h2>
          <label htmlFor="usernames">İstifadəçi adları</label>
          <textarea
            id="usernames"
            name="usernames"
            required
            rows={5}
            placeholder={"instagram\nnatgeo\n@profil_adi"}
          />
          <p className="muted text-small">
            Hər sətrə bir ad və ya profil linki yazın. Bir dəfədə 1500 profil
            əlavə edə bilərsiniz.
          </p>
          <label className="check">
            <input type="checkbox" name="publicConfirmed" required /> Bu
            profillər ictimaidir və məlumatlarını toplamağa icazəm var.
          </label>
          <div className="button-row">
            <button className="button" disabled={pending}>
              {pending ? "Əlavə edilir…" : "Profilləri əlavə et"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setOpen(false)}
            >
              Bağla
            </button>
          </div>
          <Feedback error={error} message={message} />
        </form>
      )}
    </div>
  );
}

export function PairDevice() {
  const [pending, setPending] = useState(false),
    [code, setCode] = useState(""),
    [error, setError] = useState("");
  return (
    <div>
      <button
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const r = await post("pairing", {});
            setCode(r.code);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <Smartphone size={17} />
        {pending ? "Hazırlanır…" : "Cihaz qoş"}
      </button>
      {code && (
        <div className="panel pairing" role="status">
          <h2>Android agenti qoşun</h2>
          <p>APK-də server ünvanını və bu kodu yazın:</p>
          <code className="pairing-code">{code}</code>
          <p className="muted text-small">
            Kod bir cihaz üçündür. 15 dəqiqədən sonra vaxtı bitir.
          </p>
          <button
            className="button secondary small"
            onClick={() => setCode("")}
          >
            Bağla
          </button>
        </div>
      )}
      <Feedback error={error} />
    </div>
  );
}

export function SearchForm({
  from,
  to,
  profile,
  today,
  intervalSeconds,
}: {
  from: string;
  to: string;
  profile: string;
  today: string;
  intervalSeconds: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const collect =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !==
      "archive";
    const params = new URLSearchParams();
    for (const key of ["from", "to", "profile"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (collect) {
        const r = await post("collect", {
          from: params.get("from"),
          to: params.get("to"),
          profile: params.get("profile") || "",
        });
        setMessage(r.message);
      }
      router.push("/?" + params);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="panel search-panel" onSubmit={submit}>
      <div className="search-fields">
        <div className="field wide">
          <label htmlFor="profile">Profil</label>
          <input
            key={profile}
            id="profile"
            name="profile"
            defaultValue={profile}
            maxLength={30}
            placeholder="Bütün aktiv profillər"
          />
        </div>
        <div className="field">
          <label htmlFor="from">Başlanğıc</label>
          <input
            key={from}
            id="from"
            name="from"
            type="date"
            required
            defaultValue={from}
            min="2010-01-01"
            max={today}
          />
        </div>
        <div className="field">
          <label htmlFor="to">Bitiş</label>
          <input
            key={to}
            id="to"
            name="to"
            type="date"
            required
            defaultValue={to}
            min="2010-01-01"
            max={today}
          />
        </div>
      </div>
      <div className="search-bottom">
        <div className="search-actions">
          <button
            className="button"
            type="submit"
            value="collect"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Smartphone size={17} />
            )}{" "}
            Topla və göstər
          </button>
          <button
            className="button secondary"
            type="submit"
            value="archive"
            disabled={pending}
          >
            <Search size={17} /> Arxivə bax
          </button>
        </div>
        <span className="muted text-small">
          Hər iki tarix daxildir · Bakı vaxtı · Yeni aralıq əvvəlki tapşırığı
          əvəz edir.
        </span>
      </div>
      <p className="muted text-small">
        Toplama intervalı: {intervalSeconds} saniyə.{" "}
        <a href="/tasks#collection-settings" className="text-link">
          Intervalı dəyiş / irəliləyişə bax ↗
        </a>
      </p>
      <Feedback error={error} message={message} />
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setPending(true);
        setError("");
        try {
          await post("login", { password: data.get("password") }, "/api/auth/");
          router.replace("/");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor="password">Admin şifrəsi</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
      />
      <button className="button full" disabled={pending}>
        {pending ? "Yoxlanılır…" : "Daxil ol"}
        <ArrowRight size={17} />
      </button>
      <Feedback error={error} />
    </form>
  );
}
export function Logout() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="logout"
        onClick={async () => {
          try {
            await post("logout", {}, "/api/auth/");
            router.replace("/login");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <LogOut size={16} />
        Çıxış
      </button>
      <Feedback error={error} />
    </div>
  );
}
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
