import { queryOne, queryAll, execute } from '../database.js';

export type PrintJobType = 'bon' | 'rechnung';

export async function queuePrintJob(type: PrintJobType, renderedContent: string): Promise<number> {
  const row = await queryOne<{ id: number }>(
    'INSERT INTO print_jobs (type, rendered_content) VALUES (?, ?) RETURNING id',
    [type, renderedContent]
  );
  return row!.id;
}

export async function listPending(limit: number = 20) {
  return queryAll<{ id: number; type: PrintJobType; rendered_content: string; created_at: string }>(
    "SELECT id, type, rendered_content, created_at FROM print_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [limit]
  );
}

export async function markDone(id: number): Promise<void> {
  await execute("UPDATE print_jobs SET status = 'done', completed_at = now() WHERE id = ?", [id]);
}

export async function markFailed(id: number, errorMessage: string): Promise<void> {
  await execute(
    "UPDATE print_jobs SET status = 'failed', error_message = ?, completed_at = now() WHERE id = ?",
    [errorMessage, id]
  );
}

export async function listRecentFailed(limit: number = 10) {
  return queryAll(
    "SELECT id, type, error_message, created_at, completed_at FROM print_jobs WHERE status = 'failed' ORDER BY completed_at DESC LIMIT ?",
    [limit]
  );
}
