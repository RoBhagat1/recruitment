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

    // Grader progress
    const gradersResult = await db.execute(`
      SELECT g.id, g.name, g.email,
             COUNT(a.id) as total,
             SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM graders g
      LEFT JOIN assignments a ON a.grader_id = g.id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);

    const graders = gradersResult.rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      email: r.email as string,
      total: r.total as number,
      completed: r.completed as number,
    }));

    // Overall progress
    const progressResult = await db.execute(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM assignments
    `);
    const progressRow = progressResult.rows[0];
    const progress = {
      total: progressRow.total as number,
      completed: progressRow.completed as number,
    };

    // Applications with scores
    const appsResult = await db.execute(`
      SELECT a.id, a.row_index, a.fields, a.admin_note, a.final_score, a.rank,
             asgn.id as assignment_id, asgn.grader_id, asgn.status as asgn_status, asgn.comment as asgn_comment,
             g.name as grader_name
      FROM applications a
      LEFT JOIN assignments asgn ON asgn.application_id = a.id
      LEFT JOIN graders g ON g.id = asgn.grader_id
      ORDER BY a.row_index ASC, asgn.id ASC
    `);

    const scoresResult = await db.execute(`
      SELECT s.assignment_id, s.field_name, s.score
      FROM scores s
    `);

    // Index scores by assignment_id
    const scoresByAssignment: Record<number, Record<string, number>> = {};
    for (const row of scoresResult.rows) {
      const aid = row.assignment_id as number;
      if (!scoresByAssignment[aid]) scoresByAssignment[aid] = {};
      scoresByAssignment[aid][row.field_name as string] = row.score as number;
    }

    // Group by application
    const appMap = new Map<number, {
      id: number; rowIndex: number; fields: Record<string, string>;
      adminNote: string | null; finalScore: number | null; rank: number | null;
      assignments: Array<{
        assignmentId: number; graderId: number; graderName: string;
        status: string; scores: Record<string, number>; total: number | null; comment: string | null;
      }>;
      average: number | null;
    }>();

    for (const row of appsResult.rows) {
      const appId = row.id as number;
      if (!appMap.has(appId)) {
        appMap.set(appId, {
          id: appId,
          rowIndex: row.row_index as number,
          fields: JSON.parse(row.fields as string),
          adminNote: (row.admin_note as string | null) || null,
          finalScore: row.final_score as number | null,
          rank: row.rank as number | null,
          assignments: [],
          average: null,
        });
      }

      if (row.assignment_id !== null) {
        const assignmentId = row.assignment_id as number;
        const scores = scoresByAssignment[assignmentId] ?? {};
        const scoreValues = Object.values(scores);
        const total = scoreValues.length > 0
          ? scoreValues.reduce((a, b) => a + b, 0)
          : null;

        appMap.get(appId)!.assignments.push({
          assignmentId,
          graderId: row.grader_id as number,
          graderName: row.grader_name as string,
          status: row.asgn_status as string,
          scores,
          total,
          comment: (row.asgn_comment as string | null) || null,
        });
      }
    }

    const scoreFieldCount = (config?.score_fields ?? []).length + (config?.custom_score_fields ?? []).length;
    const applications = Array.from(appMap.values()).map((app) => {
      const allScores = app.assignments.flatMap((a) => Object.values(a.scores));
      const expectedScores = scoreFieldCount * 2;
      const average =
        allScores.length === expectedScores && expectedScores > 0
          ? allScores.reduce((a, b) => a + b, 0) / expectedScores
          : null;
      return { ...app, average };
    });

    return NextResponse.json({
      status: config?.status ?? 'setup',
      progress,
      graders,
      applications,
      scoreFields: config?.score_fields ?? [],
      csvHeaders: config?.csv_headers ?? [],
      normalizationFactors: config?.normalization_factors ?? null,
      graderInstructions: config?.grader_instructions ?? null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
