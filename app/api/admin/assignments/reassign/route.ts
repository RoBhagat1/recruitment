export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const { assignmentId } = await req.json();
    if (!assignmentId || typeof assignmentId !== 'number') {
      return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 });
    }

    const db = getDb();

    // Fetch the assignment being removed
    const asgnResult = await db.execute({
      sql: `SELECT id, application_id, grader_id, status FROM assignments WHERE id = ?`,
      args: [assignmentId],
    });
    if (asgnResult.rows.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }
    const asgn = asgnResult.rows[0];
    if (asgn.status === 'completed') {
      return NextResponse.json({ error: 'Cannot reassign a completed assignment' }, { status: 400 });
    }

    const applicationId = asgn.application_id as number;
    const fromGraderId = asgn.grader_id as number;

    // Find all grader IDs already assigned to this application
    const existingResult = await db.execute({
      sql: `SELECT grader_id FROM assignments WHERE application_id = ?`,
      args: [applicationId],
    });
    const assignedGraderIds = new Set(existingResult.rows.map((r) => r.grader_id as number));

    // Find the best replacement: eligible grader with fewest assignments
    const allGradersResult = await db.execute(`
      SELECT g.id, COUNT(a.id) as total
      FROM graders g
      LEFT JOIN assignments a ON a.grader_id = g.id
      GROUP BY g.id
      ORDER BY total ASC
    `);

    const replacement = allGradersResult.rows.find((r) => {
      const gid = r.id as number;
      return gid !== fromGraderId && !assignedGraderIds.has(gid);
    });

    if (!replacement) {
      return NextResponse.json(
        { error: 'No eligible grader available to take this assignment. All other graders are already assigned to this application.' },
        { status: 400 }
      );
    }

    const newGraderId = replacement.id as number;

    // Delete old assignment and create new one
    await db.execute({ sql: `DELETE FROM assignments WHERE id = ?`, args: [assignmentId] });
    await db.execute({
      sql: `INSERT INTO assignments (application_id, grader_id) VALUES (?, ?)`,
      args: [applicationId, newGraderId],
    });

    // Return the new grader name for UI update
    const newGraderResult = await db.execute({
      sql: `SELECT name FROM graders WHERE id = ?`,
      args: [newGraderId],
    });
    const newGraderName = newGraderResult.rows[0]?.name as string ?? '';

    return NextResponse.json({ success: true, newGraderId, newGraderName });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
