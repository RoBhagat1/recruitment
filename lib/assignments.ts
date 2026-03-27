export interface Assignment {
  applicationId: number;
  graderId: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assignGraders(
  applicationIds: number[],
  graderIds: number[]
): Assignment[] {
  if (graderIds.length < 2) {
    throw new Error('At least 2 graders are required for independent scoring.');
  }

  const n = applicationIds.length;
  const g = graderIds.length;

  // Build a pool of (n * 2) grader slots evenly distributed, then shuffle
  const slotsNeeded = n * 2;
  const pool: number[] = [];
  for (let i = 0; i < slotsNeeded; i++) {
    pool.push(graderIds[i % g]);
  }
  const shuffled = shuffle(pool);

  const assignments: Assignment[] = [];

  for (let i = 0; i < n; i++) {
    const appId = applicationIds[i];
    const first = shuffled[i * 2];
    let second = shuffled[i * 2 + 1];

    // Ensure distinct graders for this application
    if (second === first) {
      // Find a swap target from remaining pool positions
      let swapped = false;
      for (let j = i * 2 + 2; j < shuffled.length; j++) {
        if (shuffled[j] !== first) {
          // Swap
          [shuffled[i * 2 + 1], shuffled[j]] = [shuffled[j], shuffled[i * 2 + 1]];
          second = shuffled[i * 2 + 1];
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        // Fallback: pick the next different grader in the original list
        const alt = graderIds.find((id) => id !== first);
        if (alt !== undefined) second = alt;
      }
    }

    assignments.push({ applicationId: appId, graderId: first });
    assignments.push({ applicationId: appId, graderId: second });
  }

  return assignments;
}
