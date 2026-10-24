"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Səhifə yüklənmədi</h1>
      <p>Server və ya verilənlər bazası ilə əlaqə alınmadı.</p>
      <button className="button" onClick={reset}>
        Yenidən cəhd et
      </button>
    </main>
  );
}
