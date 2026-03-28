'use client';

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StatusBanner from '@/components/StatusBanner';

interface GraderInput { name: string; email: string }
interface GraderLink { name: string; email: string; url: string }

type Step = 'upload' | 'configure' | 'graders' | 'confirm' | 'done';

export default function SetupPage() {
  const [step, setStep] = useState<Step>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [scoreFields, setScoreFields] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [graderText, setGraderText] = useState('');
  const [graders, setGraders] = useState<GraderInput[]>([]);
  const [graderError, setGraderError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ adminToken: string; adminUrl: string; graderLinks: GraderLink[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file'); return; }
    setCsvFile(file);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const fields = result.meta.fields ?? [];
      setHeaders(fields);
      setPreviewRows(result.data.slice(0, 3));
      setRowCount(result.data.length);
      // Default: all fields are scored
      setScoreFields(new Set(fields));
      setStep('configure');
    };
    reader.readAsText(file);
  }, []);

  const parseGraders = () => {
    setAdminPasswordError('');
    if (!adminPassword.trim()) {
      setAdminPasswordError('Admin password is required');
      return;
    }
    if (adminPassword.trim().length < 6) {
      setAdminPasswordError('Password must be at least 6 characters');
      return;
    }
    const lines = graderText.trim().split('\n').filter(Boolean);
    const parsed: GraderInput[] = [];
    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        setGraderError(`Invalid line: "${line}" — expected "Name, email"`);
        return;
      }
      if (!parts[1].includes('@')) {
        setGraderError(`Invalid email: "${parts[1]}"`);
        return;
      }
      parsed.push({ name: parts[0], email: parts[1] });
    }
    if (parsed.length < 2) { setGraderError('At least 2 graders required'); return; }
    const emails = parsed.map((g) => g.email.toLowerCase());
    const dupes = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (dupes.length > 0) {
      setGraderError(`Duplicate email${dupes.length > 1 ? 's' : ''}: ${[...new Set(dupes)].join(', ')}`);
      return;
    }
    setGraderError('');
    setGraders(parsed);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!csvFile) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('csv', csvFile);
      fd.append('graders', JSON.stringify(graders));
      fd.append('scoreFields', JSON.stringify(Array.from(scoreFields)));
      fd.append('adminPassword', adminPassword.trim());
      const validCustomFields = customFields.map((f) => f.trim()).filter(Boolean);
      if (validCustomFields.length > 0) {
        fd.append('customScoreFields', JSON.stringify(validCustomFields));
      }

      const res = await fetch('/api/setup', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setStep('confirm'); return; }
      setResult(data);
      setStep('done');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Recruitment Setup</h1>
          <p className="text-gray-500 mt-2">Upload applications and configure graders</p>
        </div>

        {/* Step indicators */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-2 mb-8 text-sm">
            {(['upload', 'configure', 'graders', 'confirm'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  ${step === s ? 'bg-indigo-600 text-white' :
                    ['upload', 'configure', 'graders', 'confirm'].indexOf(step) > i
                      ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {['upload', 'configure', 'graders', 'confirm'].indexOf(step) > i ? '✓' : i + 1}
                </div>
                <span className={step === s ? 'text-indigo-600 font-medium' : 'text-gray-400'}>
                  {['Upload CSV', 'Configure', 'Graders', 'Confirm'][i]}
                </span>
                {i < 3 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
        )}

        {error && <div className="mb-4"><StatusBanner message={error} type="error" /></div>}

        {/* Step: Upload */}
        {step === 'upload' && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-4">Upload CSV File</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}`}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-gray-600 mb-4">Drag and drop your CSV file here, or</p>
              <label className="cursor-pointer">
                <span className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                  Browse file
                </span>
                <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
            </div>
          </Card>
        )}

        {/* Step: Configure columns */}
        {step === 'configure' && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-1">Configure Columns</h2>
            <p className="text-gray-500 text-sm mb-4">
              Select which columns graders will score (1–5). Unselected columns are shown as context only.
            </p>
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              {rowCount} application{rowCount !== 1 ? 's' : ''} detected · {headers.length} columns
            </div>

            <div className="space-y-2 mb-6">
              {headers.map((h) => (
                <label key={h} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scoreFields.has(h)}
                    onChange={(e) => {
                      const s = new Set(scoreFields);
                      e.target.checked ? s.add(h) : s.delete(h);
                      setScoreFields(s);
                    }}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="font-medium text-gray-800">{h}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${scoreFields.has(h) ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                    {scoreFields.has(h) ? 'Scored' : 'Context'}
                  </span>
                </label>
              ))}
            </div>

            {previewRows.length > 0 && (
              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Preview (first {previewRows.length} rows)</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr>{headers.map((h) => <th key={h} className="text-left p-2 bg-gray-50 border border-gray-200 font-medium text-gray-600">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>{headers.map((h) => <td key={h} className="p-2 border border-gray-200 text-gray-700 max-w-32 truncate">{row[h]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Custom score questions */}
            <div className="border-t border-gray-100 pt-5 mb-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-700">Additional score questions</p>
                <button
                  onClick={() => setCustomFields([...customFields, ''])}
                  className="text-indigo-600 text-sm hover:underline"
                >+ Add question</button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Add extra scoring criteria beyond the CSV columns above. Graders score each on a 1–5 scale.
              </p>
              {customFields.length > 0 && (
                <div className="space-y-2">
                  {customFields.map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={label}
                        onChange={(e) => {
                          const f = [...customFields];
                          f[i] = e.target.value;
                          setCustomFields(f);
                        }}
                        placeholder="e.g. Overall impression"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={() => setCustomFields(customFields.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={() => scoreFields.size > 0 ? setStep('graders') : setError('Select at least one scored column')} disabled={scoreFields.size === 0}>
                Continue →
              </Button>
            </div>
          </Card>
        )}

        {/* Step: Graders */}
        {step === 'graders' && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-1">Add Graders</h2>
            <p className="text-gray-500 text-sm mb-4">One grader per line: <code className="bg-gray-100 px-1 rounded">Name, email@example.com</code></p>
            <textarea
              value={graderText}
              onChange={(e) => setGraderText(e.target.value)}
              placeholder={"Alice Smith, alice@org.com\nBob Jones, bob@org.com"}
              className="w-full h-40 border border-gray-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {graderError && <p className="text-red-600 text-sm mt-2">{graderError}</p>}

            <div className="mt-5 pt-5 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin password</label>
              <p className="text-xs text-gray-500 mb-2">You'll use this to sign in to the admin dashboard.</p>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Choose a password (min. 6 characters)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {adminPasswordError && <p className="text-red-600 text-sm mt-1">{adminPasswordError}</p>}
            </div>

            <div className="flex justify-between mt-4">
              <Button variant="secondary" onClick={() => setStep('configure')}>Back</Button>
              <Button onClick={parseGraders}>Continue →</Button>
            </div>
          </Card>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Confirm Setup</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Applications</span>
                <span className="font-semibold">{rowCount}</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Scored columns</span>
                <span className="font-semibold">{scoreFields.size} / {headers.length}</span>
              </div>
              {customFields.filter(Boolean).length > 0 && (
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Custom questions</span>
                  <span className="font-semibold">{customFields.filter(Boolean).length}</span>
                </div>
              )}
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Graders</span>
                <span className="font-semibold">{graders.length}</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Assignments per grader (approx.)</span>
                <span className="font-semibold">~{Math.round(rowCount * 2 / graders.length)}</span>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Graders:</p>
              <div className="space-y-1">
                {graders.map((g) => (
                  <div key={g.email} className="text-sm text-gray-600 flex gap-2">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-gray-400">{g.email}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep('graders')}>Back</Button>
              <Button onClick={handleSubmit} loading={loading}>Launch →</Button>
            </div>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <StatusBanner message="Setup complete! Share the links below." type="success" />

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-3">Admin Dashboard</h2>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-gray-50 border rounded-lg p-3 break-all">{result.adminUrl}</code>
                <Button variant="secondary" onClick={() => copy(result.adminUrl, 'admin')}>
                  {copied === 'admin' ? '✓ Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Sign in with the admin password you set during setup.</p>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-3">Grader Links</h2>
              <div className="space-y-3">
                {result.graderLinks.map((g) => (
                  <div key={g.email} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-gray-500">{g.email}</p>
                      </div>
                      <Button variant="secondary" className="text-xs py-1 px-2" onClick={() => copy(g.url, g.email)}>
                        {copied === g.email ? '✓ Copied' : 'Copy link'}
                      </Button>
                    </div>
                    <code className="text-xs text-gray-600 mt-2 block break-all">{g.url}</code>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
