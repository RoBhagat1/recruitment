export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb, getConfig, type NormalizationFactor } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const config = await getConfig();
    if (!config) return NextResponse.json({ error: 'Not initialized' }, { status: 400 });

    const { topN, force } = await req.json();
    if (!topN || typeof topN !== 'number' || topN < 1) {
      return NextResponse.json({ error: 'topN must be a positive number' }, { status: 400 });
    }

    const db = getDb();

    // Check all assignments are complete
    const incomplete = await db.execute(
      `SELECT COUNT(*) as count FROM assignments WHERE status = 'pending'`
    );
    const incompleteCount = incomplete.rows[0].count as number;
    if (incompleteCount > 0 && !force) {
      return NextResponse.json(
        { error: `${incompleteCount} assignments are still pending. Pass force:true to finalize anyway.`, incompleteCount },
        { status: 400 }
      );
    }

    const scoreFieldCount = config.score_fields.length;
    const maxPossibleScore = scoreFieldCount * 2; // 2 graders, each scores all fields

    // --- Normalization: compute per-grader mean shift ---

    // Fetch all scores with their grader
    const allScoresResult = await db.execute(`
      SELECT s.score, asgn.grader_id
      FROM scores s
      JOIN assignments asgn ON asgn.id = s.assignment_id
    `);

    const allScoreValues = allScoresResult.rows.map((r) => r.score as number);
    const globalMean = allScoreValues.length > 0
      ? allScoreValues.reduce((a, b) => a + b, 0) / allScoreValues.length
      : 3;

    // Per-grader mean
    const graderScoreBuckets: Record<number, number[]> = {};
    for (const row of allScoresResult.rows) {
      const gid = row.grader_id as number;
      if (!graderScoreBuckets[gid]) graderScoreBuckets[gid] = [];
      graderScoreBuckets[gid].push(row.score as number);
    }
    const graderMeans: Record<number, number> = {};
    for (const [gid, scores] of Object.entries(graderScoreBuckets)) {
      graderMeans[Number(gid)] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // Grader names for display
    const gradersResult = await db.execute(`SELECT id, name FROM graders`);
    const graderNames: Record<number, string> = {};
    for (const row of gradersResult.rows) {
      graderNames[row.id as number] = row.name as string;
    }

    const normalizationFactors: NormalizationFactor[] = Object.entries(graderMeans).map(([gid, mean]) => ({
      graderId: Number(gid),
      graderName: graderNames[Number(gid)] ?? `Grader ${gid}`,
      rawMean: Math.round(mean * 100) / 100,
      adjustment: Math.round((globalMean - mean) * 100) / 100,
    }));

    // --- Compute normalized final score per application ---

    const appsResult = await db.execute(`SELECT id FROM applications ORDER BY id ASC`);
    const scored: Array<{ id: number; average: number }> = [];

    for (const appRow of appsResult.rows) {
      const appId = appRow.id as number;
      const scoresResult = await db.execute({
        sql: `SELECT s.score, asgn.grader_id
              FROM scores s
              JOIN assignments asgn ON asgn.id = s.assignment_id
              WHERE asgn.application_id = ?`,
        args: [appId],
      });

      const adjustedScores = scoresResult.rows.map((row) => {
        const raw = row.score as number;
        const graderId = row.grader_id as number;
        const adjustment = globalMean - (graderMeans[graderId] ?? globalMean);
        return Math.min(5, Math.max(1, raw + adjustment));
      });

      const average = adjustedScores.length > 0
        ? adjustedScores.reduce((a, b) => a + b, 0) / (maxPossibleScore || adjustedScores.length)
        : 0;

      scored.push({ id: appId, average });
    }

    // Sort descending
    scored.sort((a, b) => b.average - a.average);

    // Assign ranks (tied scores get same rank)
    let currentRank = 1;
    for (let i = 0; i < scored.length; i++) {
      if (i > 0 && scored[i].average !== scored[i - 1].average) {
        currentRank = i + 1;
      }
      await db.execute({
        sql: `UPDATE applications SET final_score = ?, rank = ? WHERE id = ?`,
        args: [scored[i].average, currentRank, scored[i].id],
      });
    }

    // Store normalization factors and mark finalized
    await db.execute({
      sql: `UPDATE config SET status = 'finalized', normalization_factors = ? WHERE id = 1`,
      args: [JSON.stringify(normalizationFactors)],
    });

    // Build result with tie flags
    const topScored = scored.slice(0, topN);
    const boundaryScore = topScored.length > 0 ? topScored[topScored.length - 1].average : null;
    const tiedAtBoundary = boundaryScore !== null
      ? scored.filter((s) => s.average === boundaryScore).length > 1
      : false;

    const result = topScored.map((s, i) => ({
      ...s,
      rank: i === 0 ? 1 : scored.findIndex((x) => x.id === s.id) + 1,
      tied: tiedAtBoundary && s.average === boundaryScore,
    }));

    return NextResponse.json({ success: true, topN, result, tiedAtBoundary, normalizationFactors });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
