(function (global) {
  "use strict";

  const EMPTY_DATA = { categories: [], exercises: [], workouts: [] };

  function parseExport(payload) {
    if (!payload || !Array.isArray(payload.Data)) {
      throw new Error("This does not look like a FitNotes export. Choose a .fnw backup file.");
    }

    const collections = payload.Data.filter((item) =>
      item &&
      Array.isArray(item.Categories) &&
      Array.isArray(item.ExerciseDefinitions) &&
      Array.isArray(item.WorkoutInstances)
    );
    if (!collections.length) {
      throw new Error("This FitNotes export is missing its workout or exercise data.");
    }

    const categories = new Map();
    const definitions = new Map();
    for (const collection of collections) {
      for (const category of collection.Categories) {
        if (typeof category.Id === "string" && typeof category.Name === "string") {
          categories.set(category.Id, { id: category.Id, name: category.Name });
        }
      }
      for (const exercise of collection.ExerciseDefinitions) {
        if (typeof exercise.Id === "string" && typeof exercise.Name === "string") {
          definitions.set(exercise.Id, exercise);
        }
      }
    }

    const workouts = [];
    for (const collection of collections) {
      for (const workout of collection.WorkoutInstances) {
        const date = typeof workout.StartTime === "string" ? workout.StartTime.slice(0, 10) : "";
        if (!workout.Id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) continue;

        const exercises = [];
        for (const superset of Array.isArray(workout.SuperSets) ? workout.SuperSets : []) {
          for (const entry of Array.isArray(superset.Exercises) ? superset.Exercises : []) {
            const definition = definitions.get(entry.DefinitionId);
            const sets = (Array.isArray(entry.SetDetails) ? entry.SetDetails : [])
              .filter((set) => set && set.Status === 1)
              .map((set) => ({
                reps: finiteNonNegative(set.Primary),
                load: finiteNonNegative(set.Secondary),
              }));
            if (!sets.length) continue;

            exercises.push({
              id: typeof entry.DefinitionId === "string" ? entry.DefinitionId : "",
              name: definition?.Name || "Unnamed exercise",
              categoryIds: Array.isArray(definition?.CategoryIds)
                ? [...new Set(definition.CategoryIds.filter((id) => typeof id === "string"))]
                : [],
              sets,
            });
          }
        }
        if (exercises.length) {
          workouts.push({
            id: String(workout.Id),
            date,
            name: typeof workout.Name === "string" && workout.Name.trim() ? workout.Name : "Workout",
            exercises,
          });
        }
      }
    }

    return {
      categories: [...categories.values()],
      exercises: [...definitions.values()].map((exercise) => ({
        id: exercise.Id,
        name: exercise.Name,
        categoryIds: Array.isArray(exercise.CategoryIds)
          ? [...new Set(exercise.CategoryIds.filter((id) => typeof id === "string"))]
          : [],
      })),
      workouts,
    };
  }

  function finiteNonNegative(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function mergeData(current, incoming) {
    return {
      categories: mergeById(current.categories, incoming.categories),
      exercises: mergeById(current.exercises, incoming.exercises),
      workouts: mergeById(current.workouts, incoming.workouts),
    };
  }

  function mergeById(current = [], incoming = []) {
    const merged = new Map();
    for (const item of current) if (item && item.id) merged.set(item.id, item);
    for (const item of incoming) if (item && item.id) merged.set(item.id, item);
    return [...merged.values()];
  }

  function summarize(data = EMPTY_DATA) {
    const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]));
    const workouts = [...data.workouts].sort((a, b) => a.date.localeCompare(b.date));
    const dates = workouts.map((workout) => workout.date).filter(Boolean);
    const firstDate = dates[0] || "";
    const lastDate = dates[dates.length - 1] || "";
    const spanDays = dates.length
      ? Math.max(1, Math.round((Date.parse(`${lastDate}T12:00:00`) - Date.parse(`${firstDate}T12:00:00`)) / 86400000) + 1)
      : 0;
    const weeks = spanDays ? spanDays / 7 : 0;
    const muscleMap = new Map();
    const exerciseMap = new Map();
    const weeklyMap = new Map();
    let totalSets = 0;
    let totalMuscleSets = 0;

    for (const workout of workouts) {
      const weekStart = isoWeekStart(workout.date);
      const week = weeklyMap.get(weekStart) || { weekStart, workouts: 0, sets: 0, muscleSets: new Map() };
      week.workouts += 1;
      weeklyMap.set(weekStart, week);

      for (const entry of workout.exercises) {
        const exercise = exerciseMap.get(entry.id) || {
          id: entry.id,
          name: entry.name,
          totalSets: 0,
          workoutIds: new Set(),
          pointsByWorkout: new Map(),
          muscleIds: new Set(),
        };
        exercise.totalSets += entry.sets.length;
        exercise.workoutIds.add(workout.id);
        const load = Math.max(0, ...entry.sets.map((set) => set.load));
        if (load > 0) {
          const point = exercise.pointsByWorkout.get(workout.id) || { date: workout.date, load: 0 };
          point.load = Math.max(point.load, load);
          exercise.pointsByWorkout.set(workout.id, point);
        }
        exerciseMap.set(entry.id, exercise);

        const muscleIds = entry.categoryIds.length ? entry.categoryIds : ["__uncategorized__"];
        const credit = entry.sets.length;
        for (const muscleId of muscleIds) {
          const muscle = muscleMap.get(muscleId) || {
            id: muscleId,
            name: muscleId === "__uncategorized__" ? "Uncategorized" : (categoryNames.get(muscleId) || "Other"),
            sets: 0,
            exercises: new Map(),
          };
          muscle.sets += credit;
          muscle.exercises.set(entry.id, (muscle.exercises.get(entry.id) || 0) + credit);
          exercise.muscleIds.add(muscleId);
          muscleMap.set(muscleId, muscle);
          week.muscleSets.set(muscleId, (week.muscleSets.get(muscleId) || 0) + credit);
          totalMuscleSets += credit;
        }

        totalSets += entry.sets.length;
        week.sets += entry.sets.length;
      }
    }

    const muscles = [...muscleMap.values()]
      .map((muscle) => ({
        id: muscle.id,
        name: muscle.name,
        sets: muscle.sets,
        share: totalMuscleSets ? (muscle.sets / totalMuscleSets) * 100 : 0,
        setsPerWeek: weeks ? muscle.sets / weeks : 0,
        exercises: [...muscle.exercises.entries()]
          .map(([id, sets]) => ({
            id,
            name: exerciseMap.get(id)?.name || "Unnamed exercise",
            sets,
            workouts: exerciseMap.get(id)?.workoutIds.size || 0,
          }))
          .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));

    const exercises = [...exerciseMap.values()]
      .map((exercise) => {
        const points = [...exercise.pointsByWorkout.values()].sort((a, b) => a.date.localeCompare(b.date));
        return {
          id: exercise.id,
          name: exercise.name,
          totalSets: exercise.totalSets,
          workoutCount: exercise.workoutIds.size,
          muscleIds: [...exercise.muscleIds],
          points,
        };
      })
      .sort((a, b) => b.totalSets - a.totalSets || a.name.localeCompare(b.name));

    const weeklyActivity = [];
    if (firstDate && lastDate) {
      const lastWeek = isoWeekStart(lastDate);
      const activityByWeek = new Map([...weeklyMap.values()].map((week) => [week.weekStart, week]));
      const cursor = new Date(`${isoWeekStart(firstDate)}T12:00:00`);
      while (localDateKey(cursor) <= lastWeek) {
        const weekStart = localDateKey(cursor);
        const week = activityByWeek.get(weekStart);
        weeklyActivity.push({
          weekStart,
          workouts: week?.workouts || 0,
          sets: week?.sets || 0,
          muscleSets: Object.fromEntries(muscles.map((muscle) => [
            muscle.id,
            week?.muscleSets.get(muscle.id) || 0,
          ])),
        });
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    return {
      workoutCount: workouts.length,
      totalSets,
      exerciseCount: exercises.length,
      firstDate,
      lastDate,
      weeks,
      muscles,
      exercises,
      weeklyActivity,
    };
  }

  function isoWeekStart(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const weekday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - weekday);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  global.fitNotesAnalytics = Object.freeze({ parseExport, mergeData, summarize, emptyData: () => ({ ...EMPTY_DATA }) });
})(window);
