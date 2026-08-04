import api from './client';

export interface FailedPrintJob {
  id: number;
  type: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function getRecentFailedPrintJobs(): Promise<FailedPrintJob[]> {
  const { data } = await api.get<FailedPrintJob[]>('/print-jobs/failed-recent');
  return data;
}
