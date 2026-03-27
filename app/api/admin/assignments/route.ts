export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb, getConfig } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const db = getDb();
    const config = await getConfig();

    // All graders with assignment counts
    const gradersResult = await db.execute(`
      SELECT g.id, g.name, g.email,
             COUNT(a.id) as total,
             SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM graders g
      LEFT JOIN assignments a ON a.grader_id = g.id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);

    // All assignments with application info
    const assignmentsResult = await db.execute(`
      SELECT a.id as assignment_id, a.grader_id, a.status,
             app.id as application_id, app.row_index, app.fields
      FROM assignments a
      JOIN applications app ON app.id = a.application_id
      ORDER BY app.row_index ASC
    `);

    const graders = gradersResult.rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      email: r.email as string,
      total: r.total as number,
      completed: r.completed as number,
      assignments: assignmentsResult.rows
        .filter((a) => a.grader_id === r.id)
        .map((a) => ({
          assignmentId: a.assignment_id as number,
          applicationId: a.application_id as number,
          rowIndex: a.row_index as number,
          fields: JSON.parse(a.fields as string) as Record<string, string>,
          status: a.status as string,
        })),
    }));

    return NextResponse.json({
      graders,
      csvHeaders: config?.csv_headers ?? [],
      scoreFields: config?.score_fields ?? [],
      status: config?.status ?? 'active',
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
