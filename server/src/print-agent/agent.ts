// Standalone-Prozess: läuft dauerhaft auf der Windows-Maschine am Drucker (NICHT auf Vercel).
// Pollt den (serverless) Server nach wartenden Druckaufträgen und führt sie lokal über
// PowerShell/winspool aus. Start: `tsx src/print-agent/agent.ts` mit SERVER_URL + PRINT_AGENT_TOKEN.
import { printRaw, setPrinterConfig, checkPrinterInstalled } from '../printer/index.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TOKEN = process.env.PRINT_AGENT_TOKEN || 'change-me';
const POLL_INTERVAL_MS = parseInt(process.env.PRINT_AGENT_POLL_MS || '4000', 10);

interface PendingJob {
  id: number;
  type: string;
  rendered_content: string;
  created_at: string;
}

interface PendingResponse {
  jobs: PendingJob[];
  printerName: string;
  printerEnabled: boolean;
}

let lastPrinterName = '';
let checkedInstall = false;

async function pollOnce(): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/print-jobs/pending`, {
    headers: { 'x-print-agent-token': TOKEN },
  });
  if (!res.ok) {
    console.error(`[Print-Agent] Poll fehlgeschlagen: HTTP ${res.status}`);
    return;
  }
  const data = (await res.json()) as PendingResponse;

  setPrinterConfig(data.printerName, data.printerEnabled);
  if (data.printerName !== lastPrinterName || !checkedInstall) {
    lastPrinterName = data.printerName;
    checkedInstall = true;
    if (data.printerEnabled) checkPrinterInstalled();
  }

  for (const job of data.jobs) {
    const ok = printRaw(job.rendered_content);
    const reportUrl = `${SERVER_URL}/api/print-jobs/${job.id}/${ok ? 'complete' : 'fail'}`;
    await fetch(reportUrl, {
      method: 'POST',
      headers: { 'x-print-agent-token': TOKEN, 'content-type': 'application/json' },
      body: ok ? undefined : JSON.stringify({ error: 'Lokaler Druck fehlgeschlagen (siehe Agent-Log)' }),
    });
    console.log(`[Print-Agent] Job #${job.id} (${job.type}): ${ok ? 'gedruckt' : 'fehlgeschlagen'}`);
  }
}

async function loop(): Promise<void> {
  try {
    await pollOnce();
  } catch (err) {
    console.error('[Print-Agent] Fehler im Poll-Zyklus:', err);
  }
  setTimeout(loop, POLL_INTERVAL_MS);
}

console.log(`[Print-Agent] Starte, Server=${SERVER_URL}, Intervall=${POLL_INTERVAL_MS}ms`);
loop();
