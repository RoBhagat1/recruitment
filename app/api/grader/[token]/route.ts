export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb } from '@/lib/db';
import { validateGraderToken, notFound } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await initDb();
    const { token } = await params;
    const grader = await validateGraderToken(token);
    if (!grader) return notFound('Grader not found');

    const db = getDb();
    const result = await db.execute({
      sql: `SELECT a.id as application_id, a.row_index, asgn.id as assignment_id, asgn.status
            FROM assignments asgn
            JOIN applications a ON a.id = asgn.application_id
            WHERE asgn.grader_id = ?
            ORDER BY a.row_index ASC`,
      args: [grader.id],
    });

    const assignments = result.rows.map((r) => ({
      applicationId: r.application_id as number,
      assignmentId: r.assignment_id as number,
      rowIndex: r.row_index as number,
      status: r.status as string,
    }));

    const completed = assignments.filter((a) => a.status === 'completed').length;

    return NextResponse.json({
      grader: { id: grader.id, name: grader.name, email: grader.email },
      assignments,
      progress: { completed, total: assignments.length },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
