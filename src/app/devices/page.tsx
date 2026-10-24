import { Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/filters";
import { Shell, PageHeading, Empty } from "@/components/shell";
import { ActionButton, AutoRefresh, PairDevice } from "@/components/controls";
export default async function Devices() {
  await requirePageAdmin();
  const devices = await db.device.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <Shell active="/devices">
      <AutoRefresh />
      <PageHeading
        eyebrow="ANDROID AGENTLƏR"
        title="Cihazlar"
        description="Eyni APK-ni bir neçə cihazda quraşdırın. Tapşırıqlar avtomatik bölüşdürülür."
        action={<PairDevice />}
      />
      <div className="setup-guide panel">
        <div>
          <span className="step">01</span>
          <h2>APK-ni quraşdırın</h2>
          <p>Android 8 və ya daha yeni versiyada agenti açın.</p>
        </div>
        <div>
          <span className="step">02</span>
          <h2>Serverə qoşulun</h2>
          <p>Server ünvanını və birdəfəlik qoşulma kodunu yazın.</p>
        </div>
        <div>
          <span className="step">03</span>
          <h2>Toplamanı başladın</h2>
          <p>
            Instagram girişini manual tamamlayın. Tətbiqi ekranda açıq saxlayın.
          </p>
        </div>
      </div>
      <section className="panel">
        {!devices.length ? (
          <Empty title="Hələ cihaz qoşulmayıb" icon={Smartphone}>
            <p>“Cihaz qoş” düyməsi ilə birdəfəlik kod yaradın.</p>
          </Empty>
        ) : (
          <div
            className="table-wrapper"
            tabIndex={0}
            role="region"
            aria-label="Android cihazları"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Cihaz</th>
                  <th scope="col">Bağlantı</th>
                  <th scope="col">Vəziyyət</th>
                  <th scope="col">Son əlaqə</th>
                  <th scope="col">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const online =
                    d.enabled && d.lastSeenAt.getTime() > Date.now() - 180000;
                  return (
                    <tr key={d.id}>
                      <th scope="row">
                        {d.name}
                        <span className="muted text-small block">
                          v{d.appVersion}
                        </span>
                      </th>
                      <td data-label="Bağlantı">
                        <span
                          className={`status ${online ? "green" : "neutral"}`}
                        >
                          <span />
                          {!d.enabled
                            ? "Söndürülüb"
                            : online
                              ? "Onlayn"
                              : "Oflayn"}
                        </span>
                      </td>
                      <td data-label="Vəziyyət">
                        {d.state === "COOLDOWN"
                          ? "Instagram fasiləsi"
                          : d.state === "NEEDS_LOGIN"
                            ? "Instagram girişi tələb olunur"
                            : d.state === "WAITING_USER"
                              ? "Manual müdaxilə"
                              : d.state === "RUNNING"
                                ? "Toplayır"
                                : "Gözləyir"}
                      </td>
                      <td data-label="Son əlaqə">{dateTime(d.lastSeenAt)}</td>
                      <td data-label="Əməliyyat">
                        <ActionButton
                          action="device-toggle"
                          payload={{ id: d.id, enabled: !d.enabled }}
                        >
                          {d.enabled ? "Söndür" : "Aktivləşdir"}
                        </ActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
