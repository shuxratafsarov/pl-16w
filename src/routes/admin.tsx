import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  verifyAdminPassword,
  listWeeksFromDb,
  seedWeeksFromJson,
  uploadExcel,
  deleteWeek,
  syncToAntria,
} from "@/lib/admin.functions";
import type { WeekData } from "@/lib/types";

export const Route = createFileRoute("/admin")({ component: AdminPage });

const PWD_KEY = "admin_pwd";

// Локальные JSON для сидинга
const WEEK_JSON_MODULES = import.meta.glob("@/data/week*.json", { eager: true, import: "default" }) as Record<string, WeekData>;
const MONTHLY_JSON = (await import("@/data/monthly.json")).default as any[];

function gatherJsonWeeks() {
  const arr: { week: number; period: string; data: WeekData }[] = [];
  for (const path in WEEK_JSON_MODULES) {
    const m = path.match(/week(\d+)\.json$/);
    if (!m) continue;
    const w = WEEK_JSON_MODULES[path];
    arr.push({ week: Number(m[1]), period: w.period, data: w });
  }
  arr.sort((a, b) => a.week - b.week);
  return arr;
}

function AdminPage() {
  const [pwd, setPwd] = useState<string>(() => sessionStorage.getItem(PWD_KEY) ?? "");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbWeeks, setDbWeeks] = useState<{ week: number; period: string }[]>([]);
  const [syncResult, setSyncResult] = useState<any>(null);

  const verifyFn = useServerFn(verifyAdminPassword);
  const listFn = useServerFn(listWeeksFromDb);
  const seedFn = useServerFn(seedWeeksFromJson);
  const uploadFn = useServerFn(uploadExcel);
  const deleteFn = useServerFn(deleteWeek);
  const syncFn = useServerFn(syncToAntria);

  async function refresh() {
    const r = await listFn();
    setDbWeeks(r.weeks.map((w: any) => ({ week: w.week, period: w.period })));
  }

  useEffect(() => {
    if (pwd) tryLogin(pwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryLogin(p: string) {
    setLoading(true);
    try {
      const r = await verifyFn({ data: { password: p } });
      if (r.ok) {
        sessionStorage.setItem(PWD_KEY, p);
        setAuthed(true);
        await refresh();
      } else {
        toast.error("Неверный пароль");
        sessionStorage.removeItem(PWD_KEY);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setLoading(true);
    try {
      const weeks = gatherJsonWeeks();
      const monthly = MONTHLY_JSON.map((m: any) => ({ month: m.month, data: m }));
      const r: any = await seedFn({ data: { password: pwd, weeks, monthly } });
      toast.success(`Засеяно ${r.weeks} недель и ${r.months} месяцев`);
      if (r.sync) { setSyncResult(r.sync); toastSync(r.sync); }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      // base64 encode
      let bin = "";
      const u8 = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < u8.length; i += chunk) {
        bin += String.fromCharCode(...u8.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(bin);
      const r = await uploadFn({ data: { password: pwd, fileBase64, replaceAll: true } });
      toast.success(`Загружено: недель ${r.weeksParsed}, месяцев ${r.monthsParsed}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(week: number) {
    if (!confirm(`Удалить неделю ${week}?`)) return;
    setLoading(true);
    try {
      await deleteFn({ data: { password: pwd, week } });
      toast.success(`Неделя ${week} удалена`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="p-6 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-semibold">Админка — вход</h1>
          <Input
            type="password"
            placeholder="Пароль"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryLogin(pwd)}
            autoFocus
          />
          <Button className="w-full" disabled={loading || !pwd} onClick={() => tryLogin(pwd)}>
            Войти
          </Button>
          <Link to="/" className="text-sm text-muted-foreground hover:underline block text-center">
            ← Дашборд
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Управление данными</h1>
          <div className="flex gap-2">
            <Link to="/"><Button variant="outline">К дашборду</Button></Link>
            <Button variant="ghost" onClick={() => { sessionStorage.removeItem(PWD_KEY); setAuthed(false); setPwd(""); }}>
              Выйти
            </Button>
          </div>
        </div>

        <Card className="p-6 space-y-3">
          <h2 className="font-semibold">Загрузить Excel (.xlsx)</h2>
          <p className="text-sm text-muted-foreground">
            Парсит листы <code>3PL_weekly</code> и <code>3PL_monthly</code> и полностью заменяет данные в БД.
            Применяются те же правила: маркеры M1–M4, флаг <code>is_auto</code> для MKO (А), <code>is_hk_danger</code> для HONGKONG.
          </p>
          <Input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} />
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="font-semibold">Засеять из встроенных JSON</h2>
          <p className="text-sm text-muted-foreground">
            Заливает в БД те же данные, что сейчас зашиты в коде ({Object.keys(WEEK_JSON_MODULES).length} недель + {MONTHLY_JSON.length} месяцев). Полезно для первичной инициализации.
          </p>
          <Button onClick={handleSeed} disabled={loading}>Засеять</Button>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="font-semibold">Недели в БД ({dbWeeks.length})</h2>
          {dbWeeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">База пустая. Дашборд показывает данные из встроенных JSON.</p>
          ) : (
            <div className="divide-y">
              {dbWeeks.map((w) => (
                <div key={w.week} className="flex items-center justify-between py-2">
                  <span className="font-mono text-sm">W{w.week} · {w.period}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(w.week)} disabled={loading}>
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
