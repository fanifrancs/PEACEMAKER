export function classifyMerge({ behind, ahead, changedFiles, conflictingFiles, forkPoint }) {
  const conflicts = conflictingFiles.length;
  const files = changedFiles.length;

  // Tier 3: No fork point always means critical
  if (!forkPoint) {
    return {
      tier: 3,
      reason: 'Critical divergence - merge too risky',
      riskLevel: 'CRITICAL',
      scores: computeScores(behind, files, conflicts),
    };
  }

  // Tier 3: Too far diverged
  if (behind > 100 || files > 100 || conflicts > 30) {
    return {
      tier: 3,
      reason: 'Critical divergence - merge too risky',
      riskLevel: 'CRITICAL',
      scores: computeScores(behind, files, conflicts),
    };
  }

  // Tier 1: Low divergence, no overlaps
  if (behind <= 10 && files <= 5 && conflicts === 0) {
    return {
      tier: 1,
      reason: 'Minor divergence - safe for direct merge',
      riskLevel: 'LOW',
      scores: computeScores(behind, files, conflicts),
    };
  }

  // Tier 2: Everything in between
  return {
    tier: 2,
    reason: 'Moderate divergence - intent replay recommended',
    riskLevel: 'MODERATE',
    scores: computeScores(behind, files, conflicts),
  };
}

function computeScores(behind, files, conflicts) {
  const divergence = Math.min(100, Math.round((behind / 100) * 100));
  const complexity = Math.min(100, Math.round((files / 100) * 100));
  const conflict = Math.min(100, Math.round((conflicts / 30) * 100));
  const overall = Math.round((divergence * 0.4 + complexity * 0.3 + conflict * 0.3));
  
  return { divergence, complexity, conflict, overall };
}

// Made with Bob
