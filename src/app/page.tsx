"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type {
  DeclarationInfo,
  IbkrData,
  DpsIncomeRow,
  TaxResult,
  AppPhase,
  LotWithRates,
  DividendWithRates,
} from "@/lib/types";
import { parseIbkrXml } from "@/lib/parse-ibkr";
import { parseDpsXml } from "@/lib/parse-dps";
import { calculateTax, CATEGORY_LABELS } from "@/lib/tax-calc";
import { generateMainXml, generateF1Xml, downloadFile } from "@/lib/xml-gen";
import { loadInfo, saveInfo } from "@/lib/storage";

function fmtUah(n: number, hide?: boolean): string {
  if (hide) return "••••••";
  return n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(0, 4)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  "10.1": "bg-sky-500", "10.2": "bg-blue-500", "10.3": "bg-indigo-500",
  "10.4": "bg-violet-500", "10.5": "bg-teal-500", "10.6": "bg-cyan-500",
  "10.7": "bg-slate-500", "10.8": "bg-purple-500", "10.9": "bg-rose-500",
  "10.10": "bg-pink-500", "10.11": "bg-amber-500", "10.12": "bg-orange-500",
  "10.13": "bg-lime-500", "10.14": "bg-emerald-500", "10.15": "bg-green-500",
  "11.1": "bg-yellow-500", "11.2": "bg-stone-500", "11.3": "bg-zinc-500",
};

