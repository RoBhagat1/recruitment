export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb, isSetupComplete } from '@/lib/db';
import { parseCsv } from '@/lib/csv';
import { assignGraders } from '@/lib/assignments';
import { generateToken } from '@/lib/tokens';

interface GraderInput {
  name: string;
  email: string;
}

export async function POST(req: NextRequest) {
  try {
    await initDb();

    if (await isSetupComplete()) {
      return NextResponse.json(
        { error: 'Setup has already been completed.' },
        { status: 409 }
      );
    }

    const formData = await req.formData();
    const csvFile = formData.get('csv') as File | null;
    const gradersRaw = formData.get('graders') as string | null;
    const adminPassword = (formData.get('adminPassword') as string | null)?.trim() ?? '';

    if (!csvFile) return NextResponse.json({ error: 'CSV file is required.' }, { status: 400 });
    if (!gradersRaw) return NextResponse.json({ error: 'Graders list is required.' }, { status: 400 });
    if (!adminPassword || adminPassword.length < 6) {
      return NextResponse.json({ error: 'Admin password must be at least 6 characters.' }, { status: 400 });
    }

    let graderInputs: GraderInput[];
    try {
      graderInputs = JSON.parse(gradersRaw);
    } catch {
      return NextResponse.json({ error: 'Graders must be valid JSON.' }, { status: 400 });
    }

    if (!Array.isArray(graderInputs) || graderInputs.length < 2) {
      return NextResponse.json({ error: 'At least 2 graders are required.' }, { status: 400 });
    }

    // Validate grader inputs
    for (const g of graderInputs) {
      if (!g.name?.trim() || !g.email?.trim()) {
        return NextResponse.json({ error: 'Each grader must have a name and email.' }, { status: 400 });
      }
    }

    // Parse CSV
    const csvText = await csvFile.text();
    let scoreFieldsRaw = formData.get('scoreFields') as string | null;
    let scoreFields: string[] = [];

    let parsed;
    try {
      parsed = parseCsv(csvText);
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    if (scoreFieldsRaw) {
      try {
        scoreFields = JSON.parse(scoreFieldsRaw);
      } catch {
        scoreFields = [];
      }
    }

    // Validate score fields are actual headers
    scoreFields = scoreFields.filter((f) => parsed.headers.includes(f));
    if (scoreFields.length === 0) {
      return NextResponse.json({ error: 'At least one scored column must be selected.' }, { status: 400 });
    }

    const db = getDb();
    const adminToken = adminPassword;

    // Insert config
    await db.execute({
      sql: `INSERT INTO config (id, admin_token, status, csv_headers, score_fields)
            VALUES (1, ?, 'setup', ?, ?)`,
      args: [adminToken, JSON.stringify(parsed.headers), JSON.stringify(scoreFields)],
    });

    // Insert applications
    const appIds: number[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const result = await db.execute({
        sql: `INSERT INTO applications (row_index, fields) VALUES (?, ?)`,
        args: [i, JSON.stringify(parsed.rows[i])],
      });
      appIds.push(Number(result.lastInsertRowid));
    }

    // Insert graders
    const graderIds: number[] = [];
    const graderTokens: { name: string; email: string; token: string }[] = [];
    for (const g of graderInputs) {
      const token = generateToken();
      const result = await db.execute({
        sql: `INSERT INTO graders (name, email, token) VALUES (?, ?, ?)`,
        args: [g.name.trim(), g.email.trim().toLowerCase(), token],
      });
      graderIds.push(Number(result.lastInsertRowid));
      graderTokens.push({ name: g.name.trim(), email: g.email.trim().toLowerCase(), token });
    }

    // Assign graders
    let assignments;
    try {
      assignments = assignGraders(appIds, graderIds);
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    for (const a of assignments) {
      await db.execute({
        sql: `INSERT INTO assignments (application_id, grader_id) VALUES (?, ?)`,
        args: [a.applicationId, a.graderId],
      });
    }

    // Activate
    await db.execute(`UPDATE config SET status = 'active' WHERE id = 1`);

    const baseUrl = req.headers.get('origin') || '';

    return NextResponse.json({
      adminToken,
      adminUrl: `${baseUrl}/admin/dashboard`,
      graderLinks: graderTokens.map((g) => ({
        name: g.name,
        email: g.email,
        url: `${baseUrl}/grade/${g.token}`,
        token: g.token,
      })),
      applicationCount: parsed.rows.length,
      graderCount: graderInputs.length,
    });
  } catch (e: unknown) {
    console.error('Setup error:', e);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
