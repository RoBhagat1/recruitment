export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb, getConfig } from '@/lib/db';
import { validateGraderToken, notFound } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; applicationId: string }> }
) {
  try {
    await initDb();
    const { token, applicationId } = await params;
    const appId = parseInt(applicationId, 10);

    const grader = await validateGraderToken(token);
    if (!grader) return notFound('Grader not found');

    const db = getDb();

    // Verify this grader is assigned to this application
    const asgn = await db.execute({
      sql: `SELECT id, comment FROM assignments WHERE grader_id = ? AND application_id = ?`,
      args: [grader.id, appId],
    });
    if (asgn.rows.length === 0) return notFound('Assignment not found');

    const assignmentId = asgn.rows[0].id as number;
    const existingComment = (asgn.rows[0].comment as string | null) ?? '';

    // Fetch application
    const appResult = await db.execute({
      sql: `SELECT fields, row_index FROM applications WHERE id = ?`,
      args: [appId],
    });
    if (appResult.rows.length === 0) return notFound('Application not found');

    const fields = JSON.parse(appResult.rows[0].fields as string) as Record<string, string>;
    const rowIndex = appResult.rows[0].row_index as number;

    // Fetch existing scores for this assignment
    const scoresResult = await db.execute({
      sql: `SELECT field_name, score FROM scores WHERE assignment_id = ?`,
      args: [assignmentId],
    });
    const existingScores: Record<string, number> = {};
    for (const row of scoresResult.rows) {
      existingScores[row.field_name as string] = row.score as number;
    }

    const config = await getConfig();

    return NextResponse.json({
      applicationId: appId,
      assignmentId,
      rowIndex,
      fields,
      existingScores,
      existingComment,
      csvHeaders: config?.csv_headers ?? [],
      scoreFields: config?.score_fields ?? [],
      graderInstructions: config?.grader_instructions ?? null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
