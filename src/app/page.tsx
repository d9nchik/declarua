"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import type {
  DeclarationInfo,
  IbkrData,
  DpsIncomeRow,
  TaxResult,
} from "@/lib/types";
import { parseIbkrXml } from "@/lib/parse-ibkr";
import { parseDpsXml } from "@/lib/parse-dps";
import { calculateTax } from "@/lib/tax-calc";
import { generateMainXml, generateF1Xml, downloadFile } from "@/lib/xml-gen";
import { loadInfo, saveInfo } from "@/lib/storage";

function fmtUah(n: number): string {
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(0, 4)}`;
}

export default function Home() {
  const [info, setInfo] = useState<DeclarationInfo>(() => loadInfo());
  const [ibkrData, setIbkrData] = useState<IbkrData | null>(null);
  const [dpsRows, setDpsRows] = useState<DpsIncomeRow[]>([]);
  const [result, setResult] = useState<TaxResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ibkrFileName, setIbkrFileName] = useState<string | null>(null);
  const [dpsFileName, setDpsFileName] = useState<string | null>(null);

  useEffect(() => {
    saveInfo(info);
  }, [info]);

  const updateField = useCallback(
    <K extends keyof DeclarationInfo>(key: K, value: DeclarationInfo[K]) => {
      setInfo((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleIbkrFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = parseIbkrXml(text);
        setIbkrData(data);
        setIbkrFileName(file.name);
        setError(null);
      } catch (err) {
        setError(
          `Помилка парсингу IBKR: ${err instanceof Error ? err.message : "невідома помилка"}`
        );
      }
    },
    []
  );

  const handleDpsFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseDpsXml(text);
        setDpsRows(rows);
        setDpsFileName(file.name);
        setError(null);
      } catch (err) {
        setError(
          `Помилка парсингу ДПС: ${err instanceof Error ? err.message : "невідома помилка"}`
        );
      }
    },
    []
  );

  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await calculateTax(info, ibkrData, dpsRows);
      setResult(r);
    } catch (err) {
      setError(
        `Помилка розрахунку: ${err instanceof Error ? err.message : "невідома помилка"}`
      );
    } finally {
      setLoading(false);
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

  const isFormValid =
    info.fullName.trim() !== "" &&
    /^\d{10}$/.test(info.tin) &&
    /^\d{4}$/.test(info.stiCode) &&
    info.city.trim() !== "" &&
    info.street.trim() !== "" &&
    (ibkrData !== null || dpsRows.length > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight">DeclarUA</h1>
            <span className="text-sm text-muted-foreground">
              Податкова декларація з IBKR
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Все працює у браузері — дані не передаються на сервер
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Особисті дані</CardTitle>
            <CardDescription>
              Інформація для заповнення декларації F0100215
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="year">Рік</Label>
                <Input
                  id="year"
                  type="number"
                  value={info.year}
                  onChange={(e) =>
                    updateField("year", parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="fullName">ПІБ</Label>
                <Input
                  id="fullName"
                  placeholder="Іваненко Іван Іванович"
                  value={info.fullName}
                  onChange={(e) => updateField("fullName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tin">ІПН</Label>
                <Input
                  id="tin"
                  placeholder="1234567890"
                  maxLength={10}
                  value={info.tin}
                  onChange={(e) =>
                    updateField("tin", e.target.value.replace(/\D/g, ""))
                  }
                  className="font-mono"
                />
                {info.tin && !/^\d{10}$/.test(info.tin) && (
                  <p className="text-xs text-destructive">
                    ІПН має містити 10 цифр
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stiCode">Код ДПІ</Label>
                <Input
                  id="stiCode"
                  placeholder="2655"
                  maxLength={4}
                  value={info.stiCode}
                  onChange={(e) =>
                    updateField("stiCode", e.target.value.replace(/\D/g, ""))
                  }
                  className="font-mono"
                />
                {info.stiCode && !/^\d{4}$/.test(info.stiCode) && (
                  <p className="text-xs text-destructive">
                    Код ДПІ має містити 4 цифри
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="prevLoss">Збиток попередніх років</Label>
                <Input
                  id="prevLoss"
                  type="number"
                  min={0}
                  step={0.01}
                  value={info.prevLoss || ""}
                  onChange={(e) =>
                    updateField("prevLoss", parseFloat(e.target.value) || 0)
                  }
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Місто</Label>
                <Input
                  id="city"
                  placeholder="Київ"
                  value={info.city}
                  onChange={(e) => updateField("city", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="street">Вулиця</Label>
                <Input
                  id="street"
                  placeholder="вул. Хрещатик, 1, кв. 1"
                  value={info.street}
                  onChange={(e) => updateField("street", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <Checkbox
                  id="foreignTaxCredit"
                  checked={info.applyForeignTaxCredit}
                  onCheckedChange={(checked) =>
                    updateField("applyForeignTaxCredit", checked === true)
                  }
                />
                <Label htmlFor="foreignTaxCredit" className="text-sm">
                  Зарахувати іноземний податок (п.18 декларації)
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Імпорт даних</CardTitle>
            <CardDescription>
              Завантажте звіт IBKR (FlexQuery XML) та/або попередню декларацію
              ДПС
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <Label>Звіт IBKR (FlexQuery XML)</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xml"
                    onChange={handleIbkrFile}
                    className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-secondary-foreground"
                  />
                </div>
                {ibkrData && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {ibkrFileName}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {ibkrData.lots.length} угод
                      </Badge>
                      <Badge variant="secondary">
                        {ibkrData.dividends.length} дивідендів
                      </Badge>
                      <Badge variant="secondary">
                        Рахунок: {ibkrData.accountId}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>Попередня декларація ДПС (XML)</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xml"
                    onChange={handleDpsFile}
                    className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-secondary-foreground"
                  />
                </div>
                {dpsRows.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {dpsFileName}
                    </p>
                    <Badge variant="secondary">
                      {dpsRows.length} записів
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calculate Button */}
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            onClick={handleCalculate}
            disabled={!isFormValid || loading}
          >
            {loading ? "Розрахунок..." : "Розрахувати"}
          </Button>
          {!isFormValid && (
            <p className="text-sm text-muted-foreground">
              Заповніть всі поля та завантажте хоча б один файл
            </p>
          )}
        </div>

        {/* Results */}
        {result && (
          <>
            <Separator />

            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Підсумок</TabsTrigger>
                {result.lots.length > 0 && (
                  <TabsTrigger value="lots">
                    Угоди ({result.lots.length})
                  </TabsTrigger>
                )}
                {result.dividends.length > 0 && (
                  <TabsTrigger value="dividends">
                    Дивіденди ({result.dividends.length})
                  </TabsTrigger>
                )}
                {result.categories.length > 0 && (
                  <TabsTrigger value="categories">Категорії</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="summary" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Результат розрахунку за {info.year} рік
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      <SummaryItem
                        label="Загальний дохід"
                        value={fmtUah(result.totalIncome)}
                        unit="₴"
                      />
                      <SummaryItem
                        label="ПДФО (агент)"
                        value={fmtUah(result.agentPaidPdfo)}
                        unit="₴"
                        muted
                      />
                      <SummaryItem
                        label="ВЗ (агент)"
                        value={fmtUah(result.agentPaidVz)}
                        unit="₴"
                        muted
                      />

                      {result.lots.length > 0 && (
                        <>
                          <SummaryItem
                            label="Інвестиційний P&L"
                            value={fmtUah(result.investmentPnl)}
                            unit="₴"
                            highlight={result.investmentPnl > 0}
                            negative={result.investmentPnl < 0}
                          />
                          {info.prevLoss > 0 && (
                            <SummaryItem
                              label="Після врахування збитку"
                              value={fmtUah(result.investmentTaxableProfit)}
                              unit="₴"
                            />
                          )}
                        </>
                      )}

                      {result.foreignTaxCredit > 0 && (
                        <SummaryItem
                          label="Залік іноз. податку (п.18)"
                          value={`-${fmtUah(result.foreignTaxCredit)}`}
                          unit="₴"
                          highlight
                        />
                      )}

                      <Separator className="col-span-full" />

                      <SummaryItem
                        label="ПДФО до сплати"
                        value={fmtUah(result.pdfoToPay)}
                        unit="₴"
                        large
                        negative={result.pdfoToPay > 0}
                      />
                      <SummaryItem
                        label="Військовий збір до сплати"
                        value={fmtUah(result.vzToPay)}
                        unit="₴"
                        large
                        negative={result.vzToPay > 0}
                      />
                      <SummaryItem
                        label="Разом до сплати"
                        value={fmtUah(result.pdfoToPay + result.vzToPay)}
                        unit="₴"
                        large
                        negative={result.pdfoToPay + result.vzToPay > 0}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Button size="lg" onClick={handleDownload}>
                  Завантажити XML декларацію
                  {result.lots.length > 0 && " + Додаток Ф1"}
                </Button>
              </TabsContent>

              {result.lots.length > 0 && (
                <TabsContent value="lots">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Тікер</TableHead>
                              <TableHead className="text-right">К-ть</TableHead>
                              <TableHead>Купівля</TableHead>
                              <TableHead>Продаж</TableHead>
                              <TableHead className="text-right">
                                Витрати, ₴
                              </TableHead>
                              <TableHead className="text-right">
                                Дохід, ₴
                              </TableHead>
                              <TableHead className="text-right">
                                P&L, ₴
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.lots.map((lot, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono font-medium">
                                  {lot.symbol}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {lot.quantity}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  <span className="block">
                                    {fmtDate(lot.buyDate)}
                                  </span>
                                  <span className="block text-xs">
                                    {lot.buyRate.toFixed(4)} ₴/$
                                  </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  <span className="block">
                                    {fmtDate(lot.sellDate)}
                                  </span>
                                  <span className="block text-xs">
                                    {lot.sellRate.toFixed(4)} ₴/$
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(lot.costUah)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(lot.proceedsUah)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-mono font-medium ${
                                    lot.pnlUah >= 0
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }`}
                                >
                                  {fmtUah(lot.pnlUah)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {result.dividends.length > 0 && (
                <TabsContent value="dividends">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Тікер</TableHead>
                              <TableHead>Дата</TableHead>
                              <TableHead className="text-right">
                                Сума, $
                              </TableHead>
                              <TableHead className="text-right">
                                Податок, $
                              </TableHead>
                              <TableHead className="text-right">
                                Курс
                              </TableHead>
                              <TableHead className="text-right">
                                Сума, ₴
                              </TableHead>
                              <TableHead className="text-right">
                                Податок, ₴
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.dividends.map((div, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono font-medium">
                                  {div.symbol}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {fmtDate(div.date)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {div.amount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">
                                  {div.withholdingTax.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">
                                  {div.rate.toFixed(4)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(div.amountUah)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">
                                  {fmtUah(div.withholdingTaxUah)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {result.categories.length > 0 && (
                <TabsContent value="categories">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Рядок</TableHead>
                              <TableHead>Категорія</TableHead>
                              <TableHead className="text-right">
                                Дохід, ₴
                              </TableHead>
                              <TableHead className="text-right">
                                ПДФО, ₴
                              </TableHead>
                              <TableHead className="text-right">
                                ВЗ, ₴
                              </TableHead>
                              <TableHead>Хто сплачує</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.categories.map((cat) => (
                              <TableRow key={cat.category}>
                                <TableCell className="font-mono">
                                  {cat.category}
                                </TableCell>
                                <TableCell>{cat.label}</TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(cat.amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(cat.pdfo)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmtUah(cat.vz)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      cat.agentPaid ? "secondary" : "default"
                                    }
                                  >
                                    {cat.agentPaid ? "Агент" : "Самостійно"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <p className="text-xs text-muted-foreground">
            DeclarUA — open source проєкт. Не є юридичною консультацією.
            Перевіряйте результати перед подачею декларації.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  unit,
  large,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  unit: string;
  large?: boolean;
  highlight?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`font-mono ${large ? "text-2xl font-bold" : "text-lg font-semibold"} ${
          highlight
            ? "text-emerald-400"
            : negative
              ? "text-amber-400"
              : "text-foreground"
        }`}
      >
        {value}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {unit}
        </span>
      </p>
    </div>
  );
}