const CATEGORY_HINTS: Record<string, string> = {
  "10.1": "Заробітна плата та інші виплати за трудовим договором. ПДФО 18%, ВЗ 5% — сплачує роботодавець.",
  "10.2": "Доходи за цивільно-правовими договорами (ГПХ). ПДФО 18%, ВЗ 5% — сплачує замовник.",
  "10.4": "Дивіденди від українських компаній. ПДФО 9%, ВЗ 5% — утримується компанією.",
  "10.5": "Доходи від продажу нерухомості та рухомого майна. ПДФО 5%, ВЗ 5%.",
  "10.6": "Орендна плата. ПДФО 18%, ВЗ 5% — сплачує орендар.",
  "10.8": "Інвестиційний прибуток від операцій з цінними паперами (IBKR). ПДФО 18%, ВЗ 5% — сплачуєте самостійно.",
  "10.9": "Подарунки, призи, виграші. ПДФО 18%, ВЗ 5%.",
  "10.10": "Доходи з-за кордону: IBKR дивіденди, Upwork, Google, YouTube тощо. ПДФО 9%, ВЗ 5% — сплачуєте самостійно.",
  "10.13": "Інші доходи: кешбек, бонуси. ПДФО 18%, ВЗ 5%.",
  "11.1": "Доходи фізичної особи-підприємця. Не оподатковуються у цій декларації.",
  "11.3": "Неоподатковувані доходи. Відображаються, але не підлягають оподаткуванню.",
};

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [info, setInfo] = useState<DeclarationInfo>(() => loadInfo());
  const [ibkrData, setIbkrData] = useState<IbkrData | null>(null);
  const [dpsRows, setDpsRows] = useState<DpsIncomeRow[]>([]);
  const [result, setResult] = useState<TaxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ibkrFileName, setIbkrFileName] = useState<string | null>(null);
  const [dpsFileName, setDpsFileName] = useState<string | null>(null);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);

  useEffect(() => { saveInfo(info); }, [info]);

  const updateField = useCallback(
    <K extends keyof DeclarationInfo>(key: K, value: DeclarationInfo[K]) => {
      setInfo((prev) => ({ ...prev, [key]: value }));
    }, []
  );

  const handleIbkrFile = useCallback((file: File) => {
    file.text().then((text) => {
      try {
        setIbkrData(parseIbkrXml(text));
        setIbkrFileName(file.name);
        setError(null);
      } catch (err) {
        setError(`Помилка парсингу IBKR: ${err instanceof Error ? err.message : "невідома"}`);
      }
    });
  }, []);

  const handleDpsFile = useCallback((file: File) => {
    file.text().then((text) => {
      try {
        setDpsRows(parseDpsXml(text));
        setDpsFileName(file.name);
        setError(null);
      } catch (err) {
        setError(`Помилка парсингу ДПС: ${err instanceof Error ? err.message : "невідома"}`);
      }
    });
  }, []);

  const handleProcess = useCallback(async () => {
    setPhase("processing");
    setError(null);
    try {
      setProgressLabel("Читання файлів...");
      setProgressValue(10);
      await new Promise((r) => setTimeout(r, 200));
      setProgressLabel("Завантаження курсів НБУ...");
      setProgressValue(30);
      const r = await calculateTax(info, ibkrData, dpsRows);
      setProgressLabel("Розрахунок податків...");
      setProgressValue(80);
      await new Promise((r) => setTimeout(r, 300));
      setProgressValue(100);
      setProgressLabel("Готово!");
      await new Promise((r) => setTimeout(r, 400));
      setResult(r);
      setPhase("report");
    } catch (err) {
      setError(`Помилка: ${err instanceof Error ? err.message : "невідома"}`);
      setPhase("upload");
    }
  }, [info, ibkrData, dpsRows]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const uuid = crypto.randomUUID();
    const hasF1 = result.lots.length > 0;
    const mainXml = generateMainXml(info, result, uuid, hasF1);
    downloadFile(mainXml, `F0100215_Zvit_${uuid}.xml`);
    if (hasF1) {
      setTimeout(() => {
        const f1Xml = generateF1Xml(info, result, uuid);
        downloadFile(f1Xml, `F0121215_DodatokF1_${uuid}.xml`);
      }, 500);
    }
  }, [info, result]);

  const handleReset = useCallback(() => {
    setPhase("upload");
    setResult(null);
    setIbkrData(null);
    setDpsRows([]);
    setIbkrFileName(null);
    setDpsFileName(null);
    setProgressValue(0);
  }, []);

  const hasFiles = ibkrData !== null || dpsRows.length > 0;

  const isFormValid =
    info.fullName.trim() !== "" &&
    /^\d{10}$/.test(info.tin) &&
    /^\d{4}$/.test(info.stiCode) &&
    info.city.trim() !== "" &&
    info.street.trim() !== "" &&
    hasFiles;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-bold tracking-tight cursor-pointer" onClick={phase === "report" ? handleReset : undefined}>
              DeclarUA
            </h1>
            {phase === "report" && (
              <span className="text-xs text-muted-foreground hidden sm:inline">Звіт за {info.year} рік</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {phase === "report" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="hide-amounts" className="text-xs text-muted-foreground cursor-pointer">Сховати суми</Label>
                <Switch id="hide-amounts" checked={hideAmounts} onCheckedChange={setHideAmounts} />
              </div>
            )}
            <span className="text-xs text-muted-foreground hidden md:inline">Дані не передаються на сервер</span>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">
        {error && <Alert variant="destructive" className="mb-6"><AlertDescription>{error}</AlertDescription></Alert>}

        {phase === "upload" && (
          <UploadPhase info={info} updateField={updateField} ibkrData={ibkrData} dpsRows={dpsRows}
            ibkrFileName={ibkrFileName} dpsFileName={dpsFileName} onIbkrFile={handleIbkrFile}
            onDpsFile={handleDpsFile} onProcess={handleProcess} isFormValid={isFormValid} />
        )}
        {phase === "processing" && <ProcessingPhase label={progressLabel} value={progressValue} />}
        {phase === "report" && result && (
          <ReportPhase info={info} result={result} dpsRows={dpsRows} ibkrData={ibkrData}
            hideAmounts={hideAmounts} onReset={handleReset} onDownload={() => setXmlModalOpen(true)} updateField={updateField} />
        )}
      </main>

      {result && (
        <XmlPreviewModal open={xmlModalOpen} onClose={() => setXmlModalOpen(false)}
          result={result} info={info} hideAmounts={hideAmounts} onDownload={handleDownload} />
      )}

      <footer className="border-t border-border mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">DeclarUA — open source. Не є юридичною консультацією.</p>
          {phase === "report" && (
            <a href="https://send.monobank.ua/jar/2FaPPcisEC" target="_blank" rel="noopener noreferrer"
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Підтримати ЗСУ — FPV дрони для фронту
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Upload Phase ──

function UploadPhase({ info, updateField, ibkrData, dpsRows, ibkrFileName, dpsFileName, onIbkrFile, onDpsFile, onProcess, isFormValid }: {
  info: DeclarationInfo;
  updateField: <K extends keyof DeclarationInfo>(key: K, value: DeclarationInfo[K]) => void;
  ibkrData: IbkrData | null; dpsRows: DpsIncomeRow[];
  ibkrFileName: string | null; dpsFileName: string | null;
  onIbkrFile: (file: File) => void; onDpsFile: (file: File) => void;
  onProcess: () => void; isFormValid: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2 py-4">
        <h2 className="text-xl font-semibold">Завантажте XML файли</h2>
        <p className="text-sm text-muted-foreground">Оберіть хоча б один файл для обробки</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DropZone label="Відомості з ДПС" subtitle="Форма F1419104 — XML з Державного реєстру" icon="🏛️"
          fileName={dpsFileName} fileInfo={dpsRows.length > 0 ? `${dpsRows.length} записів` : null} onFile={onDpsFile}
          helpTitle="Як отримати цей файл?" helpSteps={[
            { text: "Увійдіть до кабінету платника податків → cabinet.tax.gov.ua" },
            { text: "Перейдіть у розділ «Запити» → «Запит на отримання відомостей з Державного реєстру»" },
            { text: "Оберіть форму F1419104 «Відомості з Державного реєстру фізичних осіб — платників податків про суми виплачених доходів»" },
            { text: "Вкажіть звітний період — потрібний рік (наприклад, 01.01.2025 — 31.12.2025)" },
            { text: "Підпишіть запит КЕП та надішліть" },
            { text: "Дочекайтесь відповіді (зазвичай кілька хвилин) → завантажте XML файл з відповіді" },
          ]} />
        <DropZone label="Flex-запит IBKR" subtitle="Завантаження Flex-запитів Interactive Brokers" icon="📈"
          fileName={ibkrFileName} fileInfo={ibkrData ? `${ibkrData.lots.length} угод, ${ibkrData.dividends.length} дивідендів` : null}
          onFile={onIbkrFile} helpTitle="Як сформувати Flex-запит?" helpSteps={[
            { text: "Увійдіть до облікового запису Interactive Brokers → interactivebrokers.com" },
            { text: "Перейдіть у вкладку Performance & Reports → Flex Queries" },
            { text: "У таблиці Activity Flex Query натисніть + та вкажіть ім'я в полі Query Name" },
            { text: "У Sections оберіть та налаштуйте:", sub: [
              "Cash Transaction → Dividends, Payment in Lieu of Dividends, Withholding Tax, 871(m) Withholding, Other Income, Brokers interest received, Bond Interest Paid, Bond Interest Received, Detail → Select all → Save",
              "Corporate Actions → Detail → Select all → Save",
              "Grant Activity → Detail → Select all → Save",
              "Trades → Closed Lots, Execution (якщо були операції з опціонами) → Select all → Save",
            ]},
            { text: "Display Account Alias in Place of Account ID? → Yes" },
            { text: "Натисніть Continue → Create → Ok" },
            { text: "У рядку з вашим запитом натисніть стрілку → Run" },
            { text: "Оберіть Period → Custom Date Range та вкажіть рік (наприклад, 01.01.2025 — 31.12.2025)" },
            { text: "Натисніть Run, дочекайтесь формування та завантажте XML-файл" },
          ]} />
      </div>

      <Separator />

      <Card>
        <CardHeader><CardTitle className="text-base">Дані для декларації</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="year">Рік</Label>
              <Input id="year" type="number" value={info.year} onChange={(e) => updateField("year", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">ПІБ</Label>
              <Input id="fullName" placeholder="Іваненко Іван Іванович" value={info.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tin">ІПН</Label>
              <Input id="tin" placeholder="1234567890" maxLength={10} value={info.tin}
                onChange={(e) => updateField("tin", e.target.value.replace(/\D/g, ""))} className="font-mono" />
              {info.tin && !/^\d{10}$/.test(info.tin) && <p className="text-xs text-destructive">ІПН має містити 10 цифр</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="stiCode">Код ДПІ</Label>
              <Input id="stiCode" placeholder="2655" maxLength={4} value={info.stiCode}
                onChange={(e) => updateField("stiCode", e.target.value.replace(/\D/g, ""))} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prevLoss">Збиток попередніх років, ₴</Label>
              <Input id="prevLoss" type="number" min={0} step={0.01} value={info.prevLoss || ""}
                onChange={(e) => updateField("prevLoss", parseFloat(e.target.value) || 0)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Місто</Label>
              <Input id="city" placeholder="Київ" value={info.city} onChange={(e) => updateField("city", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="street">Вулиця</Label>
              <Input id="street" placeholder="вул. Хрещатик, 1, кв. 1" value={info.street} onChange={(e) => updateField("street", e.target.value)} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Checkbox id="foreignTaxCredit" checked={info.applyForeignTaxCredit}
                onCheckedChange={(checked) => updateField("applyForeignTaxCredit", checked === true)} />
              <Label htmlFor="foreignTaxCredit" className="text-sm">Зарахувати іноземний податок (п.18 декларації)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center space-y-3">
        <Button size="lg" onClick={onProcess} disabled={!isFormValid} className="px-8">Обробити файли</Button>
        {!isFormValid && <p className="text-xs text-muted-foreground">Заповніть всі поля та завантажте хоча б один файл</p>}
      </div>
    </div>
  );
}

// ── Drop Zone ──

interface HelpStep {
  text: string;
  sub?: string[];
}

function DropZone({ label, subtitle, icon, fileName, fileInfo, onFile, helpTitle, helpSteps }: {
  label: string; subtitle: string; icon: string;
  fileName: string | null; fileInfo: string | null;
  onFile: (file: File) => void; helpTitle: string; helpSteps: HelpStep[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const isLoaded = fileName !== null;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xml") || file.type.includes("xml"))) onFile(file);
  }, [onFile]);

  return (
    <div onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={handleDrop}
      className={`relative cursor-pointer rounded-lg border-2 border-dashed p-6 transition-all duration-200
        ${dragging ? "border-blue-500 bg-blue-500/10 scale-[1.02]"
          : isLoaded ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"}`}>
      <input ref={inputRef} type="file" accept=".xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="hidden" />
      <div className="text-center space-y-2">
        <div className="text-3xl">{isLoaded ? "✅" : icon}</div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {isLoaded && (
          <div className="space-y-1 pt-1">
            <p className="text-xs text-emerald-400 truncate">{fileName}</p>
            {fileInfo && <Badge variant="secondary" className="text-xs">{fileInfo}</Badge>}
          </div>
        )}
      </div>
      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleTrigger className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
            {helpTitle}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
              {helpSteps.map((step, i) => (
                <div key={i}>
                  <p>{i + 1}. {step.text}</p>
                  {step.sub && (
                    <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-muted-foreground/80">
                      {step.sub.map((s, j) => <li key={j}>{s}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

// ── Processing Phase ──

function ProcessingPhase({ label, value }: { label: string; value: number }) {
  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[50vh] space-y-6">
      <div className="text-4xl animate-pulse">⏳</div>
      <div className="w-full space-y-3">
        <Progress value={value} className="h-2" />
        <p className="text-sm text-center text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Report Phase ──

function ReportPhase({ info, result, dpsRows, ibkrData, hideAmounts, onReset, onDownload, updateField }: {
  info: DeclarationInfo; result: TaxResult; dpsRows: DpsIncomeRow[]; ibkrData: IbkrData | null;
  hideAmounts: boolean; onReset: () => void; onDownload: () => void;
  updateField: <K extends keyof DeclarationInfo>(key: K, value: DeclarationInfo[K]) => void;
}) {
  const h = hideAmounts;
  const totalTx = result.lots.length + result.dividends.length + dpsRows.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Результати за {info.year} рік</h2>
          <p className="text-xs text-muted-foreground">
            {ibkrData ? `IBKR: ${ibkrData.accountId}` : ""}{ibkrData && dpsRows.length > 0 ? " · " : ""}
            {dpsRows.length > 0 ? `ДПС: ${dpsRows.length} записів` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>Нові файли</Button>
          <Button size="sm" onClick={onDownload}>Згенерувати XML</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Категорій" value={String(result.categories.length)} />
        <StatCard label="Транзакцій" value={String(totalTx)} />
        <StatCard label="Оподатковуваний дохід" value={`${fmtUah(result.totalIncome, h)} ₴`} large />
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Податки</p>
          {(result.agentPaidPdfo > 0 || result.agentPaidVz > 0) && (
            <p className="text-xs text-emerald-400">Сплачено: {fmtUah(result.agentPaidPdfo + result.agentPaidVz, h)} ₴</p>
          )}
          <p className="text-sm font-bold text-amber-400">До сплати: {fmtUah(result.pdfoToPay + result.vzToPay, h)} ₴</p>
          <p className="text-xs text-muted-foreground mt-0.5">ПДФО {fmtUah(result.pdfoToPay, h)} + ВЗ {fmtUah(result.vzToPay, h)}</p>
        </Card>
      </div>

      {result.dividends.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox id="ftc-report" checked={info.applyForeignTaxCredit}
            onCheckedChange={(checked) => updateField("applyForeignTaxCredit", checked === true)} />
          <Label htmlFor="ftc-report" className="text-sm">Зарахувати іноземний податок (п.18)</Label>
          {result.foreignTaxCredit > 0 && <Badge variant="secondary" className="text-emerald-400">-{fmtUah(result.foreignTaxCredit, h)} ₴</Badge>}
        </div>
      )}

      <div className="space-y-3">
        {result.categories.map((cat) => (
          <CategoryAccordion key={cat.category} category={cat}
            lots={cat.category === "10.8" ? result.lots : []}
            dividends={cat.category === "10.10" ? result.dividends : []}
            dpsRows={dpsRows.filter((r) => r.category === cat.category)}
            hide={h} exchangeRateDiff={cat.category === "10.8" ? result.exchangeRateDiff : 0}
            totalCommissionUsd={cat.category === "10.8" ? result.totalCommissionUsd : 0}
            totalProceedsUah={cat.category === "10.8" ? result.totalProceedsUah : 0}
            totalCostUah={cat.category === "10.8" ? result.totalCostUah : 0} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono ${large ? "text-sm font-bold" : "text-xl font-bold"}`}>{value}</p>
    </Card>
  );
}

// ── Category Accordion ──

function CategoryAccordion({ category, lots, dividends, dpsRows, hide, exchangeRateDiff, totalCommissionUsd, totalProceedsUah, totalCostUah }: {
  category: { category: string; label: string; amount: number; pdfo: number; vz: number; agentPaid: boolean; pdfoRate: number; vzRate: number };
  lots: LotWithRates[]; dividends: DividendWithRates[]; dpsRows: DpsIncomeRow[];
  hide: boolean; exchangeRateDiff: number; totalCommissionUsd: number; totalProceedsUah: number; totalCostUah: number;
}) {
  const [open, setOpen] = useState(false);
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(true);

  const color = CATEGORY_COLORS[category.category] ?? "bg-zinc-500";
  const hint = CATEGORY_HINTS[category.category];
  const isNonTaxable = ["11.1", "11.2", "11.3"].includes(category.category);
  const txCount = lots.length + dividends.length + dpsRows.length;

  const tickers = useMemo(() => {
    const set = new Set<string>();
    lots.forEach((l) => set.add(l.symbol));
    dividends.forEach((d) => set.add(d.symbol));
    return Array.from(set).sort();
  }, [lots, dividends]);

  const filteredLots = tickerFilter ? lots.filter((l) => l.symbol === tickerFilter) : lots;
  const filteredDivs = tickerFilter ? dividends.filter((d) => d.symbol === tickerFilter) : dividends;

  const groupedLots = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, { symbol: string; qty: number; costUah: number; proceedsUah: number; pnlUah: number; count: number }>();
    for (const l of filteredLots) {
      const g = map.get(l.symbol) ?? { symbol: l.symbol, qty: 0, costUah: 0, proceedsUah: 0, pnlUah: 0, count: 0 };
      g.qty += l.quantity; g.costUah += l.costUah; g.proceedsUah += l.proceedsUah; g.pnlUah += l.pnlUah; g.count++;
      map.set(l.symbol, g);
    }
    return Array.from(map.values());
  }, [filteredLots, grouped]);

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors"
      >
        <div className={`w-1 h-8 rounded-full ${color}`} />
        <Badge variant="outline" className="font-mono text-xs shrink-0">р.{category.category}</Badge>
        <span className="text-sm font-medium flex-1 truncate">{category.label}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">{txCount} операцій</span>
        <span className="font-mono text-sm font-semibold">{fmtUah(category.amount, hide)} ₴</span>
        <span className={`text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="ml-4 pl-4 border-l-2 border-border space-y-4 py-4">
          {hint && (
            <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <span className="shrink-0">💡</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          )}

          {!isNonTaxable && (
            <div className="grid grid-cols-2 gap-3">
              <Card className={`p-3 ${category.agentPaid ? "border-emerald-500/30" : "border-amber-500/30"}`}>
                <p className="text-xs text-muted-foreground">ПДФО {Math.round(category.pdfoRate * 100)}% {category.agentPaid ? "(агент)" : "(самостійно)"}</p>
                <p className={`font-mono text-sm font-bold ${category.agentPaid ? "text-emerald-400" : "text-amber-400"}`}>{fmtUah(category.pdfo, hide)} ₴</p>
              </Card>
              <Card className={`p-3 ${category.agentPaid ? "border-emerald-500/30" : "border-amber-500/30"}`}>
                <p className="text-xs text-muted-foreground">ВЗ 5% {category.agentPaid ? "(агент)" : "(самостійно)"}</p>
                <p className={`font-mono text-sm font-bold ${category.agentPaid ? "text-emerald-400" : "text-amber-400"}`}>{fmtUah(category.vz, hide)} ₴</p>
              </Card>
            </div>
          )}

          {lots.length > 0 && (
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Підсумок операцій</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-muted-foreground">Дохід від продажу</p><p className="font-mono font-semibold">{fmtUah(totalProceedsUah, hide)} ₴</p></div>
                <div><p className="text-muted-foreground">Собівартість</p><p className="font-mono font-semibold">{fmtUah(totalCostUah, hide)} ₴</p></div>
                {totalCommissionUsd > 0 && <div><p className="text-muted-foreground">Комісія брокера</p><p className="font-mono font-semibold">${totalCommissionUsd.toFixed(2)}</p></div>}
                <div><p className="text-muted-foreground">Прибуток (FIFO)</p><p className={`font-mono font-semibold ${category.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUah(category.amount, hide)} ₴</p></div>
              </div>
              {exchangeRateDiff !== 0 && (
                <div className="mt-3 pt-3 border-t border-dashed border-border">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs text-muted-foreground">Курсова різниця:</p>
                    <p className={`font-mono text-xs font-semibold ${exchangeRateDiff > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {exchangeRateDiff > 0 ? "+" : ""}{fmtUah(exchangeRateDiff, hide)} ₴
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {exchangeRateDiff > 0
                      ? "Додатковий дохід через зростання курсу між купівлею та продажем."
                      : "Зменшення доходу через падіння курсу між купівлею та продажем."}
                  </p>
                </div>
              )}
            </Card>
          )}

          {tickers.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Button variant={tickerFilter === null ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setTickerFilter(null)}>Всі</Button>
              {tickers.map((t) => (
                <Button key={t} variant={tickerFilter === t ? "default" : "outline"} size="sm" className="h-7 text-xs font-mono"
                  onClick={() => setTickerFilter(tickerFilter === t ? null : t)}>
                  <TickerLogo symbol={t} />{t}
                </Button>
              ))}
            </div>
          )}

          {lots.length > 0 && (
            <div className="flex gap-1.5">
              <Button variant={grouped ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setGrouped(true)}>По тікерах</Button>
              <Button variant={!grouped ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setGrouped(false)}>Кожна угода</Button>
            </div>
          )}

          {lots.length > 0 && (
            <div className="overflow-x-auto">
              {grouped && groupedLots ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Тікер</TableHead><TableHead className="text-right">Угод</TableHead>
                    <TableHead className="text-right">Витрати, ₴</TableHead><TableHead className="text-right">Дохід, ₴</TableHead>
                    <TableHead className="text-right">P&L, ₴</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {groupedLots.map((g) => (
                      <TableRow key={g.symbol}>
                        <TableCell className="font-mono font-medium"><TickerLogo symbol={g.symbol} />{g.symbol}</TableCell>
                        <TableCell className="text-right">{g.count}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUah(g.costUah, hide)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtUah(g.proceedsUah, hide)}</TableCell>
                        <TableCell className={`text-right font-mono font-medium ${g.pnlUah >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUah(g.pnlUah, hide)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Тікер</TableHead><TableHead className="text-right">К-ть</TableHead>
                    <TableHead>Купівля</TableHead><TableHead>Продаж</TableHead>
                    <TableHead className="text-right">Витрати, ₴</TableHead><TableHead className="text-right">Дохід, ₴</TableHead>
                    <TableHead className="text-right">P&L, ₴</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredLots.map((lot, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono font-medium"><TickerLogo symbol={lot.symbol} />{lot.symbol}</TableCell>
                        <TableCell className="text-right font-mono">{lot.quantity}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block text-xs">{fmtDate(lot.buyDate)}</span>
                          <span className="block text-xs text-muted-foreground/60">{lot.buyRate.toFixed(4)}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block text-xs">{fmtDate(lot.sellDate)}</span>
                          <span className="block text-xs text-muted-foreground/60">{lot.sellRate.toFixed(4)}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtUah(lot.costUah, hide)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtUah(lot.proceedsUah, hide)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs font-medium ${lot.pnlUah >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUah(lot.pnlUah, hide)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {dividends.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Тікер</TableHead><TableHead>Дата</TableHead>
                  <TableHead className="text-right">Сума, $</TableHead><TableHead className="text-right">Податок, $</TableHead>
                  <TableHead className="text-right">Курс</TableHead><TableHead className="text-right">Сума, ₴</TableHead>
                  <TableHead className="text-right">Податок, ₴</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredDivs.map((div, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono font-medium"><TickerLogo symbol={div.symbol} />{div.symbol}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{fmtDate(div.date)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{div.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{div.withholdingTax.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{div.rate.toFixed(4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtUah(div.amountUah, hide)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmtUah(div.withholdingTaxUah, hide)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {dpsRows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Джерело</TableHead><TableHead className="text-right">Дохід, ₴</TableHead>
                  <TableHead className="text-right">ПДФО, ₴</TableHead><TableHead className="text-right">ВЗ, ₴</TableHead>
                  <TableHead>Код</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dpsRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.description || row.agentCode}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtUah(row.amount, hide)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtUah(row.taxPaid, hide)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtUah(row.militaryLevyPaid, hide)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.incomeCode}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ticker Logo ──

const TICKER_COLORS = [
  "bg-sky-600", "bg-violet-600", "bg-emerald-600", "bg-rose-600",
  "bg-amber-600", "bg-cyan-600", "bg-pink-600", "bg-indigo-600",
  "bg-teal-600", "bg-orange-600", "bg-lime-600", "bg-fuchsia-600",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function TickerLogo({ symbol }: { symbol: string }) {
  const color = TICKER_COLORS[hashCode(symbol) % TICKER_COLORS.length];
  const letter = symbol.charAt(0).toUpperCase();
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm mr-1.5 align-middle text-[9px] font-bold text-white ${color}`}>
      {letter}
    </span>
  );
}

// ── XML Preview Modal ──

function XmlPreviewModal({ open, onClose, result, info, hideAmounts, onDownload }: {
  open: boolean; onClose: () => void; result: TaxResult; info: DeclarationInfo; hideAmounts: boolean; onDownload: () => void;
}) {
  const h = hideAmounts;
  const NON_TAXABLE = new Set(["11.1", "11.2", "11.3"]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>XML декларація F0100215</DialogTitle>
          <DialogDescription>Перегляньте дані перед завантаженням. Рік: {info.year}, ІПН: {info.tin}</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Рядок</TableHead><TableHead>Категорія</TableHead>
              <TableHead className="text-right">Дохід, ₴</TableHead><TableHead className="text-right">ПДФО, ₴</TableHead>
              <TableHead className="text-right">ВЗ, ₴</TableHead><TableHead>Сплата</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {result.categories.map((cat) => (
                <TableRow key={cat.category}>
                  <TableCell className="font-mono text-xs">{cat.category}</TableCell>
                  <TableCell className="text-xs">{CATEGORY_LABELS[cat.category] ?? cat.category}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmtUah(cat.amount, h)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{NON_TAXABLE.has(cat.category) ? "—" : fmtUah(cat.pdfo, h)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{NON_TAXABLE.has(cat.category) ? "—" : fmtUah(cat.vz, h)}</TableCell>
                  <TableCell>
                    <Badge variant={cat.agentPaid ? "secondary" : "default"} className="text-xs">
                      {NON_TAXABLE.has(cat.category) ? "—" : cat.agentPaid ? "Агент" : "Сам"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-muted-foreground text-xs">ПДФО до сплати</p><p className="font-mono font-bold text-amber-400">{fmtUah(result.pdfoToPay, h)} ₴</p></div>
          <div><p className="text-muted-foreground text-xs">ВЗ до сплати</p><p className="font-mono font-bold text-amber-400">{fmtUah(result.vzToPay, h)} ₴</p></div>
        </div>

        {result.foreignTaxCredit > 0 && <p className="text-xs text-emerald-400">Залік іноземного податку (п.18): -{fmtUah(result.foreignTaxCredit, h)} ₴</p>}

        <Alert>
          <AlertDescription className="text-xs">
            Після завантаження XML потрібно завершити заповнення декларації в{" "}
            <a href="https://cabinet.tax.gov.ua/" target="_blank" rel="noopener noreferrer" className="underline text-blue-400">кабінеті платника податків</a>
          </AlertDescription>
        </Alert>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          <Button onClick={() => { onDownload(); onClose(); }}>
            Завантажити XML{result.lots.length > 0 && " + Додаток Ф1"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
