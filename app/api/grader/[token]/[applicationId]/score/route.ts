export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb, getConfig } from '@/lib/db';
import { validateGraderToken, notFound } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; applicationId: string }> }
) {
  try {
    await initDb();
    const { token, applicationId } = await params;
    const appId = parseInt(applicationId, 10);

    const grader = await validateGraderToken(token);
    if (!grader) return notFound('Grader not found');

    const db = getDb();

    // Verify assignment ownership
    const asgn = await db.execute({
      sql: `SELECT id FROM assignments WHERE grader_id = ? AND application_id = ?`,
      args: [grader.id, appId],
    });
    if (asgn.rows.length === 0) return notFound('Assignment not found');
    const assignmentId = asgn.rows[0].id as number;

    const body = await req.json();
    const scores: Record<string, number> = body.scores ?? {};
    const comment: string = typeof body.comment === 'string' ? body.comment.trim() : '';

    const config = await getConfig();
    const scoreFields = config?.score_fields ?? [];

    // Validate all score fields are present and valid
    for (const field of scoreFields) {
      const val = scores[field];
      if (val === undefined || val === null) {
        return NextResponse.json(
          { error: `Missing score for field: ${field}` },
          { status: 400 }
        );
      }
      if (!Number.isInteger(val) || val < 1 || val > 5) {
        return NextResponse.json(
          { error: `Score for "${field}" must be an integer between 1 and 5` },
          { status: 400 }
        );
      }
    }

    // Upsert scores
    for (const field of scoreFields) {
      await db.execute({
        sql: `INSERT INTO scores (assignment_id, field_name, score) VALUES (?, ?, ?)
              ON CONFLICT(assignment_id, field_name) DO UPDATE SET score = excluded.score`,
        args: [assignmentId, field, scores[field]],
      });
    }

    // Mark assignment complete and save comment
    await db.execute({
      sql: `UPDATE assignments SET status = 'completed', completed_at = strftime('%s','now'), comment = ?
            WHERE id = ?`,
      args: [comment || null, assignmentId],
    });

    // Find next pending assignment for this grader
    const next = await db.execute({
      sql: `SELECT a.id as application_id
            FROM assignments asgn
            JOIN applications a ON a.id = asgn.application_id
            WHERE asgn.grader_id = ? AND asgn.status = 'pending'
            ORDER BY a.row_index ASC
            LIMIT 1`,
      args: [grader.id],
    });

    const nextApplicationId =
      next.rows.length > 0 ? (next.rows[0].application_id as number) : null;

    return NextResponse.json({ success: true, nextApplicationId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
