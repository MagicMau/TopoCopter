function appendUnique(targetIds, seenIds, value) {
  if (typeof value !== 'string' || seenIds.has(value)) {
    return;
  }

  seenIds.add(value);
  targetIds.push(value);
}

export function flattenQuizSetTargetIds(quizSet) {
  const targetIds = [];
  const seenIds = new Set();

  if (Array.isArray(quizSet?.targets)) {
    quizSet.targets.forEach((targetId) => appendUnique(targetIds, seenIds, targetId));
  }

  if (quizSet?.targetsByCategory && typeof quizSet.targetsByCategory === 'object') {
    Object.values(quizSet.targetsByCategory).forEach((targetGroup) => {
      if (!Array.isArray(targetGroup)) {
        return;
      }

      targetGroup.forEach((targetId) => appendUnique(targetIds, seenIds, targetId));
    });
  }

  return targetIds;
}

export function normalizeQuizSet(quizSet) {
  const targets = flattenQuizSetTargetIds(quizSet);

  return {
    ...quizSet,
    targets,
    targetCount: targets.length,
  };
}

export function normalizeQuizSetsData(quizSetsData) {
  const sets = Array.isArray(quizSetsData?.sets)
    ? quizSetsData.sets.map((quizSet) => normalizeQuizSet(quizSet))
    : [];

  return {
    ...quizSetsData,
    sets,
  };
}
