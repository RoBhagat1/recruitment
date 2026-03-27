export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb, getConfig } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';
import Papa from 'papaparse';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const db = getDb();
    const config = await getConfig();
    if (!config) return NextResponse.json({ error: 'Not initialized' }, { status: 400 });

    const appsResult = await db.execute(`
      SELECT a.id, a.row_index, a.fields, a.final_score, a.rank,
             asgn.id as assignment_id, asgn.grader_id,
             g.name as grader_name
      FROM applications a
      LEFT JOIN assignments asgn ON asgn.application_id = a.id
      LEFT JOIN graders g ON g.id = asgn.grader_id
      ORDER BY a.rank ASC NULLS LAST, a.row_index ASC, asgn.id ASC
    `);

    const scoresResult = await db.execute(`SELECT assignment_id, field_name, score FROM scores`);
    const scoresByAssignment: Record<number, Record<string, number>> = {};
    for (const row of scoresResult.rows) {
      const aid = row.assignment_id as number;
      if (!scoresByAssignment[aid]) scoresByAssignment[aid] = {};
      scoresByAssignment[aid][row.field_name as string] = row.score as number;
    }

    // Build rows per application
    const appMap = new Map<number, {
      rank: number | null; finalScore: number | null;
      fields: Record<string, string>;
      graders: Array<{ name: string; scores: Record<string, number>; total: number }>;
    }>();

    for (const row of appsResult.rows) {
      const appId = row.id as number;
      if (!appMap.has(appId)) {
        appMap.set(appId, {
          rank: row.rank as number | null,
          finalScore: row.final_score as number | null,
          fields: JSON.parse(row.fields as string),
          graders: [],
        });
      }
      if (row.assignment_id !== null) {
        const scores = scoresByAssignment[row.assignment_id as number] ?? {};
        const total = Object.values(scores).reduce((a, b) => a + b, 0);
        appMap.get(appId)!.graders.push({
          name: row.grader_name as string,
          scores,
          total,
        });
      }
    }

    const csvRows = Array.from(appMap.values()).map((app) => {
      const row: Record<string, string | number | null> = {
        rank: app.rank,
        final_score: app.finalScore !== null ? Math.round(app.finalScore * 100) / 100 : null,
        ...app.fields,
      };
      app.graders.forEach((g, i) => {
        row[`grader_${i + 1}_name`] = g.name;
        row[`grader_${i + 1}_total`] = g.total;
        for (const field of config.score_fields) {
          row[`grader_${i + 1}_${field}`] = g.scores[field] ?? null;
        }
      });
      return row;
    });

    const csv = Papa.unparse(csvRows);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="recruitment-results.csv"',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
