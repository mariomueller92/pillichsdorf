import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getRecentFailedPrintJobs } from '@/api/printJobs.api';

const POLL_INTERVAL_MS = 15000;

// Ersetzt den frueheren "printer:error"-Socket-Push: pollt fehlgeschlagene
// Druckauftraege und toastet nur neu aufgetretene (nicht bei jedem Poll erneut).
export function PrinterErrorWatcher() {
  const seen = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    const check = async () => {
      try {
        const jobs = await getRecentFailedPrintJobs();
        if (!initialized.current) {
          jobs.forEach(j => seen.current.add(j.id));
          initialized.current = true;
          return;
        }
        for (const job of jobs) {
          if (!seen.current.has(job.id)) {
            seen.current.add(job.id);
            toast.error(`Drucker: ${job.error_message || 'Fehler oder offline'}`, {
              duration: 10000,
              description: 'Bitte Drucker prüfen (Papier, Verbindung, eingeschaltet).',
            });
          }
        }
      } catch {
        // ignore — naechster Poll versucht es erneut
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
